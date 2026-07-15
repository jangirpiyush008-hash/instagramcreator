"use client";

import Link from "next/link";
import { useState } from "react";
import type { Region } from "@/core/types";
import type {
  ConsumerTier,
  ApiSubscriptionTier,
  CreditPack,
} from "@/core/billing/tiers";
import { WalletPacks } from "@/web/components/wallet/WalletPacks";

type Cycle = "monthly" | "annual";

interface Props {
  region: Region;
  isSignedIn: boolean;
  currentTierId: string | null;
  activeSubCycle: Cycle | null;
  tiers: ConsumerTier[];
  apiStarter: ApiSubscriptionTier;
  creditPacks: CreditPack[];
  anonScansPerDay: number;
}

// Client-side pricing page. Monthly/annual toggle, geo-aware currency
// display, feature-locking CTAs. Server passes serializable data only —
// no callbacks or class instances.

export function PricingClient({
  region,
  isSignedIn,
  currentTierId,
  activeSubCycle,
  tiers,
  apiStarter,
  creditPacks,
  anonScansPerDay,
}: Props) {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const inr = region === "IN";

  return (
    <article className="container max-w-6xl py-12 sm:py-16 space-y-14">
      {/* HEADER + CYCLE TOGGLE */}
      <header className="space-y-6 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs uppercase tracking-wider text-foreground/70">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Simple pricing · cancel anytime
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Pricing that grows with you
        </h1>
        <p className="text-foreground/70 text-lg">
          Start free — {anonScansPerDay} scans a day, no signup. Upgrade when you need more scans,
          more tools, or team access.
        </p>
        <CycleToggle cycle={cycle} onChange={setCycle} />
        {!inr && (
          <p className="text-[11px] text-foreground/60">
            Prices shown in USD for reference. Billing happens in INR via Razorpay — your bank may
            add ~1-2% currency conversion.
          </p>
        )}
      </header>

      {/* CONSUMER TIERS */}
      <section className="space-y-4">
        <SectionHeading eyebrow="For creators & brands" title="Web-app plans" />
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((t) => (
            <ConsumerTierCard
              key={t.id}
              tier={t}
              cycle={cycle}
              inr={inr}
              isSignedIn={isSignedIn}
              currentTierId={currentTierId}
              activeSubCycle={activeSubCycle}
            />
          ))}
        </div>
      </section>

      {/* DEVELOPER API */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="For developers"
          title="Developer API"
          sub="Subscribe monthly for predictable spend — OR pay-as-you-go with wallet credits. Both options work off the same API key."
        />
        <div className="grid md:grid-cols-2 gap-4">
          {/* API Starter subscription */}
          <ApiStarterCard
            tier={apiStarter}
            cycle={cycle}
            inr={inr}
            isSignedIn={isSignedIn}
          />
          {/* Wallet callout */}
          <WalletCallout inr={inr} isSignedIn={isSignedIn} />
        </div>

        {/* Wallet packs + custom recharge (shared component — same UI on /developer) */}
        <div className="pt-4 space-y-3">
          <div className="text-sm font-semibold text-foreground/80">Wallet top-up packs</div>
          <WalletPacks packs={creditPacks} inr={inr} isSignedIn={isSignedIn} />
        </div>
      </section>

      {/* ANON NOTE */}
      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm max-w-3xl mx-auto text-center">
        <span className="text-foreground/70">
          <span className="text-foreground font-semibold">Anonymous:</span> {anonScansPerDay} free
          scans a day (Engagement Rate &amp; Username Checker only). Sign up free to unlock 4 tools
          and 20 scans a month.
        </span>
      </div>

      {/* FAQ */}
      <section className="space-y-4 max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold tracking-tight text-center">FAQ</h2>
        <FAQ
          q="What's the difference between web-app plans and Developer API?"
          a="Web-app plans are for creators/brands using our dashboard. Developer API is for engineers building on top of our data — you get an API key and hit our endpoints from your own code."
        />
        <FAQ
          q="How does the wallet work?"
          a="Buy any pack, credits land in your wallet instantly. Every API call deducts credits. Credits never disappear until you use them OR they hit their 12-month expiry from purchase date."
        />
        <FAQ
          q="Can I have both a subscription AND wallet credits?"
          a="Yes. The API deducts from your subscription's monthly quota first, then from your wallet. Ideal for spiky workloads on top of a stable base plan."
        />
        <FAQ
          q="Do you offer refunds?"
          a="Full refund on subscriptions within 7 days of first payment, no questions. After 7 days, pro-rated for unused calendar months. Wallet top-ups are non-refundable but never expire until the 12-month window."
        />
        <FAQ
          q="Can I switch plans?"
          a="Any time from your dashboard. Upgrades take effect immediately; downgrades apply at the next billing cycle."
        />
        <FAQ
          q="Do I need a card for the free tier?"
          a="No. Sign up with Google in 5 seconds. Upgrade later if you outgrow the free quota."
        />
      </section>

      <div className="text-center text-sm text-foreground/70 pt-6 border-t border-border">
        Questions? Email{" "}
        <a href="mailto:support.decodecreator@gmail.com" className="underline hover:text-foreground">
          support.decodecreator@gmail.com
        </a>
      </div>
    </article>
  );
}

// ── Cycle toggle (monthly / annual) ─────────────────────────────────────
function CycleToggle({ cycle, onChange }: { cycle: Cycle; onChange: (c: Cycle) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card/70 p-1 relative">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={
          "px-5 py-1.5 rounded-full text-sm font-medium transition-all " +
          (cycle === "monthly"
            ? "bg-foreground text-background shadow"
            : "text-foreground/70 hover:text-foreground")
        }
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("annual")}
        className={
          "px-5 py-1.5 rounded-full text-sm font-medium transition-all relative " +
          (cycle === "annual"
            ? "bg-foreground text-background shadow"
            : "text-foreground/70 hover:text-foreground")
        }
      >
        Annual
        <span className="ml-2 text-[10px] font-bold text-emerald-500">Save 17%</span>
      </button>
    </div>
  );
}

// ── Consumer tier card ──────────────────────────────────────────────────
function ConsumerTierCard({
  tier,
  cycle,
  inr,
  isSignedIn,
  currentTierId,
  activeSubCycle,
}: {
  tier: ConsumerTier;
  cycle: Cycle;
  inr: boolean;
  isSignedIn: boolean;
  currentTierId: string | null;
  activeSubCycle: Cycle | null;
}) {
  const highlight = tier.id === "starter";
  const isFree = tier.monthlyInrPaise === 0;
  const isCurrent = currentTierId === tier.id && (isFree || activeSubCycle === cycle);

  const priceLabel = isFree
    ? "Free"
    : inr
    ? cycle === "annual"
      ? tier.annualInrDisplay
      : tier.monthlyInrDisplay
    : cycle === "annual"
    ? tier.annualUsdDisplay
    : tier.monthlyUsdDisplay;

  const cycleLabel = isFree ? "" : cycle === "annual" ? "/year" : "/month";

  // CTA logic — anon: signup, current: disabled, otherwise: checkout link.
  const cta = (() => {
    if (isCurrent) {
      return (
        <button
          disabled
          className="block w-full text-center rounded-md border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 cursor-default"
        >
          Current plan
        </button>
      );
    }
    if (isFree) {
      return (
        <Link
          href={isSignedIn ? "/account" : "?auth=signup"}
          className="block w-full text-center rounded-md border border-border bg-card/80 py-2.5 text-sm font-medium hover:border-primary/50 transition"
        >
          {isSignedIn ? "Manage account" : tier.ctaLabel}
        </Link>
      );
    }
    if (!isSignedIn) {
      return (
        <Link
          href={`?auth=signup&next=${encodeURIComponent(`/checkout?tier=${tier.id}&cycle=${cycle}`)}`}
          className={
            "block w-full text-center rounded-md py-2.5 text-sm font-semibold transition " +
            (highlight
              ? "bg-gradient-ig text-white hover:brightness-110"
              : "border border-border bg-card/80 hover:border-primary/50")
          }
        >
          Sign up to start
        </Link>
      );
    }
    return (
      <Link
        href={`/checkout?tier=${tier.id}&cycle=${cycle}`}
        className={
          "block w-full text-center rounded-md py-2.5 text-sm font-semibold transition " +
          (highlight
            ? "bg-gradient-ig text-white hover:brightness-110"
            : "border border-border bg-card/80 hover:border-primary/50")
        }
      >
        {tier.ctaLabel}
      </Link>
    );
  })();

  return (
    <div
      className={
        "relative rounded-2xl border p-6 flex flex-col " +
        (highlight && !isCurrent
          ? "border-primary/60 bg-primary/[0.03] shadow-lg shadow-primary/10"
          : "border-border bg-card/60")
      }
    >
      {highlight && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-ig text-white text-[10px] uppercase tracking-wider font-semibold px-3 py-1">
          Most popular
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 text-white text-[10px] uppercase tracking-wider font-semibold px-3 py-1">
          Your plan
        </div>
      )}
      <div className="text-sm uppercase tracking-wider text-foreground/70 font-semibold">
        {tier.name}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-bold tabular-nums">{priceLabel}</span>
        {cycleLabel && <span className="text-sm text-foreground/60">{cycleLabel}</span>}
      </div>
      {!isFree && cycle === "annual" && (
        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
          Save 17% vs monthly
        </div>
      )}
      <p className="text-sm text-foreground/70 mt-4 min-h-[3rem]">{tier.blurb}</p>
      <ul className="mt-6 space-y-2 text-sm flex-1">
        {tier.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
            <span className="text-foreground/80">{h}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{cta}</div>
    </div>
  );
}

// ── API Starter subscription card ───────────────────────────────────────
function ApiStarterCard({
  tier,
  cycle,
  inr,
  isSignedIn,
}: {
  tier: ApiSubscriptionTier;
  cycle: Cycle;
  inr: boolean;
  isSignedIn: boolean;
}) {
  const priceLabel = inr
    ? cycle === "annual"
      ? tier.annualInrDisplay
      : tier.monthlyInrDisplay
    : cycle === "annual"
    ? tier.annualUsdDisplay
    : tier.monthlyUsdDisplay;
  const cycleLabel = cycle === "annual" ? "/year" : "/month";

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-6 flex flex-col">
      <div className="text-sm uppercase tracking-wider text-foreground/70 font-semibold">
        {tier.name}
      </div>
      <div className="text-xs text-foreground/60 mt-0.5">Predictable monthly bill</div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-bold tabular-nums">{priceLabel}</span>
        <span className="text-sm text-foreground/60">{cycleLabel}</span>
      </div>
      {cycle === "annual" && (
        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
          Save 17% vs monthly
        </div>
      )}
      <ul className="mt-6 space-y-2 text-sm flex-1">
        {tier.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
            <span className="text-foreground/80">{h}</span>
          </li>
        ))}
      </ul>
      <Link
        href={isSignedIn ? `/checkout?tier=api-starter&cycle=${cycle}` : `?auth=signup&next=${encodeURIComponent(`/checkout?tier=api-starter&cycle=${cycle}`)}`}
        className="mt-6 block w-full text-center rounded-md bg-gradient-ig text-white py-2.5 text-sm font-semibold hover:brightness-110 transition"
      >
        {isSignedIn ? "Subscribe" : "Sign up to subscribe"}
      </Link>
    </div>
  );
}

// ── Wallet callout ──────────────────────────────────────────────────────
function WalletCallout({ inr: _inr, isSignedIn }: { inr: boolean; isSignedIn: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.03] p-6 flex flex-col">
      <div className="text-sm uppercase tracking-wider text-primary font-semibold">
        Wallet — pay as you use
      </div>
      <div className="text-xs text-foreground/60 mt-0.5">
        No subscription. Buy credits, use them across 12 months.
      </div>
      <ul className="mt-6 space-y-2 text-sm flex-1">
        <li className="flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
          <span className="text-foreground/80">Buy any pack from $20 to $500</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
          <span className="text-foreground/80">Bigger packs = better per-credit rate</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
          <span className="text-foreground/80">Credits valid for 12 months from purchase</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
          <span className="text-foreground/80">Stack on top of any subscription</span>
        </li>
      </ul>
      <Link
        href={isSignedIn ? "/developer?tab=wallet" : `?auth=signup&next=${encodeURIComponent("/developer?tab=wallet")}`}
        className="mt-6 block w-full text-center rounded-md border border-primary text-primary py-2.5 text-sm font-semibold hover:bg-primary/10 transition"
      >
        {isSignedIn ? "Top up your wallet" : "Sign up to buy credits"}
      </Link>
    </div>
  );
}

// ── Small helpers ───────────────────────────────────────────────────────
function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto space-y-2">
      <div className="text-xs uppercase tracking-wider font-semibold text-primary">{eyebrow}</div>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="text-sm text-foreground/70 mt-2">{sub}</p>}
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="font-semibold">{q}</div>
      <div className="text-sm text-foreground/70 mt-2 leading-relaxed">{a}</div>
    </div>
  );
}
