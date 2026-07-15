import Link from "next/link";
import { ScanForm } from "@/web/components/ScanForm";
import { EngagementCalculator } from "@/web/components/EngagementCalculator";
import { TOOLS } from "@/core/tools/registry";
import { ANON_LIMITS } from "@/core/billing/tiers";
import type { Platform } from "@/core/types";

// Trim each tool to serializable fields before passing to client UI — the full
// SocialTool holds a run() function that can't cross the server→client boundary.
type ToolMeta = {
  id: string;
  slug: string;
  name: string;
  intentLabel: string;
  blurb: string;
  platforms: Platform[];
  phase: 0 | 1 | 2 | 3;
  anonAllowed: boolean;
};
const ANON_TOOLS = new Set<string>(ANON_LIMITS.toolIds);
const TOOL_META: ToolMeta[] = TOOLS.map((t) => ({
  id: t.id,
  slug: t.seo.slug ?? t.id,
  name: t.name,
  intentLabel: t.intentLabel,
  blurb: t.blurb,
  platforms: [...t.platforms],
  phase: t.phase,
  anonAllowed: ANON_TOOLS.has(t.id),
}));

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="container pt-14 sm:pt-20 pb-10">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="flex flex-wrap gap-2 justify-center">
            <Chip color="primary">✨ New: Face + bio audience demographics</Chip>
            <Chip color="emerald">Trusted by 50+ creators &amp; brands</Chip>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.02]">
            <span className="block">Best</span>
            <span className="gradient-text-ig block">Instagram, TikTok &amp; YouTube</span>
            <span className="block">Analytics Tool in 2026</span>
          </h1>

          <p className="text-foreground/70 text-lg sm:text-xl max-w-2xl mx-auto">
            Engagement, audience demographics, fake-follower share, earnings — for any public
            Instagram, TikTok or YouTube account. Public data only, no login required.
          </p>
        </div>

        <div className="max-w-4xl mx-auto mt-10 px-2 sm:px-0">
          <div className="rounded-2xl surface border border-border p-4 sm:p-8 shadow-2xl shadow-black/10 dark:shadow-black/40">
            <ScanForm />
          </div>
          <div className="flex flex-wrap gap-3 justify-center mt-6">
            <Link
              href="?auth=signup"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-ig text-white px-6 py-3 text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-primary/20"
            >
              Start Free Trial <span aria-hidden>→</span>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-6 py-3 text-sm font-medium hover:border-primary/60 transition"
            >
              View Pricing
            </Link>
          </div>
          <p className="text-center text-xs text-foreground/60 mt-4">
            {ANON_LIMITS.scansPerDay} free scans a day · no card required
          </p>
        </div>
      </section>

      {/* KPI STRIP */}
      <section className="container py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          <Kpi value="99.9%" label="API uptime" />
          <Kpi value="<2s" label="Median response" />
          <Kpi value="12" label="Analytics tools" />
          <Kpi value="3" label="Platforms" />
        </div>
      </section>

      {/* TOOLS */}
      <section className="container py-14" id="tools">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs uppercase tracking-wider text-foreground/70 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            {TOOL_META.length} tools · Instagram · TikTok · YouTube
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Every creator insight, one search
          </h2>
          <p className="text-foreground/70 mt-3 max-w-xl mx-auto">
            Real public data — engagement, growth, audience, downloads. No signup to try.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl mx-auto">
          {TOOL_META.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="container py-16" id="features">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-3">Features</div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-2xl mx-auto">
            Everything you need to analyze public creator data
          </h2>
          <p className="text-foreground/70 mt-3 max-w-xl mx-auto">
            Simple, powerful tools designed for scale. No complex setup required.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <FeatureCard
            icon="⚡"
            title="Real-time data"
            body="Live data straight from Instagram, TikTok and YouTube. No stale cache, no synthetic fallbacks."
          />
          <FeatureCard
            icon="🚀"
            title="Lightning fast"
            body="Median response under 2 seconds. Cache-shared primitives keep repeat scans near-instant."
          />
          <FeatureCard
            icon="🔓"
            title="Fair per-credit pricing"
            body="Pay only for what you fetch. Failed scans are refunded automatically."
          />
          <FeatureCard
            icon="🛡️"
            title="99.9% uptime"
            body="Multi-provider fallback per platform. When one provider throttles, we route around it."
          />
          <FeatureCard
            icon="🔌"
            title="Easy integration"
            body="One REST endpoint per tool. Same shape across IG/TikTok/YouTube. cURL, Node, Python — all supported."
          />
          <FeatureCard
            icon="✉️"
            title="Human support"
            body="Email support on every plan. Pro and above get priority with a 24-hour SLA."
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container py-16">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-3">How it works</div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Get started in 3 simple steps
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <Step
            n="01"
            title="Sign up free"
            body="Create an account with email or Google. 20 free scans a month, no card required."
          />
          <Step
            n="02"
            title="Run your first scan"
            body="Pick a tool, enter any public handle, hit fetch. Results in seconds."
          />
          <Step
            n="03"
            title="Scale on paid plans"
            body="Upgrade when you outgrow the free tier. Starter is ₹599/mo for 150 scans + all 12 tools."
          />
        </div>
      </section>

      {/* USE CASES */}
      <section className="container py-16">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-3">Use cases</div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Built for modern creator-economy teams
          </h2>
          <p className="text-foreground/70 mt-3 max-w-xl mx-auto">
            Powering data-driven decisions across creator marketing, brand deals, and social listening.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 max-w-5xl mx-auto">
          <UseCase
            emoji="🎯"
            title="Influencer marketing"
            body="Vet creators before signing a brand deal. Check engagement quality, fake-follower share, and audience demographics in one call."
          />
          <UseCase
            emoji="📊"
            title="Market research"
            body="Track competitor creator strategies, hashtag performance, and audience trends across every platform in one workspace."
          />
          <UseCase
            emoji="🛒"
            title="E-commerce & D2C brands"
            body="Find product-mention posts, identify potential brand ambassadors, and monitor customer sentiment on public creator posts."
          />
          <UseCase
            emoji="👂"
            title="Social listening"
            body="Track hashtags, monitor mentions, and watch trending conversations relevant to your brand — no platform APIs required."
          />
        </div>
      </section>

      {/* VALUE PROP RECAP */}
      <section className="container py-14">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-4 text-sm">
          <ValueCard
            title="Free to try"
            body={`${ANON_LIMITS.scansPerDay} scans a day with no signup. 20 scans/mo across 4 tools once you sign up.`}
          />
          <ValueCard
            title="No notification"
            body="Public data only. The scanned account is never notified — nothing follows or DMs them."
          />
          <ValueCard
            title="Grow with a plan"
            body="Starter ₹599/mo unlocks all 12 tools. Pro & Scale add bundled full-reports and priority support."
          />
        </div>
      </section>

      {/* COMPARISON — competitor keyword magnet */}
      <section className="container py-16" id="alternatives">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-3">
            Alternatives comparison
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl mx-auto">
            The HypeAuditor, Modash, Iconosquare &amp; Social Blade alternative
          </h2>
          <p className="text-foreground/70 mt-3 max-w-2xl mx-auto">
            Most creator analytics platforms are Instagram-only, cost $99+/month
            minimum, or hide pricing behind a sales call. DecodeCreator covers
            all three platforms, starts at zero, and shows the meter on the
            wall.
          </p>
        </div>
        <div className="max-w-5xl mx-auto overflow-x-auto">
          <table className="w-full text-sm border border-border/60 rounded-xl overflow-hidden">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Feature</th>
                <th className="text-left px-4 py-3 font-semibold">DecodeCreator</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">HypeAuditor</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Modash</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Iconosquare</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Social Blade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-foreground/80">
              <CompareRow feature="Free tier" us="2 scans/day + 20 free/mo signed in" a="Limited profile only" b="Free trial then paid" c="14-day trial" d="Ads + basic stats" />
              <CompareRow feature="Starting paid price" us="₹499 / ~$6 per month" a="~$399/mo" b="~$199/mo" c="~$29/mo" d="$3.99/mo (limited)" />
              <CompareRow feature="Instagram support" us="Full" a="Full" b="Full" c="Full" d="Basic" />
              <CompareRow feature="TikTok support" us="Full" a="Full" b="Full" c="Limited" d="Basic" />
              <CompareRow feature="YouTube support" us="Full" a="Full" b="Limited" c="No" d="Full" />
              <CompareRow feature="Pay-as-you-go API credits" us="Yes, ₹500 min, 12-mo expiry" a="No" b="No" c="No" d="No" />
              <CompareRow feature="Chargebacks + refund policy" us="7-day money back, published" a="Not published" b="Not published" c="Published" d="N/A" />
              <CompareRow feature="Requires sales call" us="Never" a="Enterprise tier" b="For Modash Studio" c="For Enterprise" d="No" />
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Competitor prices from public pricing pages as of{" "}
            {new Date().getFullYear()}. Not affiliated with any listed vendor.
          </p>
        </div>
      </section>

      {/* FAQ — schema.org FAQPage matches the JSON-LD in layout.tsx */}
      <section className="container py-16" id="faq">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-3">
            Frequently asked questions
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-2xl mx-auto">
            Common questions from creators, brands &amp; agencies
          </h2>
        </div>
        <div className="max-w-3xl mx-auto space-y-3">
          <FaqItem
            q="Is DecodeCreator free?"
            a="Yes — every visitor gets 2 free scans per day with no card. Signed-in free users get 20 scans per month. Paid tiers start at ₹499/month (~$6/month) and unlock all 12 tools + higher quotas. The API is credit-based, with a ₹500 minimum top-up, and credits are valid for 12 months per lot."
          />
          <FaqItem
            q="How is DecodeCreator different from HypeAuditor, Modash, or Social Blade?"
            a="Three differences: (1) transparent per-scan credit pricing — no 'contact sales for a quote'; (2) wallet credits valid for 12 months with no early expiry; (3) Instagram + TikTok + YouTube in one dashboard, not just Instagram. Where a metric is inferred rather than measured, we say so — no 'AI-powered' claims where a heuristic is doing the work."
          />
          <FaqItem
            q="Does the scanned account know I'm looking at their profile?"
            a="No. DecodeCreator only reads public data through licensed provider APIs. Nothing follows, DMs, likes, or leaves any trace on the source account. The scanned user is never notified."
          />
          <FaqItem
            q="Can I check private Instagram or TikTok accounts?"
            a="No. Private accounts return a 'private' response — we do not attempt to bypass any platform's privacy settings. This is a strict rule; we won't help circumvent an account block."
          />
          <FaqItem
            q="How accurate is the fake-follower check?"
            a="It's a sampled, signal-based estimate. We look at follower activity patterns, profile completeness, engagement authenticity, and other public signals. Where the estimate is uncertain we say so."
          />
          <FaqItem
            q="Is there a REST API I can integrate?"
            a="Yes. GET /v1/scan/{platform}/{handle}?tool={toolId} with an x-api-key header. Credits are metered per call and refunded on failure. Full docs at /docs."
          />
          <FaqItem
            q="What's the average Instagram engagement rate in 2026?"
            a="Rough benchmarks — nano (1K–10K): 4–8%; micro (10K–100K): 2–4%; mid-tier (100K–1M): 1.5–3%; macro (1M+): 0.5–1.5%. Anything above the range for the follower size is strong; anything below is soft. Run our Engagement Rate tool on any handle for a benchmarked reading with median, distribution, and cadence."
          />
          <FaqItem
            q="Where does DecodeCreator get its data?"
            a="Licensed data-provider APIs: HikerAPI for Instagram, tikwm for TikTok, YouTube Data API v3 for YouTube. All calls hit public endpoints only. We never accept login credentials for third-party platforms and never store session cookies."
          />
        </div>
      </section>

      {/* ER CALCULATOR — free tool, placed before final CTA per request */}
      <section className="container py-16" id="engagement-calculator">
        <div className="max-w-5xl mx-auto">
          <EngagementCalculator />
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <div className="rounded-3xl border border-border bg-card/70 p-10 sm:p-16 text-center max-w-4xl mx-auto relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -inset-1 opacity-30 pointer-events-none"
            style={{
              background:
                "radial-gradient(600px 300px at 50% 0%, hsl(322 95% 60% / 0.35), transparent 70%)",
            }}
          />
          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">
              Ready to analyze creator data at scale?
            </h2>
            <p className="text-foreground/70 mt-4 max-w-xl mx-auto">
              Start your free trial today. No credit card required.
            </p>
            <div className="flex flex-wrap gap-3 justify-center mt-8">
              <Link
                href="?auth=signup"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-ig text-white px-7 py-3.5 text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-primary/25"
              >
                Start Free Trial <span aria-hidden>→</span>
              </Link>
              <a
                href="mailto:support.decodecreator@gmail.com"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-7 py-3.5 text-sm font-medium hover:border-primary/60 transition"
              >
                Talk to sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="container pb-24" id="contact">
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-3">Contact</div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Let&apos;s talk</h2>
          <p className="text-foreground/70 mt-3 max-w-xl mx-auto">
            Questions, enterprise volume, or partnership? We reply within 3 business days.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <ContactCard
            emoji="📧"
            title="Email us"
            body="For general inquiries, billing, and support."
            action="support.decodecreator@gmail.com"
            href="mailto:support.decodecreator@gmail.com"
          />
          <ContactCard
            emoji="🏢"
            title="Enterprise volume"
            body="Custom credit allowances, invoicing, and SLAs for teams above 2,500 scans/mo."
            action="Talk to sales →"
            href="mailto:support.decodecreator@gmail.com?subject=Enterprise%20inquiry"
          />
        </div>
      </section>
    </>
  );
}

// ── Trust chip ───────────────────────────────────────────────────────────
function Chip({ children, color }: { children: React.ReactNode; color: "emerald" | "primary" }) {
  const dotClass = color === "emerald" ? "bg-emerald-500" : "bg-primary";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-foreground/75">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {children}
    </span>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────
function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center rounded-xl border border-border bg-card/70 px-4 py-5">
      <div className="text-3xl sm:text-4xl font-bold gradient-text-ig tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-foreground/60 mt-1">{label}</div>
    </div>
  );
}

// ── Tool card — tightened per feedback (shorter description, no hover teaser) ──
function ToolCard({ tool }: { tool: ToolMeta }) {
  const demoPlatform = tool.platforms.includes("instagram") ? "instagram" : "tiktok";
  const demoHandle = "creator";
  const href = `/${demoPlatform}/${demoHandle}/${tool.slug}`;
  // Shorter teaser than before — user asked for minimum content per card,
  // just enough for the reader to know what the tool does at a glance.
  const teaser =
    tool.blurb.length > 60 ? tool.blurb.slice(0, 57).trimEnd() + "…" : tool.blurb;
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card/70 p-5 transition-all hover:border-primary/60 hover:bg-card hover:-translate-y-0.5 block relative"
    >
      {tool.anonAllowed && (
        <span
          className="absolute top-3 right-3 text-[10px] uppercase tracking-wider font-medium text-emerald-600 dark:text-emerald-400"
          title="Try without signing in"
        >
          Free preview
        </span>
      )}
      <div className="text-xs uppercase tracking-wider text-foreground/60 font-medium">
        {tool.name}
      </div>
      <div className="mt-1.5 font-semibold text-base leading-snug">
        {tool.intentLabel}
      </div>
      <p className="text-xs text-foreground/60 mt-1.5">{teaser}</p>
    </Link>
  );
}

// ── Feature tile ─────────────────────────────────────────────────────────
function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="text-2xl">{icon}</div>
      <h3 className="font-semibold mt-3">{title}</h3>
      <p className="text-sm text-foreground/70 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

// ── Numbered step ────────────────────────────────────────────────────────
function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-6">
      <div className="text-3xl font-bold gradient-text-ig">{n}</div>
      <h3 className="font-semibold mt-3">{title}</h3>
      <p className="text-sm text-foreground/70 mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

// ── Use-case tile ────────────────────────────────────────────────────────
function UseCase({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-6 flex gap-4">
      <div className="text-3xl shrink-0" aria-hidden>
        {emoji}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-foreground/70 mt-2 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

// ── Value card (kept simple) ─────────────────────────────────────────────
function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-foreground/70 mt-1 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

// ── Comparison-table row ────────────────────────────────────────────────
function CompareRow({
  feature,
  us,
  a,
  b,
  c,
  d,
}: {
  feature: string;
  us: string;
  a: string;
  b: string;
  c: string;
  d: string;
}) {
  return (
    <tr>
      <td className="px-4 py-3 font-medium text-foreground">{feature}</td>
      <td className="px-4 py-3 text-foreground bg-primary/5 font-medium">{us}</td>
      <td className="px-4 py-3 text-muted-foreground">{a}</td>
      <td className="px-4 py-3 text-muted-foreground">{b}</td>
      <td className="px-4 py-3 text-muted-foreground">{c}</td>
      <td className="px-4 py-3 text-muted-foreground">{d}</td>
    </tr>
  );
}

// ── FAQ item ─────────────────────────────────────────────────────────────
// Native <details> so the SEO crawler + LLM can read every answer even
// when the panel is closed (no client JS required, no aria plumbing).
function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-border bg-card/60 open:bg-card/80">
      <summary className="cursor-pointer list-none px-5 py-4 font-medium flex items-start justify-between gap-3">
        <span>{q}</span>
        <span
          className="text-muted-foreground group-open:rotate-45 transition-transform text-xl leading-none pt-0.5"
          aria-hidden
        >
          +
        </span>
      </summary>
      <div className="px-5 pb-5 pt-0 text-sm text-foreground/75 leading-relaxed">
        {a}
      </div>
    </details>
  );
}

// ── Contact tile ─────────────────────────────────────────────────────────
function ContactCard({
  emoji,
  title,
  body,
  action,
  href,
}: {
  emoji: string;
  title: string;
  body: string;
  action: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="rounded-xl border border-border bg-card/60 p-6 hover:border-primary/60 transition-colors block"
    >
      <div className="text-3xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="font-semibold mt-3">{title}</h3>
      <p className="text-sm text-foreground/70 mt-2 leading-relaxed">{body}</p>
      <div className="text-sm text-primary mt-3 font-medium">{action}</div>
    </a>
  );
}
