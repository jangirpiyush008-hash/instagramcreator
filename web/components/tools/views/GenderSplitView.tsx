"use client";

import { LockedMetric, MetricCard, SectionTitle } from "../primitives";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK = {
  malePct: 38,
  femalePct: 58,
  otherPct: 4,
  topAgeRange: "25–34",
  topCountry: "India",
  topCity: "Mumbai",
  sampleSize: 3000,
  method: "Public signals",
  confidence: "High",
};

export function GenderSplitView({ handle, entitled, data }: Props) {
  const d = {
    malePct: (data?.malePct as number) ?? FALLBACK.malePct,
    femalePct: (data?.femalePct as number) ?? FALLBACK.femalePct,
    otherPct: (data?.otherPct as number) ?? FALLBACK.otherPct,
    topAgeRange: (data?.topAgeRange as string) ?? FALLBACK.topAgeRange,
    topCountry: (data?.topCountry as string) ?? FALLBACK.topCountry,
    topCity: (data?.topCity as string) ?? FALLBACK.topCity,
    sampleSize: (data?.sampleSize as number) ?? FALLBACK.sampleSize,
    method: (data?.method as string) ?? FALLBACK.method,
    confidence: (data?.confidence as string) ?? FALLBACK.confidence,
  };

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · sampled audience`}>Audience demographics</SectionTitle>

      <div className="rounded-xl border border-border bg-card/60 p-6 space-y-6">
        <div className="flex w-full h-6 rounded-full overflow-hidden border border-border/60">
          <div className="bg-[hsl(322_95%_60%)] flex items-center justify-end pr-2 text-[10px] font-medium text-white" style={{ width: `${d.femalePct}%` }} title={`Female ${d.femalePct}%`}>
            <span className={entitled ? "" : "blur-locked"}>F</span>
          </div>
          <div className="bg-[hsl(220_90%_60%)] flex items-center justify-end pr-2 text-[10px] font-medium text-white" style={{ width: `${d.malePct}%` }} title={`Male ${d.malePct}%`}>
            <span className={entitled ? "" : "blur-locked"}>M</span>
          </div>
          <div className="bg-[hsl(45_95%_55%)] flex items-center justify-end pr-2 text-[10px] font-medium text-black" style={{ width: `${d.otherPct}%` }} title={`Other ${d.otherPct}%`}>
            <span className={entitled ? "" : "blur-locked"}>·</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <SplitCard label="Female" value={d.femalePct} colorClass="bg-[hsl(322_95%_60%)]" entitled={entitled} />
          <SplitCard label="Male" value={d.malePct} colorClass="bg-[hsl(220_90%_60%)]" entitled={entitled} />
          <SplitCard label="Other" value={d.otherPct} colorClass="bg-[hsl(45_95%_55%)]" entitled={entitled} />
        </div>
      </div>

      <section>
        <SectionTitle>Free</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Sample size" value={d.sampleSize.toLocaleString()} sub="randomized followers" accent="cyan" />
          <MetricCard label="Method" value={d.method} sub="profile name + photo cues" />
          <MetricCard label="Confidence" value={d.confidence} sub="3,000 ≫ 90% CI" accent="emerald" />
        </div>
      </section>

      <section>
        <SectionTitle>Locked report</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <LockedMetric label="Top age range" value={d.topAgeRange} entitled={entitled} accent="pink" />
          <LockedMetric label="Top country" value={d.topCountry} entitled={entitled} accent="cyan" />
          <LockedMetric label="Top city" value={d.topCity} entitled={entitled} accent="amber" />
        </div>
      </section>

      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
        Estimates inferred from public follower signals (display name, profile photo cues). Not a hard identification — directional only.
      </div>
    </div>
  );
}

function SplitCard({ label, value, colorClass, entitled }: { label: string; value: number; colorClass: string; entitled: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${colorClass}`} />
        {label}
      </div>
      <div className={"text-4xl font-semibold mt-2 tabular-nums " + (entitled ? "" : "blur-locked")}>
        {entitled ? `${value}%` : "••%"}
      </div>
    </div>
  );
}
