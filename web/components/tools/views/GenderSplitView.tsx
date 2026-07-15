"use client";

import { CaveatBanner, MetricCard, SectionTitle } from "../primitives";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

interface ClassifiedName {
  name: string;
  gender: "male" | "female" | null;
  probability: number;
}

const SOURCE_LABEL: Record<string, string> = {
  followers: "Sampled from public follower list",
  commenters: "Sampled from recent commenters (followers not available for this account)",
  none: "No sample obtained",
};

export function GenderSplitView({ handle, data }: Props) {
  const insufficientData = (data?.insufficientData as boolean) ?? false;
  const reason = data?.reason as string | undefined;
  const malePct = data?.malePct as number | null;
  const femalePct = data?.femalePct as number | null;
  const unknownPct = (data?.unknownPct as number) ?? 0;
  const sampleSize = (data?.sampleSize as number) ?? 0;
  const classifiableCount = (data?.classifiableCount as number) ?? 0;
  const confidentClassifications = (data?.confidentClassifications as number) ?? 0;
  const source = (data?.source as string) ?? "none";
  const confidence = (data?.confidence as string) ?? "Low";
  const methodology = data?.methodology as string | undefined;
  const topNames = (data?.topClassifiedNames as ClassifiedName[] | undefined) ?? [];
  const caveat = data?.caveat as string | undefined;

  if (insufficientData) {
    return (
      <div className="space-y-6">
        <SectionTitle hint={`@${handle}`}>Audience gender split</SectionTitle>
        {caveat && <CaveatBanner>{caveat}</CaveatBanner>}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 space-y-3">
          <div className="text-xl font-semibold text-amber-200">Insufficient data</div>
          <p className="text-sm text-muted-foreground">{reason}</p>
          {sampleSize > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              <MetricCard label="Sample size" value={sampleSize.toLocaleString()} />
              <MetricCard label="Classifiable names" value={classifiableCount.toLocaleString()} />
            </div>
          )}
        </div>
        {methodology && (
          <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Methodology:</span> {methodology}
          </div>
        )}
      </div>
    );
  }

  const femaleWidth = Math.max(femalePct ?? 0, 0);
  const maleWidth = Math.max(malePct ?? 0, 0);

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · ${sampleSize.toLocaleString()} sampled`}>Audience gender split</SectionTitle>
      {caveat && <CaveatBanner>{caveat}</CaveatBanner>}

      <div className="rounded-xl border border-border bg-card/60 p-6 space-y-6">
        <div className="flex w-full h-6 rounded-full overflow-hidden border border-border/60">
          {femaleWidth > 0 && (
            <div
              className="bg-[hsl(322_95%_60%)] flex items-center justify-end pr-2 text-[10px] font-medium text-white"
              style={{ width: `${femaleWidth}%` }}
              title={`Female ${femaleWidth}%`}
            >
              F
            </div>
          )}
          {maleWidth > 0 && (
            <div
              className="bg-[hsl(220_90%_60%)] flex items-center justify-end pr-2 text-[10px] font-medium text-white"
              style={{ width: `${maleWidth}%` }}
              title={`Male ${maleWidth}%`}
            >
              M
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <SplitCard label="Female" value={femalePct ?? 0} colorClass="bg-[hsl(322_95%_60%)]" />
          <SplitCard label="Male" value={malePct ?? 0} colorClass="bg-[hsl(220_90%_60%)]" />
        </div>
      </div>

      <section>
        <SectionTitle>Sample details</SectionTitle>
        <div className="grid sm:grid-cols-4 gap-3">
          <MetricCard label="Sampled" value={sampleSize.toLocaleString()} sub={SOURCE_LABEL[source] ?? source} accent="cyan" />
          <MetricCard label="Classifiable" value={classifiableCount.toLocaleString()} sub="names we could parse" />
          <MetricCard label="Confident" value={confidentClassifications.toLocaleString()} sub="≥65% probability" accent="emerald" />
          <MetricCard label="Confidence" value={confidence} sub="High >60 · Med 30-60 · Low <30" accent={confidence === "High" ? "emerald" : confidence === "Medium" ? "amber" : "red"} />
        </div>
      </section>

      {topNames.length > 0 && (
        <section>
          <SectionTitle>Highest-confidence classifications</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {topNames.map((n) => (
              <div
                key={n.name}
                className={
                  "rounded-full px-3 py-1.5 text-sm border " +
                  (n.gender === "female"
                    ? "border-[hsl(322_95%_60%)]/50 bg-[hsl(322_95%_60%)]/10 text-[hsl(322_95%_80%)]"
                    : "border-[hsl(220_90%_60%)]/50 bg-[hsl(220_90%_60%)]/10 text-[hsl(220_90%_80%)]")
                }
              >
                <span className="font-medium capitalize">{n.name}</span>
                <span className="text-xs opacity-80 ml-1.5">
                  {n.gender} · {Math.round(n.probability * 100)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {unknownPct > 0 && (
        <div className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{unknownPct.toFixed(1)}% unclassified</span> —
          names we couldn&apos;t confidently gender-tag (non-Western names classify less accurately,
          or the name is genuinely ambiguous). These are excluded from the M/F percentages above.
        </div>
      )}

      {methodology && (
        <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">How this works:</span> {methodology}
        </div>
      )}
    </div>
  );
}

function SplitCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${colorClass}`} />
        {label}
      </div>
      <div className="text-4xl font-semibold mt-2 tabular-nums">
        {value.toFixed(1)}%
      </div>
    </div>
  );
}
