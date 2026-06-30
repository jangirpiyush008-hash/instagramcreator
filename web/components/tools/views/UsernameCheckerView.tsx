"use client";

import { LockedMetric, MetricCard, SectionTitle, StatusBadge } from "../primitives";
import type { Platform } from "@/core/types";

interface PlatformDetail {
  platform: Platform;
  label?: string;
  available: boolean;
  takenBy?: { followers: number; lastActiveAgo: string };
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK_ROWS: PlatformDetail[] = [
  { platform: "instagram", label: "Instagram", available: false, takenBy: { followers: 184_320, lastActiveAgo: "2d ago" } },
  { platform: "tiktok", label: "TikTok", available: true },
];

const FALLBACK_ALTS = ["creator.official", "creator_hq", "the.creator", "creator.in", "creator_now"];

export function UsernameCheckerView({ handle, entitled, data }: Props) {
  const rowsFromApi = (data?.platformsDetail as PlatformDetail[] | undefined) ??
    (data?.platforms as PlatformDetail[] | undefined);
  const rows = rowsFromApi ?? FALLBACK_ROWS;
  const alternatives = (data?.alternatives as string[] | undefined) ?? FALLBACK_ALTS;

  return (
    <div className="space-y-6">
      <SectionTitle hint={`across ${rows.length} platforms`}>Availability for @{handle}</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.label ?? r.platform} className="rounded-xl border border-border bg-card/60 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{r.label ?? r.platform}</div>
              {r.available ? (
                <StatusBadge status="ok" label="Available" />
              ) : (
                <StatusBadge status="bad" label="Taken" />
              )}
            </div>
            {r.available ? (
              <div className="mt-4">
                <div className="text-2xl font-semibold text-emerald-300">@{handle}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Free to grab — go register before someone else does.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <LockedMetric
                  label="Followers on taken account"
                  value={r.takenBy?.followers?.toLocaleString() ?? "—"}
                  entitled={entitled}
                />
                <LockedMetric
                  label="Last active"
                  value={r.takenBy?.lastActiveAgo ?? "—"}
                  entitled={entitled}
                  accent="amber"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card/40 p-5">
        <SectionTitle>Suggested alternatives</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {alternatives.map((s) => (
            <span
              key={s}
              className={
                "rounded-full border border-border bg-background/40 px-3 py-1 text-sm " +
                (entitled ? "" : "blur-locked")
              }
            >
              @{s}
            </span>
          ))}
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-3">
        <MetricCard label="Free" value="Availability" sub="across all platforms, every time" accent="pink" />
        <MetricCard label="Locked" value="Owner detail" sub="follower count & last-active per taken account" accent="cyan" />
      </div>
    </div>
  );
}
