import Link from "next/link";

// Cookie policy. Required by GDPR/ePrivacy, Google Consent Mode v2,
// and standard consumer trust. Sits alongside the /privacy page — the
// privacy page covers *what data* we collect; this page covers *what
// browser storage* we set and how the user controls it.
//
// The 3 categories match the CookieBanner component's toggles exactly.
// If you add/remove a category here, sync the banner too.

export const metadata = {
  title: "Cookie Policy — DecodeCreator",
  description:
    "Which cookies DecodeCreator sets, why, and how to turn off the non-essential ones. Three simple categories.",
};

const SUPPORT_EMAIL = "support.decodecreator@gmail.com";
const EFFECTIVE_DATE = "July 15, 2026";

export default function CookiesPage() {
  return (
    <article className="container max-w-3xl py-12 space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          DecodeCreator
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Cookie Policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}. Three categories, plain English, one
          click to change your mind.
        </p>
      </header>

      <Callout>
        We use a single first-party session cookie you can&apos;t opt out of
        (it&apos;s how we know you&apos;re signed in). Everything else —
        analytics, marketing — is off by default and only turns on if you
        explicitly accept it in our cookie banner.
      </Callout>

      <Section title="What is a cookie, briefly">
        <p>
          A cookie is a small text file the browser saves per website. We
          also use similar browser-storage APIs (localStorage,
          sessionStorage) — this policy covers all of them. The point of
          this page is: <b>what data is stored on your device, and why</b>.
        </p>
      </Section>

      <Section title="The three categories we use">
        <p>
          Every piece of storage we set is one of three types. In the cookie
          banner you can accept or reject the last two independently.
        </p>

        <CategoryCard
          title="1. Strictly necessary (always on)"
          badge="required"
          items={[
            {
              name: "sb-<project>-auth-token",
              purpose: "Supabase session — keeps you signed in.",
              retention: "Refreshed on activity; expires after ~1 week idle.",
              party: "First-party (Supabase-issued, we set it on our domain).",
            },
            {
              name: "theme",
              purpose: "Remembers whether you picked light or dark mode.",
              retention: "Persists until you clear it.",
              party: "First-party (localStorage).",
            },
            {
              name: "dc-consent",
              purpose:
                "Remembers your cookie-banner choice so we don't nag you every visit.",
              retention: "6 months, then we re-ask.",
              party: "First-party (localStorage).",
            },
            {
              name: "csrf-token / cf-clearance / __Host-*",
              purpose:
                "Anti-CSRF and platform-set anti-abuse cookies from Cloudflare / Railway proxies. Required for the site to function.",
              retention: "Session or short-lived (minutes to hours).",
              party: "First-party (platform infrastructure).",
            },
          ]}
        />

        <CategoryCard
          title="2. Analytics (opt-in)"
          badge="off by default"
          items={[
            {
              name: "Google Analytics (_ga, _ga_*)",
              purpose:
                "Aggregate visit counts, popular pages, referrer sources. Anonymized IP. We only load Google Analytics AFTER you accept analytics cookies.",
              retention: "Up to 24 months (Google-controlled).",
              party: "Third-party (Google).",
            },
            {
              name: "PostHog (ph_*)",
              purpose:
                "Product analytics — which tools people use, which buttons get clicked. Helps us know what to improve. Not linked to your email.",
              retention: "12 months.",
              party: "Third-party (PostHog).",
            },
          ]}
        />

        <CategoryCard
          title="3. Marketing (opt-in)"
          badge="off by default"
          items={[
            {
              name: "Google Ads conversion tag (_gcl_*)",
              purpose:
                "Tells Google Ads if you signed up after clicking one of our ads, so we know our ad money isn't wasted. Loads only if you accept marketing cookies.",
              retention: "Up to 90 days.",
              party: "Third-party (Google Ads).",
            },
            {
              name: "Meta / X pixel (if enabled)",
              purpose:
                "Same as above but for Instagram/Facebook and X (Twitter) ad platforms. Currently OFF site-wide; will only load after both (a) we enable it and (b) you accept marketing cookies.",
              retention: "Up to 90 days when enabled.",
              party: "Third-party.",
            },
          ]}
        />
      </Section>

      <Section title="Google Consent Mode v2">
        <p>
          When you make a choice in our cookie banner, we send that choice
          to Google via Consent Mode v2 signals (
          <code className="px-1 py-0.5 rounded bg-muted text-xs">
            ad_storage
          </code>
          ,{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-xs">
            analytics_storage
          </code>
          ,{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-xs">
            ad_user_data
          </code>
          ,{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-xs">
            ad_personalization
          </code>
          ). Google tags installed on our site respect that signal — if
          you decline, no personal identifiers are sent to Google&apos;s ad
          products.
        </p>
        <p>
          Default state before you make a choice:{" "}
          <b>everything except strictly-necessary is DENIED</b>. We do not
          fire analytics or ad tags until you actively opt in.
        </p>
      </Section>

      <Section title="How to change your choice">
        <List
          items={[
            "Use the \"Cookie preferences\" link in the footer of any page to reopen the banner and update your choice at any time.",
            "Or clear the dc-consent value from your browser (DevTools → Application → localStorage) and the banner will re-appear on the next page load.",
            "Or block cookies at the browser level — the site works fully without analytics/marketing, though you'll need to accept strictly-necessary or you won't stay signed in.",
          ]}
        />
      </Section>

      <Section title="Do Not Track">
        <p>
          We treat a browser-level Do Not Track (DNT) or Global Privacy
          Control (GPC) signal as a decline for both analytics and
          marketing cookies. You still see the banner (so we can honor an
          explicit opt-in if you want to give us analytics), but if you
          don&apos;t interact with it we default to your DNT/GPC signal.
        </p>
      </Section>

      <Section title="Cookies we do not use">
        <List
          items={[
            "We do not use Facebook Pixel by default (currently disabled site-wide).",
            "We do not use any cross-site tracking cookies, third-party data broker cookies, or fingerprinting scripts.",
            "We do not sell cookie data or share it with data brokers. (See the Privacy Policy for the full \"who we share with\" list.)",
          ]}
        />
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we add a new cookie category (e.g. video-embed cookies from a
          YouTube tutorial), we&apos;ll update this page and re-prompt you
          in the banner. Existing choices for categories that haven&apos;t
          changed are preserved.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Cookie questions or complaints:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p className="pt-4 text-xs">
          Related:{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/terms" className="underline">
            Terms of Service
          </Link>
          {" · "}
          <Link href="/refund" className="underline">
            Refund Policy
          </Link>
        </p>
      </Section>
    </article>
  );
}

interface CookieRow {
  name: string;
  purpose: string;
  retention: string;
  party: string;
}

function CategoryCard({
  title,
  badge,
  items,
}: {
  title: string;
  badge: string;
  items: CookieRow[];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {badge}
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {items.map((row) => (
          <div key={row.name} className="py-2.5 space-y-1 text-xs">
            <div className="font-mono text-foreground/90">{row.name}</div>
            <div className="text-muted-foreground">{row.purpose}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground/80">
              <span>
                <b>Retention:</b> {row.retention}
              </span>
              <span>
                <b>Party:</b> {row.party}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
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

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
      {children}
    </div>
  );
}
