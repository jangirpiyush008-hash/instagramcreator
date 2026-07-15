import Link from "next/link";
import { CONSUMER_TIERS, ANON_LIMITS } from "@/core/billing/tiers";
import { TOOLS } from "@/core/tools/registry";

export const metadata = {
  title: "Pricing — DecodeCreator",
  description:
    "Simple, transparent pricing for public-data analytics. Free tier included, monthly subscriptions from ₹599 / $7.",
};

export default function PricingPage() {
  const tiers = [
    CONSUMER_TIERS.free!,
    CONSUMER_TIERS.starter!,
    CONSUMER_TIERS.pro!,
    CONSUMER_TIERS.scale!,
  ];
  const totalTools = TOOLS.filter((t) => t.phase === 0).length;

  return (
    <article className="container max-w-6xl py-12 sm:py-16 space-y-14">
      <header className="space-y-4 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Simple pricing · cancel anytime
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Pricing that grows with you
        </h1>
        <p className="text-muted-foreground text-lg">
          Start free — {ANON_LIMITS.scansPerDay} scans a day, no signup. Upgrade when you need more
          scans, more tools, or team access. Billed in INR via Razorpay.
        </p>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiers.map((tier) => {
          const highlight = tier.id === "starter"; // Starter = most-recommended
          const isPaid = tier.priceInrPaise > 0;
          return (
            <div
              key={tier.id}
              className={
                "relative rounded-2xl border p-6 flex flex-col " +
                (highlight
                  ? "border-primary/60 bg-primary/[0.03] shadow-lg shadow-primary/10"
                  : "border-border bg-card/60")
              }
            >
              {highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-ig text-white text-[10px] uppercase tracking-wider font-semibold px-3 py-1">
                  Most popular
                </div>
              )}
              <div className="text-sm uppercase tracking-wider text-muted-foreground">
                {tier.name}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tabular-nums">{tier.priceInrDisplay}</span>
                {isPaid && <span className="text-sm text-muted-foreground">/mo</span>}
              </div>
              {isPaid && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  ≈ {tier.priceUsdDisplay} · billed monthly
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-4 min-h-[3rem]">{tier.blurb}</p>

              <ul className="mt-6 space-y-2 text-sm flex-1">
                {tier.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {tier.id === "free" ? (
                  <Link
                    href="?auth=signup"
                    className="block w-full text-center rounded-md border border-border bg-card/80 py-2.5 text-sm font-medium hover:border-primary/50 transition"
                  >
                    {tier.ctaLabel}
                  </Link>
                ) : (
                  <Link
                    href={`/checkout?tier=${tier.id}`}
                    className={
                      "block w-full text-center rounded-md py-2.5 text-sm font-medium transition " +
                      (highlight
                        ? "bg-gradient-ig text-white hover:brightness-110"
                        : "border border-border bg-card/80 hover:border-primary/50")
                    }
                  >
                    {tier.ctaLabel}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Anonymous tier note */}
      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm max-w-3xl mx-auto text-center">
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">Anonymous:</span>{" "}
          {ANON_LIMITS.scansPerDay} free scans a day (Engagement Rate & Username Checker only).
          Sign up free to unlock 2 more tools and 20 scans a month.
        </span>
      </div>

      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            All {totalTools} tools · all 3 platforms
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
            Every tool works on Instagram, TikTok, and YouTube. Free / Starter get individual tools;
            Pro / Scale add the full-report bundle that runs every tool for a handle in one call.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
          {TOOLS.filter((t) => t.phase === 0).map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.name}
              </div>
              <div className="text-sm mt-1">{t.intentLabel}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6 max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold tracking-tight text-center">FAQ</h2>
        <FAQ
          q="What happens if I run out of scans mid-month?"
          a="You'll see a friendly limit-reached screen with a one-click upgrade link. Existing cached results stay accessible."
        />
        <FAQ
          q="Do you offer refunds?"
          a="Full refund within 7 days of your first payment, no questions. After 7 days, pro-rated for unused calendar months."
        />
        <FAQ
          q="Can I switch plans?"
          a="Yes, any time from your account dashboard. Downgrades take effect at the next billing cycle; upgrades are immediate."
        />
        <FAQ
          q="Do I need a card for the free tier?"
          a="No. Sign up with Google in 5 seconds. Upgrade later if you outgrow the free quota."
        />
        <FAQ
          q="How is billing handled?"
          a="Razorpay for INR-primary billing. You'll receive an invoice email after every successful charge. Cancel from your account dashboard."
        />
        <FAQ
          q="Is the API included?"
          a="A separate developer-API tier is available (see /docs). Scale customers get preview API credits included; Pro and below use the web app."
        />
      </section>

      <div className="text-center text-sm text-muted-foreground pt-6 border-t border-border">
        Questions? Email{" "}
        <a href="mailto:support.decodecreator@gmail.com" className="underline">
          support.decodecreator@gmail.com
        </a>
      </div>
    </article>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="font-medium">{q}</div>
      <div className="text-sm text-muted-foreground mt-2">{a}</div>
    </div>
  );
}
