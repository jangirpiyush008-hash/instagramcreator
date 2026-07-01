"use client";

import { MetricCard, SectionTitle, Sparkline } from "../primitives";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

function formatSpan(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  const days = hours / 24;
  return `${days.toFixed(1)} days`;
}

export function LiveCounterView({ handle, platform, data }: Props) {
  const current = (data?.current as number) ?? 0;
  const history = (data?.history as number[] | undefined) ?? [current];
  const perHour = (data?.perHour as number) ?? 0;
  const perDay = (data?.perDayProjection as number) ?? 0;
  const sampleHours = (data?.sampleHours as number) ?? 0;
  const firstSnapshotAt = data?.firstSnapshotAt as string | null | undefined;
  const target = (data?.targetMilestone as number | undefined) ?? null;
  const daysToTarget = (data?.daysToTarget as number | null | undefined) ?? null;
  const deltaSince = (data?.deltaSinceOldest as number | undefined) ?? 0;
  const note = data?.note as string | undefined;

  const isFirst = sampleHours === 0 || !firstSnapshotAt;
  const growing = deltaSince > 0;
  const shrinking = deltaSince < 0;

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · ${platform}`}>Follower growth</SectionTitle>

      <div className="rounded-2xl border border-border surface p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Right now</div>
        <div className="mt-3 text-6xl sm:text-7xl font-bold tabular-nums tracking-tight gradient-text-ig">
          {formatCount(current)}
        </div>
        {!isFirst && (
          <div
            className={
              "mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs " +
              (growing
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : shrinking
                  ? "bg-red-500/15 text-red-300 border-red-500/30"
                  : "bg-muted text-muted-foreground border-border")
            }
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {growing
              ? `+${formatCount(deltaSince)} since ${formatSpan(sampleHours)} ago`
              : shrinking
                ? `${formatCount(deltaSince)} since ${formatSpan(sampleHours)} ago`
                : `flat over ${formatSpan(sampleHours)}`}
          </div>
        )}
        {history.length > 1 && (
          <div className="mt-6 max-w-xl mx-auto">
            <Sparkline values={history} height={60} />
          </div>
        )}
      </div>

      {isFirst ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
          <div className="font-medium text-amber-200">
            {note ?? "First snapshot — no history yet."}
          </div>
          <p className="text-muted-foreground mt-1">
            We captured this account's follower count for the first time. Come back after any future
            scan (or scan a different tool for the same handle) to see per-hour growth.
          </p>
        </div>
      ) : (
        <>
          <section>
            <SectionTitle>Growth signals</SectionTitle>
            <div className="grid sm:grid-cols-3 gap-3">
              <MetricCard
                label="Per hour"
                value={`${perHour >= 0 ? "+" : ""}${perHour.toFixed(1)}`}
                sub={`over the last ${formatSpan(sampleHours)}`}
                accent="pink"
              />
              <MetricCard
                label="Per day"
                value={`${perDay >= 0 ? "+" : ""}${formatCount(perDay)}`}
                sub="projection at current rate"
                accent="cyan"
              />
              <MetricCard
                label="Change since first snap"
                value={`${growing ? "+" : ""}${formatCount(deltaSince)}`}
                sub={`captured ${firstSnapshotAt ? new Date(firstSnapshotAt).toLocaleString() : ""}`}
                accent={growing ? "emerald" : shrinking ? "red" : "amber"}
              />
            </div>
          </section>

          {target && daysToTarget !== null && daysToTarget > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Next milestone</div>
              <div className="mt-2 text-2xl font-semibold">
                {formatCount(target)} followers in ~{daysToTarget} days
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                At the current per-day growth rate. Actual pace varies with viral posts / drops.
              </p>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">How it works:</span> Every time anyone scans
        this account for any tool, we record a follower snapshot. The growth rates above are computed
        from real snapshots — not a client-side ticker.
      </div>
    </div>
  );
}
