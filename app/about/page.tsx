import Link from "next/link";

// About page. Required for Google Ads landing-page policy ("business
// information must be readily available") and standard consumer trust
// (a real business, real operator, real contact channel). Kept
// deliberately unfluffy — no team-of-40 fiction.

export const metadata = {
  title: "About DecodeCreator — public-data analytics for creators & brands",
  description:
    "DecodeCreator is a lean, independent SaaS built to make audience analytics accessible without corporate pricing or dark patterns.",
};

const SUPPORT_EMAIL = "support.decodecreator@gmail.com";

export default function AboutPage() {
  return (
    <article className="container max-w-3xl py-12 space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          DecodeCreator
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          About DecodeCreator
        </h1>
        <p className="text-sm text-muted-foreground">
          Audience analytics for public Instagram, TikTok, and YouTube
          accounts — built for creators evaluating their own numbers and for
          brands evaluating whom to partner with.
        </p>
      </header>

      <Section title="What we do">
        <p>
          DecodeCreator gives you the same public numbers that appear on any
          Instagram, TikTok, or YouTube profile — but organized into
          decisions you can actually act on. Instead of clicking through 40
          posts to eyeball engagement, run a scan and get engagement rate,
          audience-quality signals, posting cadence, follower trend, and a
          demographic snapshot in one report.
        </p>
        <p>
          We serve two audiences:
        </p>
        <List
          items={[
            "Creators — checking their own analytics without paying an agency, comparing themselves against peers, spotting shadowban signals, tracking follower changes.",
            "Brands and agencies — vetting potential influencer partners at scale, spotting fake-follower inflation before signing a deal, benchmarking category leaders.",
          ]}
        />
      </Section>

      <Section title="How we're different">
        <List
          items={[
            "Public data only. We never touch private accounts, never store login credentials, and never let anyone use us to bypass a platform's privacy settings.",
            "Transparent pricing. Every tier's included quota, per-scan cost after the quota, and API credit rate is on the /pricing page — no \"contact sales for a quote.\"",
            "Wallet credits that don't expire early. Buy credits when you need them, use them across 12 months. See /refund for the exact terms.",
            "Honest signals. Where an inference is fuzzy (fake-follower share, audience demographics), we say so. Where our data is sampled rather than exhaustive, we say so. You'll never see \"AI-powered\" claims where a lookup dictionary is doing the work.",
          ]}
        />
      </Section>

      <Section title="Who runs this">
        <p>
          DecodeCreator is built and operated by an independent developer
          based in India. We don&apos;t have a VC pitch deck; we ship
          features that we&apos;d want to use ourselves, and we reply to
          support email personally.
        </p>
        <p>
          Reach the operator directly:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
          . We reply within 2 business days, usually within 24 hours.
        </p>
      </Section>

      <Section title="How the tech works">
        <p>
          When you scan a public account, we fetch profile data and recent
          posts through licensed data-provider APIs (HikerAPI for Instagram,
          tikwm for TikTok, YouTube Data API v3 for YouTube), then run our
          own analysis pipeline over the results. Results are cached for 48
          hours so a re-scan of the same handle in a short window costs no
          extra provider quota.
        </p>
        <p>
          For technical details on the public API — endpoints, credit costs,
          rate limits — see the{" "}
          <Link href="/docs" className="underline">
            API docs
          </Link>
          .
        </p>
      </Section>

      <Section title="What we won't do">
        <List
          items={[
            "We won't help you bypass a private account or platform block. Private accounts return a \"private\" response and we do not attempt to circumvent.",
            "We won't sell your data, share it with data brokers, or use it for advertising unrelated to DecodeCreator.",
            "We won't hide fees behind trial-to-paid dark patterns. See /refund for our full cancellation and refund terms.",
            "We won't scan minors' accounts if we can detect the account is a minor (visible age markers in bio); when detected, we hard-refuse the scan.",
          ]}
        />
      </Section>

      <Section title="Get in touch">
        <p>
          Product questions, feature requests, complaints, partnership
          inquiries — email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
          . For account, billing, or refund matters see the{" "}
          <Link href="/refund" className="underline">
            Refund Policy
          </Link>
          .
        </p>
        <p className="pt-4 text-xs">
          <Link href="/pricing" className="underline">
            Pricing
          </Link>
          {" · "}
          <Link href="/developer" className="underline">
            Developer &amp; API
          </Link>
          {" · "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="underline">
            Terms
          </Link>
          {" · "}
          <Link href="/refund" className="underline">
            Refund
          </Link>
          {" · "}
          <Link href="/cookies" className="underline">
            Cookies
          </Link>
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-6 space-y-1.5">
      {items.map((it) => (
        <li key={it}>{it}</li>
      ))}
    </ul>
  );
}
