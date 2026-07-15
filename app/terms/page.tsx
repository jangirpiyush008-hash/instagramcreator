import Link from "next/link";

// Terms of Service. Required by Google OAuth consent screen, Razorpay,
// LemonSqueezy, and most payment gateways. Written to protect the
// business without being adversarial to users.

export const metadata = {
  title: "Terms of Service — DecodeCreator",
  description:
    "The rules for using DecodeCreator and its public API. Fair, no dark patterns.",
};

const SUPPORT_EMAIL = "support.decodecreator@gmail.com";
const EFFECTIVE_DATE = "July 15, 2026";

export default function TermsPage() {
  return (
    <article className="container max-w-3xl py-12 space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          DecodeCreator
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}. By using DecodeCreator, you agree to
          these terms. If you don&apos;t agree, don&apos;t use the service.
        </p>
      </header>

      <Section title="1. What DecodeCreator does">
        <p>
          DecodeCreator provides public-data analytics for Instagram, TikTok,
          and YouTube accounts through a web app (
          <Link href="/" className="underline">
            decodecreator.com
          </Link>
          ) and a public HTTP API. We analyze data that is already publicly
          visible on those platforms and present it in a consolidated
          dashboard.
        </p>
      </Section>

      <Section title="2. Who can use it">
        <p>
          You must be at least 18 years old to create an account or purchase a
          subscription. By signing up, you confirm you meet this requirement.
        </p>
        <p>
          Businesses may create accounts. The person signing up warrants they
          have authority to bind the business.
        </p>
      </Section>

      <Section title="3. Acceptable use">
        <p>You agree not to:</p>
        <List
          items={[
            "Use DecodeCreator to harass, threaten, defame, or dox any individual",
            "Attempt to identify private facts about a private individual, or aggregate DecodeCreator data with other sources to profile a specific person",
            "Reverse-engineer, scrape, or bulk-extract our API responses beyond your credit allowance",
            "Resell raw DecodeCreator data as if it were your own service (SaaS-on-top is fine; direct API-key-sharing to end customers is not)",
            "Circumvent rate limits, credit metering, or the paywall",
            "Use DecodeCreator to make automated decisions that materially affect a person (e.g. hiring, credit, insurance) without human review",
            "Use the service in violation of any Instagram, TikTok, or YouTube terms — we surface only public data, but downstream use is your responsibility",
          ]}
        />
        <p>
          Violation may result in immediate account suspension without refund.
        </p>
      </Section>

      <Section title="4. Data we surface">
        <p>
          DecodeCreator scans <b>public</b> profiles only. If an account is
          private, we return a &quot;private account&quot; response and do not
          attempt to bypass. We do not store login credentials for any social
          platform, ours or anyone else&apos;s.
        </p>
        <p>
          Analytics we provide are derived signals — they are honest but not
          guaranteed. Some tools show a &quot;tentative&quot; disclaimer when
          the platform&apos;s API imposes limits on data resolution. Don&apos;t
          make legal, financial, or hiring decisions based solely on our
          numbers.
        </p>
      </Section>

      <Section title="5. Your account">
        <p>
          You are responsible for keeping your API keys and login session
          confidential. Any usage or credits consumed through your key is
          your responsibility. If a key is compromised, revoke it from your
          account dashboard immediately.
        </p>
      </Section>

      <Section title="6. Payments and refunds">
        <List
          items={[
            "Subscriptions renew automatically on the same day each month until you cancel.",
            "Cancel any time from your account dashboard — you keep access until the end of the paid period.",
            "One-time unlocks are non-refundable once the report has been viewed.",
            "Subscription refunds within 7 days of first payment: full refund, no questions. After 7 days: pro-rated for unused calendar months only.",
            "API credits are non-refundable in cash but roll over to the next billing month if unused (up to 1× your monthly allowance).",
            "Chargebacks or disputes without contacting support first will result in account suspension.",
          ]}
        />
      </Section>

      <Section title="7. Availability">
        <p>
          We aim for 99.5% uptime but do not guarantee it. Upstream provider
          APIs (Instagram, TikTok, YouTube) can rate-limit or go down; when
          that happens, tools return an honest 503 error rather than fake
          data. No SLA credits on the free or starter tier; Pro and above
          get pro-rated credits for confirmed extended outages.
        </p>
      </Section>

      <Section title="8. Intellectual property">
        <p>
          The DecodeCreator name, logo, dashboard code, and API design are
          ours. Public-account data we surface belongs to the account owner
          and the source platform — you get analysis rights, not resale
          rights.
        </p>
        <p>
          Feedback you send us (bug reports, feature ideas) is not
          confidential — we may act on it without attribution or payment.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          You can delete your account any time — email us and we&apos;ll
          remove your data within 7 days (see the{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          ).
        </p>
        <p>
          We can suspend or terminate your account if you violate these
          terms, dispute a legitimate charge, or use the service in a way
          that harms other users or the service itself.
        </p>
      </Section>

      <Section title="10. Warranty and liability">
        <p>
          The service is provided &quot;as is.&quot; We disclaim implied
          warranties of merchantability and fitness for purpose to the extent
          permitted by law.
        </p>
        <p>
          Our total liability for any claim arising from your use of the
          service is capped at the amount you paid us in the 12 months
          preceding the claim, or ₹1,000 — whichever is greater.
        </p>
      </Section>

      <Section title="11. Governing law and disputes">
        <p>
          These terms are governed by the laws of India. Disputes are subject
          to the exclusive jurisdiction of the courts of Mumbai,
          Maharashtra.
        </p>
        <p>
          Before filing a claim, please email us — most issues are resolved
          faster over email than in court.
        </p>
      </Section>

      <Section title="12. Changes to these terms">
        <p>
          If we make material changes, we&apos;ll email you before they take
          effect. Continued use of the service after the effective date means
          you accept the updated terms. The current version is always at{" "}
          <Link href="/terms" className="underline">
            decodecreator.com/terms
          </Link>
          .
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          Support, billing, disputes, everything:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
          . We aim to reply within 3 business days.
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
