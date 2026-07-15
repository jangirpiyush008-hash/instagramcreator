"use client";

import { CaveatBanner, MetricCard, SectionTitle, StatusBadge } from "../primitives";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const STATUS_LABEL: Record<string, string> = {
  ok: "Healthy",
  warn: "Restricted",
  bad: "Banned",
  unknown: "Unknown",
};

const STATUS_HEADLINE: Record<string, string> = {
  ok: "Posts using this hashtag are reaching normal audiences. Safe to use.",
  warn: "Recent posts under this hashtag are throttled or partially hidden. Use with caution.",
  bad: "This hashtag is hidden from search. Posts using it will not surface to non-followers.",
  unknown: "Not on our curated flagged-hashtag list — we can't confirm a green light without a partner API.",
};

export function BannedHashtagView({ handle, data }: Props) {
  const tag = ((data?.hashtag as string) ?? handle).replace(/^#/, "");
  const status = (data?.status as "ok" | "warn" | "bad" | "unknown") ?? "unknown";
  const reason = data?.reason as string | undefined;
  const searchVisibility = data?.searchVisibility as string | undefined;
  const alternatives = (data?.alternatives as string[] | undefined) ?? [];
  const checkedAgainst = data?.checkedAgainst as number | undefined;
  const methodology = data?.methodology as string | undefined;
  const caveat = data?.caveat as string | undefined;
  const ytRules = data?.ytRules as { rule: string; detail: string }[] | undefined;

  const borderClass =
    status === "ok"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : status === "warn"
        ? "border-amber-500/30 bg-amber-500/5"
        : status === "bad"
          ? "border-red-500/30 bg-red-500/5"
          : "border-border bg-card/60";
  const badgeStatus: "ok" | "warn" | "bad" =
    status === "ok" ? "ok" : status === "bad" ? "bad" : "warn";

  return (
    <div className="space-y-6">
      {caveat && <CaveatBanner>{caveat}</CaveatBanner>}
      <div className={`rounded-xl border p-6 flex items-start gap-4 ${borderClass}`}>
        <div className="text-3xl leading-none text-muted-foreground">#</div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-2xl font-semibold tracking-tight">#{tag}</h3>
            <StatusBadge status={badgeStatus} label={STATUS_LABEL[status] ?? "Status"} />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {STATUS_HEADLINE[status]}
          </p>
          {reason && (
            <p className="text-sm mt-2">{reason}</p>
          )}
        </div>
      </div>

      <section>
        <SectionTitle>Results</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard
            label="Status"
            value={STATUS_LABEL[status] ?? "—"}
            accent={status === "ok" ? "emerald" : status === "bad" ? "red" : "amber"}
          />
          <MetricCard
            label="Search visibility"
            value={searchVisibility ?? "unknown"}
          />
          <MetricCard
            label="Checked against"
            value={checkedAgainst ? `${checkedAgainst} tags` : "—"}
            sub="curated flagged list"
          />
        </div>
      </section>

      {ytRules && ytRules.length > 0 && (
        <section>
          <SectionTitle>What YouTube actually enforces</SectionTitle>
          <div className="space-y-2">
            {ytRules.map((r) => (
              <div key={r.rule} className="rounded-xl border border-border bg-card/60 p-4">
                <div className="font-medium text-sm">{r.rule}</div>
                <div className="text-xs text-muted-foreground mt-1">{r.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {alternatives.length > 0 && (
        <section>
          <SectionTitle>Safer alternatives to swap in</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {alternatives.map((alt) => (
              <span
                key={alt}
                className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm"
              >
                #{alt}
              </span>
            ))}
          </div>
        </section>
      )}

      {methodology && (
        <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Methodology:</span> {methodology}
        </div>
      )}
    </div>
  );
}
