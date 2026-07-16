"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/web/lib/cn";
import { useCart, useCartWithServices } from "./CartContext";

// Guest checkout with USDT (BEP20) payment.
//
// Flow:
//   1. User enters email + per-item target URL + optional notes
//   2. Click "Continue to payment" → POST /api/services/order
//   3. Server re-prices, creates DB order (status=awaiting_payment),
//      returns { orderRef, walletAddress, amountUsdt }
//   4. UI shows QR + wallet address + amount + tx-hash input
//   5. User pays USDT on BEP20, pastes tx hash, clicks Verify
//   6. POST /api/services/verify → BscScan check → status=paid on success
//   7. Success screen with order ref for support lookups
//
// No login. No payment gateway. Straight to on-chain verification.

interface OrderResponse {
  ok: boolean;
  orderRef?: string;
  walletAddress?: string;
  network?: string;
  token?: string;
  amountUsdt?: number;
  totalUsd?: number;
  error?: string;
}

interface VerifyResponse {
  ok: boolean;
  status?: string;
  error?: string;
  detail?: string;
  message?: string;
  amountReceivedUsdt?: number;
  fromAddress?: string;
  chain?: "bsc" | "ethereum" | "polygon";
  explorerUrl?: string;
  via?: "onchain" | "binance";
  transferType?: "onchain" | "internal";
  network?: string;
  telegramUrl?: string;
}

interface StatusResponse {
  ok: boolean;
  orderRef?: string;
  status?: string;
  maskedEmail?: string;
  amountUsdt?: number;
  amountReceivedUsdt?: number | null;
  walletAddress?: string;
  network?: string;
  hasTxHash?: boolean;
  verifiedAt?: string | null;
  lastError?: string | null;
  error?: string;
}

const CHAIN_LABEL: Record<string, string> = {
  bsc: "BNB Smart Chain (BEP20)",
  ethereum: "Ethereum (ERC20)",
  polygon: "Polygon",
};

interface FieldErrors {
  email?: string;
  items?: Record<string, string>;
  general?: string;
}

type Stage = "form" | "pay" | "verifying" | "pending_manual" | "paid";

export function CheckoutPage() {
  const { rows } = useCartWithServices();
  const { totalUsd, hydrated, clear } = useCart();

  const [stage, setStage] = useState<Stage>("form");
  const [email, setEmail] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // Payment state (populated after "Continue to payment" succeeds)
  const [order, setOrder] = useState<{
    orderRef: string;
    walletAddress: string;
    amountUsdt: number;
    totalUsd: number;
  } | null>(null);
  const [txHash, setTxHash] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyDetail, setVerifyDetail] = useState<string | null>(null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyResponse | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  // Polling controls — active whenever we're waiting on server state
  // (submitted verify but no answer yet, or manual review pending).
  // Persist orderRef in URL so a refresh resumes the flow. We also
  // mirror it in localStorage as a belt-and-suspenders in case a
  // browser strips query params on reload (some in-app browsers do).
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Apply a server-side status snapshot to local state. Called by both
  // the initial resume-on-mount fetch and the polling loop.
  const applyStatus = useCallback(
    (s: StatusResponse) => {
      if (!s.ok || !s.orderRef || !s.status) return;
      if (s.walletAddress && s.amountUsdt != null) {
        setOrder({
          orderRef: s.orderRef,
          walletAddress: s.walletAddress,
          amountUsdt: s.amountUsdt,
          totalUsd: s.amountUsdt, // display only
        });
      }
      if (s.maskedEmail) setMaskedEmail(s.maskedEmail);
      if (
        s.status === "paid" ||
        s.status === "fulfilling" ||
        s.status === "delivered"
      ) {
        setStage("paid");
        setVerified({
          ok: true,
          status: s.status,
          amountReceivedUsdt: s.amountReceivedUsdt ?? undefined,
        });
        stopPolling();
        clear();
        // Also drop the ?ref= now that the flow is complete so a
        // deep-link share doesn't perpetually resume someone else.
        if (typeof window !== "undefined") {
          const u = new URL(window.location.href);
          u.searchParams.delete("ref");
          window.history.replaceState(null, "", u.toString());
          try {
            localStorage.removeItem("dc.services.lastOrderRef");
          } catch {
            // storage may be disabled — non-fatal
          }
        }
      } else if (s.status === "pending_manual") {
        setStage("pending_manual");
      } else if (s.status === "verifying") {
        setStage("verifying");
      } else {
        // awaiting_payment / failed / refunded — stay on pay screen
        setStage("pay");
      }
    },
    [clear, stopPolling],
  );

  const fetchStatus = useCallback(
    async (ref: string): Promise<StatusResponse | null> => {
      try {
        const res = await fetch(
          `/api/services/order/status?ref=${encodeURIComponent(ref)}`,
          { cache: "no-store" },
        );
        const body = (await res.json()) as StatusResponse;
        return body;
      } catch {
        return null;
      }
    },
    [],
  );

  // ── Resume on mount: URL ?ref=DC-XXXXXXXX or localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    let ref = url.searchParams.get("ref");
    if (!ref) {
      try {
        ref = localStorage.getItem("dc.services.lastOrderRef");
      } catch {
        ref = null;
      }
    }
    if (!ref || !/^DC-[A-F0-9]{8}$/i.test(ref)) return;
    (async () => {
      const s = await fetchStatus(ref);
      if (s?.ok) applyStatus(s);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Poll while waiting: verifying + pending_manual
  useEffect(() => {
    if (!order?.orderRef) return;
    if (stage !== "verifying" && stage !== "pending_manual") {
      stopPolling();
      return;
    }
    // 6s cadence — fast enough that admin-approve → user-sees-success
    // feels "live" without hammering the server.
    stopPolling();
    pollTimer.current = setInterval(async () => {
      const s = await fetchStatus(order.orderRef);
      if (s?.ok) applyStatus(s);
    }, 6000);
    return stopPolling;
  }, [stage, order?.orderRef, fetchStatus, applyStatus, stopPolling]);

  if (!hydrated) {
    return (
      <div className="container py-12 max-w-3xl text-center text-muted-foreground text-sm">
        Loading checkout…
      </div>
    );
  }

  // Only show empty-cart when there really is no active flow. If we
  // have an order (e.g. resumed from ?ref= or pending_manual polling),
  // the cart being empty is expected — the user has already checked out.
  if (rows.length === 0 && !order && stage === "form") {
    return (
      <div className="container py-16 max-w-2xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Your cart is empty
        </h1>
        <Link
          href="/services"
          className="inline-flex items-center gap-2 mt-6 rounded-full bg-gradient-ig text-white px-6 py-3 text-sm font-semibold hover:brightness-110 transition"
        >
          Browse services →
        </Link>
      </div>
    );
  }

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      e.email = "Enter a valid email so we can send order updates.";
    }
    const itemErrors: Record<string, string> = {};
    for (const { item, service } of rows) {
      const url = (targets[item.serviceId] ?? "").trim();
      if (!url) {
        itemErrors[item.serviceId] = `Add the ${service.platform} URL/handle for this service.`;
      }
    }
    if (Object.keys(itemErrors).length > 0) e.items = itemErrors;
    return e;
  };

  const handleContinue = async () => {
    const e = validate();
    setErrors(e);
    if (e.email || (e.items && Object.keys(e.items).length > 0)) return;

    try {
      const res = await fetch("/api/services/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          notes: notes.trim() || undefined,
          items: rows.map(({ item }) => ({
            serviceId: item.serviceId,
            qty: item.qty,
            targetUrl: (targets[item.serviceId] ?? "").trim(),
          })),
        }),
      });
      const body = (await res.json()) as OrderResponse;
      if (!body.ok || !body.orderRef || !body.walletAddress || body.amountUsdt == null) {
        setErrors({ general: body.error ?? "Couldn't create order. Try again." });
        return;
      }
      setOrder({
        orderRef: body.orderRef,
        walletAddress: body.walletAddress,
        amountUsdt: body.amountUsdt,
        totalUsd: body.totalUsd ?? body.amountUsdt,
      });
      setStage("pay");
      // Persist orderRef in URL + localStorage so a refresh (or
      // returning to this page later) resumes exactly where we left
      // off. This is the "we already captured your details" backing
      // — the DB has the order, the URL points at it, and the poller
      // will pick up any admin-side status change.
      if (typeof window !== "undefined") {
        const u = new URL(window.location.href);
        u.searchParams.set("ref", body.orderRef);
        window.history.replaceState(null, "", u.toString());
        try {
          localStorage.setItem("dc.services.lastOrderRef", body.orderRef);
        } catch {
          // storage may be disabled — non-fatal, URL is the primary channel
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : "Network error" });
    }
  };

  const handleVerify = async () => {
    if (!order) return;
    // Accept both on-chain 0x hashes (66 chars) AND Binance internal
    // transfer identifiers like "Off-chain Transfer 391913…". Only
    // reject the obviously-too-short. Server does the real matching.
    const cleanTx = txHash.trim();
    if (cleanTx.length < 6) {
      setVerifyError("Paste a transaction hash or Binance transfer ID.");
      return;
    }
    setVerifyError(null);
    setVerifyDetail(null);
    setTelegramUrl(null);
    setStage("verifying");
    try {
      const res = await fetch("/api/services/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderRef: order.orderRef, txHash: cleanTx }),
      });
      const body = (await res.json()) as VerifyResponse;
      if (body.ok && body.status === "paid") {
        setVerified(body);
        setStage("paid");
        clear();
      } else if (body.ok && body.status === "pending_manual") {
        // Autoverify didn't catch it — order is now sitting in
        // pending_manual on the server, waiting for admin to confirm
        // via the Telegram screenshot the user sends. Show the
        // manual-review screen; the poller will flip to "paid" when
        // admin approves.
        setPendingMessage(body.message ?? null);
        if (body.detail) setVerifyDetail(body.detail);
        if (body.telegramUrl) setTelegramUrl(body.telegramUrl);
        setStage("pending_manual");
      } else {
        setVerifyError(body.error ?? "Verification failed. Please check your tx hash.");
        if (body.detail) setVerifyDetail(body.detail);
        if (body.telegramUrl) setTelegramUrl(body.telegramUrl);
        setStage("pay");
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Network error");
      setStage("pay");
    }
  };

  // ── Pending manual review ────────────────────────────────────────────
  // Reached when autoverify (on-chain + Binance) couldn't match the
  // deposit. Order is server-side `pending_manual`; the poller keeps
  // checking status and will auto-advance to "paid" the moment admin
  // approves in the admin panel. User can safely close the page.
  if (stage === "pending_manual" && order) {
    return (
      <div className="container py-12 max-w-2xl">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6 sm:p-10 text-center">
          <div className="text-5xl mb-3">
            <span className="inline-block animate-pulse">🔄</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Processing your payment
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
            {pendingMessage ??
              "We couldn't auto-verify this transaction, but your submission is saved. Our team will manually confirm it within 15 minutes."}
          </p>
          <div className="rounded-lg border border-border bg-background/60 p-4 mt-6 max-w-md mx-auto text-left space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Order</span>
              <b className="tabular-nums">{order.orderRef}</b>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Amount</span>
              <b className="tabular-nums">{order.amountUsdt.toFixed(2)} USDT</b>
            </div>
            {maskedEmail && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Email</span>
                <b>{maskedEmail}</b>
              </div>
            )}
            {txHash && (
              <div className="flex justify-between text-xs gap-3">
                <span className="text-muted-foreground shrink-0">Tx</span>
                <span className="font-mono break-all text-right">{txHash}</span>
              </div>
            )}
          </div>
          {telegramUrl && (
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 rounded-lg bg-[#229ED9] text-white px-6 py-3 text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-[#229ED9]/20"
            >
              <TelegramIcon /> Send screenshot on Telegram (speeds it up)
            </a>
          )}
          <div className="mt-6 rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-foreground/80 leading-relaxed max-w-md mx-auto">
            ✅ Your submission is saved — closing this page won&apos;t cancel
            verification. We&apos;ll email you at the address on your order
            the moment it&apos;s confirmed. You can re-open this exact page
            any time by keeping the URL bookmarked.
          </div>
          {verifyDetail && (
            <details className="mt-4 max-w-md mx-auto text-left">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                Technical details
              </summary>
              <div className="mt-2 text-[10px] text-muted-foreground font-mono break-words rounded bg-background/60 p-2">
                {verifyDetail}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  }

  // ── Success screen ───────────────────────────────────────────────────
  if (stage === "paid" && order) {
    return (
      <div className="container py-12 max-w-2xl">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-6 sm:p-10 text-center">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Payment received
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
            Your order <b className="text-foreground">{order.orderRef}</b> is
            confirmed. Delivery starts within the ETA shown on each service.
            We&apos;ll email you at <b>{email}</b> when it&apos;s complete.
          </p>
          {verified?.amountReceivedUsdt != null && (
            <div className="text-xs text-muted-foreground mt-4">
              Received: <b>{verified.amountReceivedUsdt.toFixed(2)} USDT</b>
              {verified.chain ? ` on ${CHAIN_LABEL[verified.chain] ?? verified.chain}` : ""}
              {verified.via === "binance" && (
                <span className="ml-1">
                  {verified.transferType === "internal"
                    ? "(via Binance internal transfer)"
                    : verified.network
                      ? `(via Binance on ${verified.network})`
                      : "(via Binance)"}
                </span>
              )}
            </div>
          )}
          {verified?.explorerUrl && (
            <div className="text-xs mt-1">
              <a href={verified.explorerUrl} target="_blank" rel="noopener noreferrer" className="underline text-muted-foreground hover:text-foreground">
                View on-chain →
              </a>
            </div>
          )}
          <div className="mt-8 flex gap-2 justify-center">
            <Link
              href="/services"
              className="text-sm px-5 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors font-medium"
            >
              Order another
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment screen ───────────────────────────────────────────────────
  if (stage === "pay" || stage === "verifying") {
    if (!order) return null;
    // qrserver.com free QR generator — public utility, no key needed
    const qrData = order.walletAddress;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=280x280&margin=8`;

    return (
      <div className="container py-8 lg:py-10 max-w-3xl">
        <header className="mb-6">
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">
            Payment · Order {order.orderRef}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Pay <span className="tabular-nums">{order.amountUsdt.toFixed(2)} USDT</span> to complete
          </h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
            Send exactly <b className="text-foreground tabular-nums">{order.amountUsdt.toFixed(2)} USDT</b> to
            the wallet below on <b className="text-foreground">BEP20 (recommended)</b>,{" "}
            <b className="text-foreground">ERC20</b>, or <b className="text-foreground">Polygon</b>.
            Same address works on all three. Paste your transaction hash
            and we&apos;ll auto-detect the chain and verify.
          </p>
        </header>

        <div className="grid md:grid-cols-[280px_1fr] gap-6 mb-6">
          {/* QR */}
          <div className="rounded-xl border border-border bg-white p-3 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="USDT BEP20 wallet QR code"
              width={260}
              height={260}
              className="w-full h-auto max-w-[260px]"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Details */}
          <div className="space-y-4">
            <DetailRow label="Network" value="BEP20 · ERC20 · Polygon" />
            <DetailRow label="Token" value="USDT" />
            <DetailRow
              label="Amount"
              value={`${order.amountUsdt.toFixed(2)} USDT`}
              mono
              copyable
              highlight
            />
            <DetailRow
              label="Wallet address"
              value={order.walletAddress}
              mono
              copyable
              wrap
            />
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-foreground/80 leading-relaxed">
              ⚠️ Send USDT on <b>BEP20 / ERC20 / Polygon</b> only.
              TRC20 (Tron) or Solana USDT go to a different address and
              are not currently supported. If your wallet asks for a
              memo/tag, leave it blank.
            </div>
          </div>
        </div>

        {/* Tx hash input */}
        <div className="rounded-xl border border-border bg-card/60 p-5 sm:p-6 mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            After paying, paste your transaction hash
          </h2>
          <input
            type="text"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="0x… (or Binance transfer ID)"
            spellCheck={false}
            autoCapitalize="off"
            className={cn(
              "h-11 w-full rounded-lg border bg-background/80 px-3 text-sm font-mono outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 transition-all",
              verifyError ? "border-destructive" : "border-input",
            )}
          />
          <div className="text-[11px] text-muted-foreground mt-1.5">
            From your wallet: a 66-char <code className="font-mono">0x…</code> hash.{" "}
            From a Binance internal transfer: the ID like{" "}
            <code className="font-mono">Off-chain Transfer 391913…</code>{" "}
            (both work — we detect automatically).
          </div>
          {verifyError && (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <div className="text-xs text-destructive font-medium">{verifyError}</div>
              {verifyDetail && (
                <div className="text-[10px] text-muted-foreground font-mono break-words">
                  {verifyDetail}
                </div>
              )}
              {telegramUrl && (
                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] text-white px-4 py-2 text-xs font-semibold hover:brightness-110 transition"
                >
                  <TelegramIcon /> Send screenshot on Telegram
                </a>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleVerify}
          disabled={stage === "verifying"}
          className={cn(
            "w-full py-4 rounded-lg text-base font-semibold shadow-lg shadow-primary/20 transition-all",
            stage === "verifying"
              ? "bg-muted text-muted-foreground cursor-wait"
              : "bg-gradient-ig text-white hover:brightness-110",
          )}
        >
          {stage === "verifying" ? "Verifying on-chain…" : "I've paid — verify now"}
        </button>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          Keep this page open — we&apos;ll show a confirmation as soon as
          your transaction confirms.
          <br />
          Order reference: <b className="text-foreground">{order.orderRef}</b>{" "}
          — save this to reach out if anything goes wrong.
        </div>
      </div>
    );
  }

  // ── Contact + delivery form (default stage) ──────────────────────────
  return (
    <div className="container py-8 lg:py-10 max-w-3xl">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">
          Checkout
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Almost done
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          Tell us where to deliver each service and where to send your
          confirmation. Pay with USDT (BEP20 / ERC20 / Polygon) — no account needed.
        </p>
      </header>

      {errors.general && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive mb-4">
          {errors.general}
        </div>
      )}

      {/* Contact */}
      <section className="rounded-xl border border-border bg-card/60 p-5 sm:p-6 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Contact
        </h2>
        <label className="block">
          <div className="text-xs font-medium mb-1">Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={cn(
              "h-11 w-full rounded-lg border bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 transition-all",
              errors.email ? "border-destructive" : "border-input",
            )}
          />
          {errors.email && (
            <div className="text-xs text-destructive mt-1">{errors.email}</div>
          )}
          <div className="text-[11px] text-muted-foreground mt-1">
            We&apos;ll email you order confirmation + delivery status.
          </div>
        </label>
      </section>

      {/* Per-item target URLs */}
      <section className="rounded-xl border border-border bg-card/60 p-5 sm:p-6 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Delivery details
        </h2>
        <div className="space-y-4">
          {rows.map(({ item, service, price }) => {
            const err = errors.items?.[item.serviceId];
            return (
              <div
                key={item.serviceId}
                className="rounded-lg border border-border/60 bg-background/40 p-4"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-9 w-9 rounded-md grid place-items-center text-white text-base shadow-sm shrink-0 bg-gradient-ig">
                    {service.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{service.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {item.qty.toLocaleString()} units ·{" "}
                      <b className="tabular-nums">${price.toFixed(2)}</b>
                    </div>
                  </div>
                </div>
                <label className="block">
                  <div className="text-xs font-medium mb-1">
                    {targetLabel(service.platform, service.category)}
                  </div>
                  <input
                    type="text"
                    value={targets[item.serviceId] ?? ""}
                    onChange={(e) =>
                      setTargets((prev) => ({ ...prev, [item.serviceId]: e.target.value }))
                    }
                    placeholder={targetPlaceholder(service.platform, service.category)}
                    className={cn(
                      "h-10 w-full rounded-lg border bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60 transition-all",
                      err ? "border-destructive" : "border-input",
                    )}
                  />
                  {err && <div className="text-xs text-destructive mt-1">{err}</div>}
                </label>
              </div>
            );
          })}
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-xl border border-border bg-card/60 p-5 sm:p-6 mb-4">
        <label className="block">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Notes for our team (optional)
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Any special instructions?"
            className="w-full rounded-lg border border-input bg-background/80 px-3 py-2 text-sm outline-none focus-visible:border-primary/60 transition-all resize-none"
          />
        </label>
      </section>

      {/* Total + continue */}
      <section className="rounded-xl border border-primary/40 bg-primary/5 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Order total
            </div>
            <div className="text-3xl font-bold tabular-nums">
              ${totalUsd.toFixed(2)}
            </div>
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            Payable in USDT
            <br />
            on BEP20 / ERC20 / Polygon
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            href="/services/cart"
            className="flex-1 sm:flex-none text-center px-5 py-3 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium"
          >
            ← Edit cart
          </Link>
          <button
            type="button"
            onClick={handleContinue}
            className="flex-1 text-center px-5 py-3 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity text-sm font-semibold shadow-md"
          >
            Continue to payment →
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Detail row for the payment card ─────────────────────────────────────
function DetailRow({
  label,
  value,
  mono,
  copyable,
  wrap,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  wrap?: boolean;
  highlight?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard may be blocked — fall back silently
    }
  };
  return (
    <div className={cn("rounded-lg border p-3", highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background/40")}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <div className={cn("flex-1 text-sm", mono && "font-mono", wrap ? "break-all" : "", highlight && "font-bold tabular-nums")}>
          {value}
        </div>
        {copyable && (
          <button
            type="button"
            onClick={copy}
            className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-muted transition-colors"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────
function targetLabel(platform: string, category: string): string {
  if (category === "followers") return `${cap(platform)} profile URL or @handle`;
  if (category === "views" || category === "likes" || category === "comments" || category === "saves" || category === "reach" || category === "reposts") {
    return `${cap(platform)} post/video URL`;
  }
  if (category === "story_views") return "Instagram profile @handle (username only)";
  if (category === "live") return `${cap(platform)} live stream URL`;
  if (category === "watch_hours") return "YouTube video URL (60+ min)";
  if (category === "members") return "Instagram Broadcast Channel URL";
  return `${cap(platform)} URL`;
}

function targetPlaceholder(platform: string, category: string): string {
  if (platform === "instagram" && category === "followers") return "https://instagram.com/username";
  if (platform === "instagram") return "https://instagram.com/p/POSTID";
  if (platform === "tiktok" && category === "followers") return "https://tiktok.com/@username";
  if (platform === "tiktok") return "https://tiktok.com/@username/video/1234";
  if (platform === "youtube" && category === "views") return "https://youtube.com/watch?v=XXXX";
  if (platform === "youtube" && category === "live") return "https://youtube.com/live/XXXX";
  if (platform === "youtube") return "https://youtube.com/@channel";
  if (platform === "facebook") return "https://facebook.com/pagename";
  return "https://…";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Telegram paper-plane icon — 16px inline SVG so the fallback button
// looks like a real Telegram CTA without an image request.
function TelegramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.24 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  );
}
