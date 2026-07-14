import Link from "next/link";
import { ScanForm } from "@/web/components/ScanForm";
import { TOOLS } from "@/core/tools/registry";
import type { Platform } from "@/core/types";

// Trim each tool to serializable fields before passing to client UI — the full
// SocialTool holds a run() function that can't cross the server→client boundary.
type ToolMeta = {
  id: string;
  name: string;
  intentLabel: string;
  blurb: string;
  platforms: Platform[];
  phase: 0 | 1 | 2 | 3;
};
const TOOL_META: ToolMeta[] = TOOLS.map((t) => ({
  id: t.id,
  name: t.name,
  intentLabel: t.intentLabel,
  blurb: t.blurb,
  platforms: [...t.platforms],
  phase: t.phase,
}));

export default function HomePage() {
  return (
    <>
      <section className="container pt-16 sm:pt-24 pb-12">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-ig" />
            Public analytics for creators and brands
          </span>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.05]">
            Decode any{" "}
            <span className="gradient-text-ig">creator</span>
          </h1>
          <p className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto">
            Engagement, audience demographics, fake-follower share, earnings — for any
            public Instagram or TikTok account. No login required.
          </p>
        </div>

        <div className="max-w-2xl mx-auto mt-10">
          <div className="rounded-2xl surface border border-border p-4 sm:p-6 shadow-2xl shadow-black/40">
            <ScanForm />
          </div>
        </div>
      </section>

      <section className="container py-12" id="tools">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground mb-4">
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

      <section className="container py-16">
        <div className="max-w-3xl mx-auto grid sm:grid-cols-3 gap-4 text-sm">
          <ValueCard
            title="See the answer"
            body="Free portion every time. Pay only to unlock the locked metrics."
          />
          <ValueCard
            title="No notification"
            body="Public data. The account never knows you ran a scan."
          />
          <ValueCard
            title="One unlock or sub"
            body="Pay once for a single report, or subscribe for unlimited."
          />
        </div>
      </section>
    </>
  );
}

function ToolCard({ tool }: { tool: ToolMeta }) {
  const shipped = tool.phase === 0;
  // Every card is clickable in Phase 0 — picks a demo handle so users can see
  // the result UI for that tool. Live tool hits the real API; coming-soon
  // tools render their sample view with a "preview" banner.
  const demoPlatform = tool.platforms.includes("instagram") ? "instagram" : "tiktok";
  const demoHandle = "creator";
  const href = `/${demoPlatform}/${demoHandle}?tool=${tool.id}`;
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border/80 bg-card/60 p-5 transition-all hover:border-primary/60 hover:-translate-y-0.5 block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {tool.name}
        </div>
        {shipped ? (
          <span className="text-[10px] uppercase tracking-wider rounded-full bg-gradient-ig text-white px-2 py-0.5 font-medium">
            Live
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider rounded-full border border-border bg-muted text-muted-foreground px-2 py-0.5">
            Phase {tool.phase}
          </span>
        )}
      </div>
      <div className="mt-2 font-medium text-lg leading-snug">{tool.intentLabel}</div>
      <p className="text-sm text-muted-foreground mt-2">{tool.blurb}</p>
      <div className="mt-3 text-xs text-primary/80 opacity-0 group-hover:opacity-100 transition-opacity">
        Preview →
      </div>
    </Link>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <h3 className="font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1">{body}</p>
    </div>
  );
}
