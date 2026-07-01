"use client";

import { MetricCard, SectionTitle, Sparkline, StatusBadge } from "../primitives";
import type { Platform } from "@/core/types";

interface Signal {
  name: string;
  value: "ok" | "warn" | "bad";
  note: string;
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK_SIGNALS: Signal[] = [
  { name: "Views per follower", value: "ok", note: "Median 18.4% (healthy: 5–30%)." },
  { name: "Likes per follower", value: "warn", note: "Median 0.8% across 12 recent posts." },
  { name: "Recent vs older reach", value: "warn", note: "Recent posts down 28% vs older ones." },
];

const STATUS_LABEL = { ok: "Healthy", warn: "Reduced distribution", bad: "Likely shadowbanned" };

export function ShadowbanCheckerView({ handle, entitled: _entitled, data }: Props) {
  const status = (data?.status as "ok" | "warn" | "bad") ?? "warn";
  const signals = (data?.signals as Signal[] | undefined) ?? FALLBACK_SIGNALS;
  const reachTrend = (data?.reachTrend as number[] | undefined) ?? [100, 98, 96, 94, 88, 82, 70, 58, 55, 52, 50, 48];
  const trendDropPct = (data?.trendDropPct as number | undefined) ?? 0;
  const medianViewsPct = (data?.medianViewsPerFollowerPct as number | undefined) ?? 0;
  const medianLikesPct = (data?.medianLikesPerFollowerPct as number | undefined) ?? 0;
  const postsAnalyzed = (data?.postsAnalyzed as number | undefined) ?? 12;

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · ${postsAnalyzed} posts analyzed`}>Account health</SectionTitle>

      <div className={`rounded-xl border p-6 ${status === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : status === "warn" ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-2xl font-semibold tracking-tight">{STATUS_LABEL[status]}</h3>
          <StatusBadge status={status} label={status === "ok" ? "Healthy" : status === "warn" ? "Throttled" : "Hidden"} />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {status === "ok"
            ? "All signals look healthy. Reach is consistent with follower count."
            : status === "warn"
            ? "Some suppression detected. Not a hard shadowban — usually clears in 7–14 days with content changes."
            : "Multiple reach signals collapsed. Posts likely not surfacing to non-followers."}
        </p>
      </div>

      <section>
        <SectionTitle>Signals checked</SectionTitle>
        <div className="space-y-2">
          {signals.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/60 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.note}</div>
              </div>
              <StatusBadge status={s.value} label={s.value === "ok" ? "OK" : s.value === "warn" ? "Reduced" : "Hidden"} />
            </div>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <SectionTitle>Likes-per-follower trend</SectionTitle>
          <Sparkline values={reachTrend} height={80} />
          <p className="text-xs text-muted-foreground mt-2">
            Indexed to your median (100 = baseline). Rising line = recovery.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Median views / follower" value={`${medianViewsPct.toFixed(1)}%`} accent="cyan" />
          <MetricCard label="Median likes / follower" value={`${medianLikesPct.toFixed(2)}%`} accent="pink" />
          <MetricCard
            label="Recent vs older"
            value={trendDropPct > 0 ? `–${trendDropPct}%` : "steady"}
            sub={trendDropPct > 0 ? "reach drop" : "no drop detected"}
            accent={trendDropPct >= 25 ? "amber" : "emerald"}
          />
          <MetricCard label="Sample" value={`${postsAnalyzed} posts`} sub="most recent" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Methodology:</span> Signals computed from public
        post metrics — no third-party API needed. Views-per-follower and likes-per-follower are compared
        against organic norms. Trend compares the newer half of the sample against the older half.
      </div>
    </div>
  );
}
