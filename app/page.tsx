import Link from "next/link";
import { ScanForm } from "@/web/components/ScanForm";
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
      <AnnouncementBar />

      {/* HERO */}
      <section className="container pt-10 sm:pt-16 pb-8">
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

          <p className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto">
            Engagement, audience demographics, fake-follower share, earnings — for any public
            Instagram, TikTok or YouTube account. Public data only, no login required.
          </p>
        </div>

        <div className="max-w-2xl mx-auto mt-10">
          <div className="rounded-2xl surface border border-border p-4 sm:p-6 shadow-2xl shadow-black/10 dark:shadow-black/40">
            <ScanForm />
          </div>
          <div className="flex flex-wrap gap-3 justify-center mt-6">
            <Link
              href="?auth=signup"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-ig text-white px-6 py-3 text-sm font-medium hover:brightness-110 transition shadow-lg shadow-primary/20"
            >
              Start Free Trial <span aria-hidden>→</span>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-6 py-3 text-sm font-medium hover:border-primary/60 transition"
            >
              View Pricing
            </Link>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">
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
      <section className="container py-12" id="tools">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            {TOOL_META.length} tools · Instagram · TikTok · YouTube
          </div>
          <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight">
            Every creator insight, one search
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Real public data — engagement, growth, audience, downloads. No signup to try.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl mx-auto">
          {TOOL_META.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      </section>

      {/* VALUE PROP */}
      <section className="container py-16">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-4 text-sm">
          <ValueCard
            title="Free to try"
            body={`${ANON_LIMITS.scansPerDay} scans a day, no signup. Sign up free for 20 scans a month across 4 tools.`}
          />
          <ValueCard
            title="No notification"
            body="Public data only. The account you scan is never notified — nothing follows or DMs them."
          />
          <ValueCard
            title="Grow with a plan"
            body="Starter ₹599/mo unlocks all 12 tools. Pro & Scale add bundled full-reports and priority support."
          />
        </div>
        <div className="text-center mt-8">
          <Link
            href="/pricing"
            className="inline-block rounded-md bg-gradient-ig text-white px-5 py-2.5 text-sm font-medium hover:brightness-110 transition"
          >
            See pricing →
          </Link>
        </div>
      </section>
    </>
  );
}

// ── Announcement bar ─────────────────────────────────────────────────────
// Slim strip above the header. Kept as a server component + static content
// (no dismiss button yet — add localStorage-backed hide later if needed).
function AnnouncementBar() {
  return (
    <div className="w-full bg-gradient-ig text-white text-sm">
      <div className="container py-2 flex items-center justify-center gap-2 flex-wrap">
        <span>🚀 API is live</span>
        <span aria-hidden className="opacity-70">·</span>
        <span>3,000 free credits for developers</span>
        <Link
          href="/docs"
          className="underline underline-offset-2 font-medium hover:brightness-110"
        >
          Get your key →
        </Link>
      </div>
    </div>
  );
}

// ── Trust chip (green-dot pill like GramScraper) ─────────────────────────
function Chip({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "emerald" | "primary";
}) {
  const dotClass = color === "emerald" ? "bg-emerald-500" : "bg-primary";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground">
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
      <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// ── Tool card (kept from earlier commit, now theme-aware via tokens) ─────
function ToolCard({ tool }: { tool: ToolMeta }) {
  const demoPlatform = tool.platforms.includes("instagram") ? "instagram" : "tiktok";
  const demoHandle = "creator";
  const href = `/${demoPlatform}/${demoHandle}/${tool.slug}`;
  const teaser =
    tool.blurb.length > 90 ? tool.blurb.slice(0, 87).trimEnd() + "…" : tool.blurb;
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card/60 p-5 transition-all hover:border-primary/50 hover:bg-card hover:-translate-y-0.5 block relative"
    >
      {tool.anonAllowed && (
        <span
          className="absolute top-3 right-3 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400"
          title="Try without signing in"
        >
          Free preview
        </span>
      )}
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {tool.name}
      </div>
      <div className="mt-2 font-medium text-lg leading-snug">
        {tool.intentLabel}
      </div>
      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{teaser}</p>
      <div className="mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
        Try it →
      </div>
    </Link>
  );
}

// ── Value card ────────────────────────────────────────────────────────────
function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <h3 className="font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1">{body}</p>
    </div>
  );
}
