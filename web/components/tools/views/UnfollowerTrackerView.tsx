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

function formatDelta(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toLocaleString()}`;
}

export function UnfollowerTrackerView({ handle, platform, data }: Props) {
  const followers = (data?.followers as number) ?? 0;
  const gathering = (data?.gathering as boolean) ?? false;
  const history = (data?.history as number[] | undefined) ?? [followers];
  const net7d = (data?.net7d as number) ?? 0;
  const lost7d = (data?.lost7d as number) ?? 0;
  const gained7d = (data?.gained7d as number) ?? 0;
  const net30d = (data?.net30d as number) ?? 0;
  const lost30d = (data?.lost30d as number) ?? 0;
  const gained30d = (data?.gained30d as number) ?? 0;
  const churn7dPct = (data?.churn7dPct as number) ?? 0;
  const snapshotCount = (data?.snapshotCount as number) ?? 1;
  const firstSnapshotAt = data?.firstSnapshotAt as string | undefined;
  const methodology = data?.methodology as string | undefined;
  const note = data?.note as string | undefined;

  const trendColor: "emerald" | "red" | "amber" =
    net7d > 0 ? "emerald" : net7d < 0 ? "red" : "amber";

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · ${platform}`}>Follower churn</SectionTitle>

      {gathering ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-2">
          <div className="text-xl font-semibold text-amber-200">First snapshot</div>
          <p className="text-sm text-muted-foreground">
            {note ?? "We captured this account's follower count for the first time."}
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <MetricCard label="Followers now" value={formatCount(followers)} accent="pink" />
            <MetricCard label="Snapshots stored" value={snapshotCount} sub="need at least 2 to compute churn" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-4 gap-3">
            <MetricCard label="Followers now" value={formatCount(followers)} accent="pink" />
            <MetricCard
              label="Net 7-day"
              value={formatDelta(net7d)}
              sub={net7d >= 0 ? `+${formatCount(gained7d)} gained` : `${formatCount(lost7d)} lost`}
              accent={trendColor}
            />
            <MetricCard
              label="Net 30-day"
              value={formatDelta(net30d)}
              sub={net30d >= 0 ? `+${formatCount(gained30d)} gained` : `${formatCount(lost30d)} lost`}
              accent={net30d > 0 ? "emerald" : net30d < 0 ? "red" : "amber"}
            />
            <MetricCard
              label="Weekly churn"
              value={`${churn7dPct.toFixed(2)}%`}
              sub={lost7d > 0 ? `${formatCount(lost7d)} lost / current` : "no loss detected"}
              accent={churn7dPct > 1 ? "red" : churn7dPct > 0 ? "amber" : "emerald"}
            />
          </div>

          <section className="rounded-xl border border-border bg-card/60 p-5">
            <SectionTitle hint={firstSnapshotAt ? `since ${new Date(firstSnapshotAt).toLocaleDateString()}` : "recent history"}>
              Follower count trend
            </SectionTitle>
            <Sparkline values={history} height={120} />
            <p className="text-xs text-muted-foreground mt-2">
              {snapshotCount.toLocaleString()} snapshot{snapshotCount === 1 ? "" : "s"} stored. Rising line = net growth, falling = net churn.
            </p>
          </section>
        </>
      )}

      {methodology && (
        <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">How this works:</span> {methodology}
        </div>
      )}
    </div>
  );
}
