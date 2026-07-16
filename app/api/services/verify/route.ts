import { NextResponse } from "next/server";
import { supabaseService } from "@/core/database/supabase";
import { verifyUsdtPayment } from "@/core/services/payment";
import { verifyBinanceDeposit } from "@/core/services/binance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/services/verify
// Body: { orderRef, txHash }
//
// Response shapes:
//   { ok: true, status: 'paid', ... }      — verified, order marked paid
//   { ok: false, status: 'failed', ... }   — verification failed with reason
//   { ok: false, error: '...' }            — pre-verification error (bad ref, already paid, etc.)

interface Body {
  orderRef?: string;
  txHash?: string;
}

// Build the Telegram deep link the checkout falls back to when neither
// on-chain nor Binance verification succeeds. TELEGRAM_SUPPORT_USERNAME
// env var holds our support handle without the leading @. The message
// pre-fills with everything we need to verify manually so the customer
// can send it in one tap.
function telegramFallbackUrl(
  orderRef: string,
  amountUsdt: number,
  txHash: string,
): string | null {
  const username = process.env.TELEGRAM_SUPPORT_USERNAME;
  if (!username) return null;
  const text = encodeURIComponent(
    `Hi, I paid for order ${orderRef} (${amountUsdt.toFixed(2)} USDT).\n` +
      `Transaction/Transfer ID: ${txHash}\n` +
      `Attaching my payment screenshot for manual verification.`,
  );
  return `https://t.me/${username.replace(/^@/, "")}?text=${text}`;
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const body = raw as Body;
  const orderRef = (body.orderRef ?? "").trim().toUpperCase();
  const txHash = (body.txHash ?? "").trim();

  if (!/^DC-[A-F0-9]{8}$/.test(orderRef)) {
    return NextResponse.json({ ok: false, error: "Invalid order reference" }, { status: 400 });
  }
  // Loosened tx-hash validation. On-chain hashes are 66-char 0x…, but
  // Binance internal transfers use identifiers like
  // "Off-chain Transfer 391913256522" — we still accept those and let
  // the Binance verifier do the match.
  if (!txHash || txHash.length < 6) {
    return NextResponse.json(
      { ok: false, error: "Please paste a transaction hash or Binance transfer ID." },
      { status: 400 },
    );
  }
  const isOnchainHash = /^0x[a-f0-9]{64}$/i.test(txHash);

  const supa = supabaseService();

  // Load order.
  const { data: order, error: readErr } = await supa
    .from("service_orders")
    .select(
      "id, order_ref, status, wallet_address, total_usdt, created_at, tx_hash, network",
    )
    .eq("order_ref", orderRef)
    .maybeSingle();

  if (readErr) {
    console.error("[services/verify] read failed:", readErr.message);
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
  }
  if (order.status === "paid" || order.status === "fulfilling" || order.status === "delivered") {
    return NextResponse.json({
      ok: true,
      status: order.status,
      message: "Order already verified.",
    });
  }
  if (order.status === "refunded" || order.status === "failed") {
    return NextResponse.json(
      { ok: false, error: `Order is ${order.status} — contact support.` },
      { status: 400 },
    );
  }

  // Prevent replay across orders. Only enforce on real on-chain
  // hashes — Binance internal transfer IDs are opaque and we don't
  // want to false-positive collision on partial-string matches.
  const txHashLower = txHash.toLowerCase();
  if (order.tx_hash && order.tx_hash.toLowerCase() !== txHashLower) {
    return NextResponse.json(
      { ok: false, error: "A different tx hash was already submitted for this order." },
      { status: 400 },
    );
  }
  if (isOnchainHash) {
    const { data: dup } = await supa
      .from("service_orders")
      .select("order_ref")
      .ilike("tx_hash", txHashLower)
      .neq("order_ref", orderRef)
      .maybeSingle();
    if (dup) {
      return NextResponse.json(
        { ok: false, error: "This transaction is already linked to another order." },
        { status: 400 },
      );
    }
  }

  // Flip to verifying while we call the explorers. If they're slow we
  // still return within the timeout — the status stays "verifying"
  // and the client can retry. Store the raw text (may be a 0x hash
  // OR "Off-chain Transfer 391913…").
  await supa
    .from("service_orders")
    .update({ status: "verifying", tx_hash: txHash })
    .eq("id", order.id);

  const orderCreatedSec = Math.floor(new Date(order.created_at).getTime() / 1000);

  // ── STAGE 1: on-chain verification (BSC / Ethereum / Polygon) ──
  //
  // Only meaningful if the user gave us a proper 66-char 0x hash.
  // Internal-transfer IDs like "Off-chain Transfer 391913256522" skip
  // straight to stage 2 since block explorers have nothing to show.
  let onchainReason: string | undefined;
  if (isOnchainHash) {
    const verdict = await verifyUsdtPayment({
      txHash,
      expectedRecipient: order.wallet_address,
      expectedAmountUsdt: Number(order.total_usdt),
      minTimestampSec: orderCreatedSec - 30 * 60,
    });
    if (verdict.ok) {
      await supa
        .from("service_orders")
        .update({
          status: "paid",
          tx_verified_at: new Date().toISOString(),
          amount_received_usdt: verdict.amountReceivedUsdt ?? null,
          from_address: verdict.fromAddress ?? null,
          tx_verification_error: null,
          network: verdict.chain ?? order.network,
        })
        .eq("id", order.id);
      return NextResponse.json({
        ok: true,
        status: "paid",
        via: "onchain",
        chain: verdict.chain,
        amountReceivedUsdt: verdict.amountReceivedUsdt,
        fromAddress: verdict.fromAddress,
        explorerUrl: verdict.explorerUrl,
      });
    }
    onchainReason = verdict.reason;
  }

  // ── STAGE 2: Binance deposit-history API ──
  //
  // Catches (a) internal Binance-to-Binance transfers that never touch
  // the blockchain, and (b) real on-chain deposits that Binance has
  // credited but the block explorer hasn't indexed yet.
  const binanceVerdict = await verifyBinanceDeposit({
    expectedRecipient: order.wallet_address,
    expectedAmountUsdt: Number(order.total_usdt),
    createdAtSec: orderCreatedSec,
    txHash: isOnchainHash ? txHash : undefined,
  });
  if (binanceVerdict.ok) {
    const detectedNetwork = binanceVerdict.network?.toLowerCase() ?? order.network;
    // Dedup: refuse to unlock a second order using the same Binance
    // deposit. The 7-day search window is wide enough that without this
    // check, a $0.10 payment could satisfy any number of $0.10 orders.
    if (binanceVerdict.txId) {
      const { data: dup } = await supa
        .from("service_orders")
        .select("order_ref")
        .eq("tx_hash", binanceVerdict.txId)
        .neq("order_ref", orderRef)
        .maybeSingle();
      if (dup) {
        await supa
          .from("service_orders")
          .update({
            status: "awaiting_payment",
            tx_verification_error: `Binance deposit ${binanceVerdict.txId} is already linked to ${dup.order_ref}.`,
          })
          .eq("id", order.id);
        return NextResponse.json(
          {
            ok: false,
            status: "failed",
            error: `This Binance deposit is already linked to order ${dup.order_ref}. Send a new deposit for this order.`,
          },
          { status: 400 },
        );
      }
    }
    await supa
      .from("service_orders")
      .update({
        status: "paid",
        tx_verified_at: new Date().toISOString(),
        amount_received_usdt: binanceVerdict.amountReceivedUsdt ?? null,
        tx_verification_error: null,
        network: detectedNetwork,
        // Persist Binance's txId (may be "Internal transfer XXXXX" for
        // off-chain) so the admin can look it up later.
        tx_hash: binanceVerdict.txId ?? txHash,
      })
      .eq("id", order.id);
    return NextResponse.json({
      ok: true,
      status: "paid",
      via: "binance",
      transferType: binanceVerdict.transferType,
      network: binanceVerdict.network,
      amountReceivedUsdt: binanceVerdict.amountReceivedUsdt,
    });
  }

  // ── Both stages failed → classify: rejection vs pending_manual ──
  //
  // The distinction matters for UX. If we can PROVE the tx is wrong
  // (recipient / amount / token / age doesn't match), we reject with
  // a red highlighted error so the user retries with the right one.
  // If we simply can't determine — tx not yet indexed, Binance can't
  // see the address — we fall through to pending_manual and let the
  // user resolve via Telegram screenshot.
  const combinedReason = [
    onchainReason ? `On-chain: ${onchainReason}` : null,
    `Binance: ${binanceVerdict.reason}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const rejection = classifyRejection(onchainReason, binanceVerdict.reason ?? "");
  if (rejection) {
    // Order goes BACK to awaiting_payment so the user can retry the
    // input immediately — no admin involvement, no support ticket.
    await supa
      .from("service_orders")
      .update({
        status: "awaiting_payment",
        tx_verification_error: combinedReason.slice(0, 500),
      })
      .eq("id", order.id);
    return NextResponse.json({
      ok: false,
      status: "rejected",
      error: rejection.userMessage,
      detail: combinedReason,
    });
  }

  // Ambiguous — we don't KNOW the tx is wrong, we just can't confirm
  // it yet. Send them to Telegram fallback. Order sits in
  // pending_manual until admin approves via the admin panel; the
  // checkout page's poll flips to ✅ automatically when that happens.
  await supa
    .from("service_orders")
    .update({
      status: "pending_manual",
      tx_verification_error: combinedReason.slice(0, 500),
    })
    .eq("id", order.id);

  const telegramUrl = telegramFallbackUrl(
    orderRef,
    Number(order.total_usdt),
    txHash,
  );

  return NextResponse.json({
    ok: true,
    status: "pending_manual",
    message:
      "Your submission is saved. We couldn't auto-verify this transaction, but our team will confirm it manually within 15 minutes. Send us a screenshot on Telegram to speed it up — you can safely close this page, we'll email you when it's done.",
    detail: combinedReason,
    telegramUrl,
  });
}

// Classify a failure. Returns { userMessage } if the transaction is
// PROVABLY wrong (user should retry with the correct one); returns
// null when we honestly don't know (fall through to pending_manual).
//
// Matching is done on substring keywords from the exact reasons
// verifyUsdtPayment / verifyBinanceDeposit produce — kept in sync
// with the strings in core/services/payment.ts + core/services/binance.ts.
function classifyRejection(
  onchainReason: string | undefined,
  binanceReason: string,
): { userMessage: string } | null {
  const combined = `${onchainReason ?? ""} | ${binanceReason}`.toLowerCase();

  // On-chain unambiguously wrong tx.
  if (onchainReason) {
    const r = onchainReason.toLowerCase();
    if (r.includes("format is invalid")) {
      return {
        userMessage:
          "That doesn't look like a valid transaction hash. Copy the exact 66-character 0x… hash from your wallet, or paste your Binance transfer ID.",
      };
    }
    if (r.includes("failed on-chain")) {
      return {
        userMessage:
          "That transaction failed on-chain — the transfer never actually completed. Send the payment again and paste the new hash.",
      };
    }
    if (r.includes("doesn't contain a usdt transfer")) {
      return {
        userMessage:
          "That transaction doesn't send USDT to our wallet. Double-check you're pasting the RIGHT hash — the one for the USDT payment to our address, not any other transaction.",
      };
    }
    if (r.includes("amount received") && r.includes("less than")) {
      return {
        userMessage: `Amount is short: ${onchainReason.replace(/^amount received/i, "Amount received")}`,
      };
    }
    if (r.includes("more than 24 hours older")) {
      return {
        userMessage:
          "That transaction is more than 24 hours older than this order — it's from a previous payment. Send a fresh payment and paste the new hash.",
      };
    }
  }

  // Binance-side "we saw your deposits but none matched". The user
  // has Binance activity in the window, but nothing lines up with
  // recipient + amount. Almost always: wrong tx ID pasted.
  if (
    binanceReason.toLowerCase().includes("but none matched") &&
    !combined.includes("no usdt deposits found")
  ) {
    return {
      userMessage:
        "We can see your recent Binance deposits, but none match this order (either wrong recipient address or wrong amount). Double-check the transfer ID you pasted — grab it directly from the Binance deposit history screen for THIS $ amount.",
    };
  }

  return null;
}
