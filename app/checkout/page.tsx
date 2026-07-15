import { redirect } from "next/navigation";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { CONSUMER_TIERS, type ConsumerTier } from "@/core/billing/tiers";
import { CheckoutClient } from "./CheckoutClient";

// /checkout?tier=starter — server-side auth gate + tier validation, then
// hands off to a small client component that POSTs /api/checkout and
// redirects to Razorpay's hosted checkout URL. Kept as a real page (not
// a bare API endpoint) so we can show a "Redirecting to Razorpay…" state
// during the network round-trip.

interface PageProps {
  searchParams: Promise<{ tier?: string; scanKey?: string }>;
}

export default async function CheckoutPage({ searchParams }: PageProps) {
  const { tier: rawTier, scanKey } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    // Preserve the tier through login → they land back here after auth.
    const next = `/checkout${rawTier ? `?tier=${encodeURIComponent(rawTier)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const tier = rawTier ? (CONSUMER_TIERS[rawTier] as ConsumerTier | undefined) : undefined;
  if (!tier || tier.id === "free" || tier.priceInrPaise === 0) {
    redirect("/pricing");
  }

  return (
    <section className="container py-16 max-w-md mx-auto">
      <div className="rounded-2xl border border-border bg-card/60 p-8 space-y-4 text-center">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Checkout
        </div>
        <h1 className="text-2xl font-semibold">{tier.name} — {tier.priceInrDisplay}/mo</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ll be redirected to Razorpay to complete payment. Cancel any time from
          your account dashboard.
        </p>
        <CheckoutClient tierId={tier.id} scanKey={scanKey} />
      </div>
    </section>
  );
}
