"use client";

import { LockedMetric, MetricCard, SectionTitle, Sparkline, StatusBadge } from "../primitives";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK = {
  hashtag: "growth",
  status: "warn" as "ok" | "warn" | "bad",
  postsCount24h: 48_210,
  firstFlaggedAt: "Mar 2026",
  reachDropPct: -62,
  searchVisibility: "Hidden",
  reachTrend: [100, 92, 85, 78, 64, 52, 38, 28, 32, 35, 30, 28],
  alternatives: ["growthhack", "growth2026", "thegrowth"],
};

const STATUS_LABEL: Record<string, string> = { ok: "Healthy", warn: "Restricted", bad: "Banned" };

export function BannedHashtagView({ handle, entitled, data }: Props) {
  const tag = ((data?.hashtag as string) ?? handle).replace(/^#/, "");
  const status = (data?.status as "ok" | "warn" | "bad") ?? FALLBACK.status;
  const postsCount24h = (data?.postsCount24h as number) ?? FALLBACK.postsCount24h;
  const firstFlaggedAt = (data?.firstFlaggedAt as string | null) ?? FALLBACK.firstFlaggedAt;
  const reachDropPct = (data?.reachDropPct as number) ?? FALLBACK.reachDropPct;
  const searchVisibility = (data?.searchVisibility as string) ?? FALLBACK.searchVisibility;
  const reachTrend = (data?.reachTrend as number[] | undefined) ?? FALLBACK.reachTrend;

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-6 flex items-start gap-4 ${
        status === "ok"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : status === "warn"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-red-500/30 bg-red-500/5"
      }`}>
        <div className={`${status === "ok" ? "text-emerald-300" : status === "warn" ? "text-amber-300" : "text-red-300"} text-3xl leading-none`}>#</div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-2xl font-semibold tracking-tight">#{tag}</h3>
            <StatusBadge status={status} label={STATUS_LABEL[status] ?? "Status"} />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {status === "ok"
              ? "Posts under this hashtag are reaching normal audiences. Safe to use."
              : status === "warn"
              ? "Posts using this hashtag are reaching fewer users than expected. Likely throttled — not a hard ban."
              : "This hashtag is hidden from the feed. Posts using it won't surface."}
          </p>
        </div>
      </div>

      <section>
        <SectionTitle>Free</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Status" value={STATUS_LABEL[status] ?? "—"} accent={status === "ok" ? "emerald" : status === "warn" ? "amber" : "red"} />
          <MetricCard label="Posts (24h)" value={postsCount24h.toLocaleString()} sub="public count" />
          <MetricCard label="First flagged" value={firstFlaggedAt ?? "—"} />
        </div>
      </section>

      <section>
        <SectionTitle>Locked report</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <LockedMetric label="Reach drop vs baseline" value={`${reachDropPct}%`} entitled={entitled} accent="red" />
          <LockedMetric label="Search visibility" value={searchVisibility} entitled={entitled} accent="amber" />
          <LockedMetric label="Safe alternatives" value={(data?.alternatives as string[] | undefined)?.length ?? 3} sub="ready to swap" entitled={entitled} accent="emerald" />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/60 p-5">
        <SectionTitle>Reach trend (30 days)</SectionTitle>
        <Sparkline values={reachTrend} blurred={!entitled} height={100} />
        <p className="text-xs text-muted-foreground mt-2">
          Index 100 = expected reach for the hashtag's typical post.
        </p>
      </section>
    </div>
  );
}
