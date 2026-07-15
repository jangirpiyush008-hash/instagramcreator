import Link from "next/link";

// Privacy policy. Required by Google OAuth consent screen, Razorpay,
// LemonSqueezy, and Chrome Web Store. Written in plain English — no
// legalese, no dark patterns. If a claim here doesn't match the code,
// fix the code, not the policy.

export const metadata = {
  title: "Privacy Policy — DecodeCreator",
  description:
    "How DecodeCreator collects, uses, and stores your data. Plain English, no dark patterns.",
};

const SUPPORT_EMAIL = "support.decodecreator@gmail.com";
const EFFECTIVE_DATE = "July 15, 2026";

export default function PrivacyPage() {
  return (
    <article className="container max-w-3xl py-12 space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          DecodeCreator
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}. This policy tells you exactly what we
          collect, why, and how you can get us to stop.
        </p>
      </header>

      <Section title="Who we are">
        <p>
          DecodeCreator (&quot;we&quot;, &quot;us&quot;) operates the website{" "}
          <Link href="/" className="underline">
            decodecreator.com
          </Link>{" "}
          and the DecodeCreator public API. We provide public-data analytics
          for Instagram, TikTok, and YouTube accounts — the kind of numbers
          you can already see on the account&apos;s public profile, aggregated
          and analyzed.
        </p>
      </Section>

      <Section title="What we collect from YOU (our user)">
        <p>When you sign in with Google, we receive:</p>
        <List
          items={[
            "Your email address",
            "Your name (as shown in your Google profile)",
            "Your Google profile picture URL",
            "A stable Google-issued user ID (used only to log you back in)",
          ]}
        />
        <p>
          We do <b>not</b> request or receive: your Gmail contents, your
          contacts, your YouTube subscriptions, your Google Drive, or any
          other Google service data. We only ask for the standard{" "}
          <code className="mx-1 px-1.5 py-0.5 rounded bg-black/30 text-xs">
            openid
          </code>{" "}
          <code className="mx-1 px-1.5 py-0.5 rounded bg-black/30 text-xs">
            email
          </code>{" "}
          <code className="mx-1 px-1.5 py-0.5 rounded bg-black/30 text-xs">
            profile
          </code>{" "}
          scopes.
        </p>
        <p>
          When you use the site or the API, we also record:
        </p>
        <List
          items={[
            "Which analytics tools you ran, and against which public handle",
            "For API customers: your API key usage log (endpoint, credits charged, response code, timestamp)",
            "Standard web-server logs (IP address, user-agent, request path) retained ≤30 days for security and abuse prevention",
          ]}
        />
      </Section>

      <Section title="What we collect ABOUT public accounts you scan">
        <p>
          When you analyze a public Instagram, TikTok, or YouTube account, we
          fetch data that is <b>already publicly visible</b> on that
          platform&apos;s website — follower count, post metrics, video views,
          comment authors, publicly-set bios, and publicly-set profile
          pictures. We aggregate this into the analytics you see.
        </p>
        <p>
          The scanned account is <b>not notified</b>. Nothing you do on
          DecodeCreator writes to their account, follows them, DMs them, or
          leaves any trace on the source platform.
        </p>
        <p>
          We <b>never</b> ask for or use anyone&apos;s login credentials,
          session cookies, or private account data. Private accounts return
          a &quot;private account&quot; response — we do not attempt to
          bypass.
        </p>
      </Section>

      <Section title="Audience demographic inference (gender & age)">
        <p>
          For the &quot;Audience Gender &amp; Age&quot; tool, we infer aggregate
          demographics from public commenter profiles. Our pipeline, in order:
        </p>
        <List
          items={[
            "Bio text parsing — we look for self-declared pronouns (she/her, he/him, they/them), gendered self-descriptors (mom, dad, wife, husband), and explicit age mentions (\"23 y/o\", \"born 1998\"). Strongest, self-declared signal.",
            "Profile-picture demographic estimate (aggregate only) — when configured, we may run a face-detection API over publicly visible profile pictures to estimate age range and gender in aggregate. We never identify individuals. This is opt-in per deployment and disabled by default; when enabled, we use Amazon Rekognition's DetectFaces API. No image data is stored.",
            "First-name dictionary lookup — a curated in-repo dictionary of Indian and Western first names. Weakest signal, used only when bio and face were inconclusive.",
          ]}
        />
        <p>
          <b>Aggregate output only.</b> The tool returns audience percentages
          and age-bracket distributions across the sample. We never show
          per-individual demographic classifications in tool output, exports,
          or API responses.
        </p>
        <p>
          <b>No facial recognition or identification.</b> We use face
          <em> detection</em> to estimate demographic attributes only. We do
          not build a face database, do not match faces to identities, and
          do not store face embeddings. Each analysis is a stateless request
          to a third-party API for that one image, discarded after.
        </p>
        <p>
          <b>Sample cap and caching.</b> At most 25 commenter profiles are
          enriched per scan. Profile data is cached for 48 hours so re-scans
          of the same handle avoid duplicate provider calls.
        </p>
      </Section>

      <Section title="Why we collect this data">
        <List
          items={[
            "To sign you in and keep you signed in",
            "To show your account dashboard, subscription, and unlock history",
            "To meter API usage against your credit balance",
            "To detect abuse (e.g. one account brute-forcing hundreds of scans)",
            "To send transactional emails (subscription confirmations, credit alerts) — never marketing without an unsubscribe link",
          ]}
        />
      </Section>

      <Section title="Who we share it with">
        <p>
          We share data only with the vendors we need to operate the service:
        </p>
        <List
          items={[
            "Supabase — our database and auth provider (stores your account row)",
            "Railway — our hosting provider (runs the Node.js server)",
            "Razorpay / LemonSqueezy — payment processors (only sees the data needed to charge your card and confirm a subscription)",
            "Provider APIs (HikerAPI, tikwm, YouTube Data API v3) — we send them the public handle you asked to scan; they return public data",
            "Amazon Rekognition (only when audience-demographic inference is enabled) — we send publicly visible profile-picture URLs for one-shot face detection; no data is stored on our side or theirs beyond the request",
          ]}
        />
        <p>
          We do <b>not</b> sell your data. We do <b>not</b> share it with
          advertisers, data brokers, or affiliates.
        </p>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          We use a first-party session cookie to keep you signed in. That is
          the only cookie we set. We do <b>not</b> use Google Analytics,
          Facebook Pixel, or any third-party ad tracker on the site.
        </p>
      </Section>

      <Section title="Your rights">
        <List
          items={[
            "Access — email us and we'll send you every row we hold about you",
            "Delete — email us and we'll permanently delete your account within 7 days (API keys revoked, scan history erased, personal profile removed)",
            "Correct — update your name via Google; other fields via support",
            "Export — request a JSON export of your account data",
            "Opt out — cancel your subscription any time from your account page",
          ]}
        />
      </Section>

      <Section title="Data retention">
        <List
          items={[
            "Account data: kept while your account is active. Deleted within 7 days of a delete request.",
            "Scan cache: 48 hours (then automatically expires).",
            "API usage logs: 12 months for billing dispute resolution, then deleted.",
            "Web server logs: 30 days maximum.",
          ]}
        />
      </Section>

      <Section title="Where your data lives">
        <p>
          Our Supabase database is hosted in{" "}
          <b>ap-south-1 (Mumbai, India)</b>. Railway runs in the region
          closest to our users. We do not knowingly transfer personal data
          outside India except through the CDN edge that serves the site.
        </p>
      </Section>

      <Section title="Children">
        <p>
          DecodeCreator is not for anyone under 18. We do not knowingly
          collect data from anyone under 18. If you believe a child has
          created an account, email us — we&apos;ll delete it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we make material changes, we&apos;ll email you before they take
          effect. The current version is always at{" "}
          <Link href="/privacy" className="underline">
            decodecreator.com/privacy
          </Link>
          .
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions, data-access requests, or complaints:{" "}
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
