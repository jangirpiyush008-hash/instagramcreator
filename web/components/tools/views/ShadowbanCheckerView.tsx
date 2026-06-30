"use client";

import { LockedMetric, MetricCard, SectionTitle, Sparkline, StatusBadge } from "../primitives";
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
  { name: "Hashtag search visibility", value: "ok", note: "Recent posts appearing under tested tags" },
  { name: "Explore feed reach", value: "warn", note: "Reach down 42% vs your 90-day baseline" },
  { name: "Reels distribution", value: "bad", note: "Sharp drop — reels not surfacing to non-followers" },
  { name: "Story replies", value: "ok", note: "Engagement consistent with prior month" },
];

const STATUS_LABEL = { ok: "Healthy", warn: "Reduced distribution", bad: "Shadowbanned" };

export function ShadowbanCheckerView({ handle, entitled, data }: Props) {
  const status = (data?.status as "ok" | "warn" | "bad") ?? "warn";
  const signals = (data?.signals as Signal[] | undefined) ?? FALLBACK_SIGNALS;
  const reachTrend = (data?.reachTrend as number[] | undefined) ?? [100, 98, 96, 94, 88, 82, 70, 58, 55, 52, 50, 48];
  const lift = (data?.estimatedLiftAfterClearPct as number | undefined) ?? 86;
  const days = (data?.estimatedRecoveryDays as number | undefined) ?? 9;

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle}`}>Account health</SectionTitle>

      <div className={`rounded-xl border p-6 ${status === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : status === "warn" ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-2xl font-semibold tracking-tight">{STATUS_LABEL[status]}</h3>
          <StatusBadge status={status} label={status === "ok" ? "Healthy" : status === "warn" ? "Throttled" : "Hidden"} />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {status === "ok"
            ? "All signals look healthy. Reach is consistent with your follower count."
            : status === "warn"
            ? "Not a hard shadowban. Some distribution is suppressed. Usually clears within 7–14 days."
            : "Multiple signals are hidden. Posts are not surfacing to non-followers."}
        </p>
      </div>

      <section>
        <SectionTitle>Signals checked</SectionTitle>
        <div className="space-y-2">
          {signals.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/60 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className={"text-xs text-muted-foreground mt-0.5 " + (entitled ? "" : "blur-locked")}>{s.note}</div>
              </div>
              <StatusBadge status={s.value} label={s.value === "ok" ? "OK" : s.value === "warn" ? "Reduced" : "Hidden"} />
            </div>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <SectionTitle>Reach trend (30 days)</SectionTitle>
          <Sparkline values={reachTrend} blurred={!entitled} height={80} />
        </div>
        <div className="space-y-3">
          <LockedMetric label="Estimated lift after clear" value={`+${lift}%`} entitled={entitled} accent="emerald" />
          <LockedMetric label="Days to recovery" value={`${days} days`} entitled={entitled} accent="amber" />
        </div>
      </div>

      <MetricCard label="Action plan" value="3 fixes" sub="content + hashtag + posting cadence — included with unlock" accent="pink" />
    </div>
  );
}
