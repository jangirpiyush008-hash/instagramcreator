"use client";

import { useState } from "react";
import {
  WALLET_MIN_MANUAL_INR,
  WALLET_MAX_MANUAL_INR,
  WALLET_CREDITS_PER_RUPEE,
  creditsFromRupees,
  type CreditPack,
} from "@/core/billing/tiers";

// Shared wallet purchase UI — used by /pricing (public) and /developer
// (signed-in). Renders the 4 fixed packs + a custom-amount card.
//
// The `isSignedIn` flag controls whether links go direct to the top-up
// endpoint or route through the auth modal first. Both flows funnel
// into GET /api/wallet/topup which server-side redirects to Razorpay.

export function WalletPacks({
  packs,
  inr,
  isSignedIn,
}: {
  packs: CreditPack[];
  inr: boolean;
  isSignedIn: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {packs.map((p) => (
          <CreditPackCard key={p.id} pack={p} inr={inr} isSignedIn={isSignedIn} />
        ))}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground/80 mb-2">
          Or pick your own amount
        </div>
        <CustomRechargeCard isSignedIn={isSignedIn} />
      </div>
      <p className="text-xs text-foreground/60 pt-2">
        Credits valid for 12 months from purchase. Same key, same endpoints — the API deducts
        from your subscription quota first, then falls back to wallet.
      </p>
    </div>
  );
}

// ── Fixed-pack tile ─────────────────────────────────────────────────────
function CreditPackCard({
  pack,
  inr,
  isSignedIn,
}: {
  pack: CreditPack;
  inr: boolean;
  isSignedIn: boolean;
}) {
  const price = inr ? pack.amountInrDisplay : pack.amountUsdDisplay;
  const href = isSignedIn
    ? `/api/wallet/topup?pack=${pack.id}`
    : `?auth=signup&next=${encodeURIComponent(`/api/wallet/topup?pack=${pack.id}`)}`;
  return (
    <div
      className={
        "rounded-xl border p-4 flex flex-col " +
        (pack.highlight ? "border-primary/60 bg-primary/[0.03]" : "border-border bg-card/60")
      }
    >
      {pack.highlight && (
        <div className="text-[10px] uppercase tracking-wider font-semibold text-primary mb-2">
          Most popular
        </div>
      )}
      <div className="text-2xl font-bold">{price}</div>
      <div className="text-xs text-foreground/60 mt-1">
        {pack.credits.toLocaleString("en-IN")} credits
      </div>
      <div className="text-[11px] text-foreground/60 mt-2">
        {pack.perCreditUsdDisplay} per credit
      </div>
      {pack.discountLabel && (
        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
          {pack.discountLabel}
        </div>
      )}
      <a
        href={href}
        className={
          "mt-4 block w-full text-center rounded-md py-2 text-xs font-semibold transition " +
          (pack.highlight
            ? "bg-gradient-ig text-white hover:brightness-110"
            : "border border-border bg-background hover:border-primary/50")
        }
      >
        {isSignedIn ? "Buy pack" : "Sign up"}
      </a>
    </div>
  );
}

// ── Custom recharge tile ────────────────────────────────────────────────
function CustomRechargeCard({ isSignedIn }: { isSignedIn: boolean }) {
  const [rupees, setRupees] = useState<number>(WALLET_MIN_MANUAL_INR);
  const [inputValue, setInputValue] = useState<string>(String(WALLET_MIN_MANUAL_INR));

  const credits = creditsFromRupees(rupees);
  const valid =
    Number.isFinite(rupees) &&
    rupees >= WALLET_MIN_MANUAL_INR &&
    rupees <= WALLET_MAX_MANUAL_INR;

  const targetHref = valid
    ? isSignedIn
      ? `/api/wallet/topup?amount=${rupees}`
      : `?auth=signup&next=${encodeURIComponent(`/api/wallet/topup?amount=${rupees}`)}`
    : undefined;

  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.02] p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
      <div className="flex-1">
        <div className="text-sm font-semibold">Custom amount</div>
        <div className="text-xs text-foreground/60 mt-0.5">
          Min ₹{WALLET_MIN_MANUAL_INR.toLocaleString("en-IN")} · ₹
          {(1 / WALLET_CREDITS_PER_RUPEE).toFixed(2)} per credit (baseline — packs save 17–50%).
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/60"
            aria-hidden
          >
            ₹
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={WALLET_MIN_MANUAL_INR}
            max={WALLET_MAX_MANUAL_INR}
            step={100}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n)) setRupees(n);
            }}
            className="h-10 w-32 rounded-lg border border-border bg-background pl-7 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
            aria-label="Amount in rupees"
          />
        </div>
        <div className="text-sm min-w-[120px]">
          <div className="font-semibold tabular-nums">
            {credits.toLocaleString("en-IN")} credits
          </div>
          <div className="text-[11px] text-foreground/60">valid 12 months</div>
        </div>
        {targetHref ? (
          <a
            href={targetHref}
            className="inline-block rounded-md bg-gradient-ig text-white px-5 py-2 text-sm font-semibold hover:brightness-110 transition"
          >
            {isSignedIn ? "Top up" : "Sign up to top up"}
          </a>
        ) : (
          <button
            disabled
            className="inline-block rounded-md bg-muted text-foreground/50 px-5 py-2 text-sm font-semibold cursor-not-allowed"
          >
            Top up
          </button>
        )}
      </div>
    </div>
  );
}
