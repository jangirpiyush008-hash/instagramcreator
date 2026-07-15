import { redirect } from "next/navigation";
import { getCurrentUser } from "@/web/lib/supabase-server";
import {
  CONSUMER_TIERS,
  API_STARTER_TIER,
  type ConsumerTier,
} from "@/core/billing/tiers";
import { CheckoutClient } from "./CheckoutClient";

// /checkout?tier=starter&cycle=monthly
//
// Server-side auth gate + tier/cycle validation, then hands off to a
// small client component that POSTs /api/checkout and redirects to
// Razorpay's hosted checkout URL. Kept as a real page (not a bare API
// endpoint) so we can show a "Redirecting to Razorpay…" state during
// the network round-trip.

interface PageProps {
  searchParams: Promise<{ tier?: string; cycle?: string; scanKey?: string }>;
}

// Shape shared between consumer tiers + api-starter for the checkout UI.
interface CheckoutTier {
  id: string;
  name: string;
  monthlyDisplay: string;
  annualDisplay: string;
}

export default async function CheckoutPage({ searchParams }: PageProps) {
  const { tier: rawTier, cycle: rawCycle, scanKey } = await searchParams;
  const cycle: "monthly" | "annual" = rawCycle === "annual" ? "annual" : "monthly";

  const user = await getCurrentUser();
  if (!user) {
    // Preserve the tier + cycle through login → they land back here after auth.
    const nextQuery = new URLSearchParams();
    if (rawTier) nextQuery.set("tier", rawTier);
    if (rawCycle) nextQuery.set("cycle", rawCycle);
    const next = `/checkout${nextQuery.toString() ? `?${nextQuery.toString()}` : ""}`;
    redirect(`/?auth=signin&next=${encodeURIComponent(next)}`);
  }

  const tier: CheckoutTier | null = (() => {
    if (rawTier === "api-starter") {
      return {
        id: API_STARTER_TIER.id,
        name: API_STARTER_TIER.name,
        monthlyDisplay: API_STARTER_TIER.monthlyInrDisplay,
        annualDisplay: API_STARTER_TIER.annualInrDisplay,
      };
    }
    const t = rawTier ? (CONSUMER_TIERS[rawTier] as ConsumerTier | undefined) : undefined;
    if (!t || t.id === "free" || t.monthlyInrPaise === 0) return null;
    return {
      id: t.id,
      name: t.name,
      monthlyDisplay: t.monthlyInrDisplay,
      annualDisplay: t.annualInrDisplay,
    };
  })();

  if (!tier) redirect("/pricing");

  const priceLabel =
    cycle === "annual"
      ? `${tier.annualDisplay}/year`
      : `${tier.monthlyDisplay}/month`;

  return (
    <section className="container py-16 max-w-md mx-auto">
      <div className="rounded-2xl border border-border bg-card/60 p-8 space-y-4 text-center">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Checkout
        </div>
        <h1 className="text-2xl font-semibold">
          {tier.name} — {priceLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ll be redirected to Razorpay to complete payment. Cancel any time from
          your account dashboard.
        </p>
        <CheckoutClient tierId={tier.id} cycle={cycle} scanKey={scanKey} />
      </div>
    </section>
  );
}
