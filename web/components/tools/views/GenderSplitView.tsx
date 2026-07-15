"use client";

import { CaveatBanner, MetricCard, SectionTitle } from "../primitives";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

type AgeBrackets = {
  "18-24": number;
  "25-34": number;
  "35-44": number;
  "45+": number;
  unknown: number;
};

interface SignalsUsed {
  bio: number;
  face: number;
  name: number;
}

export function GenderSplitView({ handle, data }: Props) {
  const insufficientData = (data?.insufficientData as boolean) ?? false;
  const reason = data?.reason as string | undefined;
  const malePct = data?.malePct as number | null;
  const femalePct = data?.femalePct as number | null;
  const nonbinaryPct = (data?.nonbinaryPct as number) ?? 0;
  const unknownPct = (data?.unknownPct as number) ?? 0;
  const sampleSize = (data?.sampleSize as number) ?? 0;
  const profilesFetched = (data?.profilesFetched as number) ?? 0;
  const confidence = ((data?.confidence as string) ?? "low").toLowerCase();
  const methodology = data?.methodology as string | undefined;
  const caveat = data?.caveat as string | undefined;
  const ageBrackets = data?.ageBrackets as AgeBrackets | undefined;
  const signalsUsed = data?.signalsUsed as SignalsUsed | undefined;
  const faceAnalyzer = (data?.faceAnalyzer as string | undefined) ?? "mock";
  const completeness = data?.profileCompletenessPct as number | undefined;

  if (insufficientData) {
    return (
      <div className="space-y-6">
        <SectionTitle hint={`@${handle}`}>Audience demographics</SectionTitle>
        {caveat && <CaveatBanner>{caveat}</CaveatBanner>}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 space-y-3">
          <div className="text-xl font-semibold text-amber-200">Insufficient data</div>
          <p className="text-sm text-muted-foreground">{reason}</p>
          {sampleSize > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              <MetricCard label="Commenter sample" value={sampleSize.toLocaleString()} />
              <MetricCard label="Profiles resolved" value={profilesFetched.toLocaleString()} />
            </div>
          )}
        </div>
        {methodology && (
          <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">How this works:</span> {methodology}
          </div>
        )}
      </div>
    );
  }

  const femaleWidth = Math.max(femalePct ?? 0, 0);
  const maleWidth = Math.max(malePct ?? 0, 0);
  const nonbinaryWidth = Math.max(nonbinaryPct, 0);

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · ${profilesFetched.toLocaleString()} profiles analyzed`}>
        Audience demographics
      </SectionTitle>
      {caveat && <CaveatBanner>{caveat}</CaveatBanner>}

      {/* Gender split */}
      <div className="rounded-xl border border-border bg-card/60 p-6 space-y-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Gender split</div>
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
          {nonbinaryWidth > 0 && (
            <div
              className="bg-[hsl(268_84%_60%)] flex items-center justify-end pr-2 text-[10px] font-medium text-white"
              style={{ width: `${nonbinaryWidth}%` }}
              title={`Non-binary ${nonbinaryWidth}%`}
            >
              NB
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <SplitCard label="Female" value={femalePct ?? 0} colorClass="bg-[hsl(322_95%_60%)]" />
          <SplitCard label="Male" value={malePct ?? 0} colorClass="bg-[hsl(220_90%_60%)]" />
          <SplitCard label="Non-binary" value={nonbinaryPct} colorClass="bg-[hsl(268_84%_60%)]" />
        </div>
      </div>

      {/* Age brackets */}
      {ageBrackets && (
        <section className="rounded-xl border border-border bg-card/60 p-6 space-y-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Age brackets · estimated
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AgeCard label="18-24" pct={ageBrackets["18-24"]} />
            <AgeCard label="25-34" pct={ageBrackets["25-34"]} />
            <AgeCard label="35-44" pct={ageBrackets["35-44"]} />
            <AgeCard label="45+" pct={ageBrackets["45+"]} />
          </div>
          {ageBrackets.unknown > 50 && (
            <p className="text-xs text-muted-foreground">
              {ageBrackets.unknown.toFixed(0)}% unresolved — bio didn&apos;t include age, and
              face-based age estimation isn&apos;t configured for this deployment
              (analyzer: <span className="font-mono">{faceAnalyzer}</span>).
            </p>
          )}
        </section>
      )}

      {/* Sample + signal breakdown */}
      <section>
        <SectionTitle>Sample &amp; signals</SectionTitle>
        <div className="grid sm:grid-cols-4 gap-3">
          <MetricCard
            label="Profiles analyzed"
            value={profilesFetched.toLocaleString()}
            sub={`of ${sampleSize} sampled`}
            accent="cyan"
          />
          <MetricCard
            label="Confidence"
            value={confidence[0]?.toUpperCase() + confidence.slice(1)}
            sub="from signal coverage"
            accent={confidence === "high" ? "emerald" : confidence === "medium" ? "amber" : "red"}
          />
          {signalsUsed && (
            <>
              <MetricCard
                label="Bio-inferred"
                value={signalsUsed.bio.toLocaleString()}
                sub="strongest signal"
                accent="emerald"
              />
              <MetricCard
                label="Face + name"
                value={(signalsUsed.face + signalsUsed.name).toLocaleString()}
                sub={
                  faceAnalyzer === "mock"
                    ? `${signalsUsed.name} via name (face API not configured)`
                    : `${signalsUsed.face} via face · ${signalsUsed.name} via name`
                }
              />
            </>
          )}
        </div>
      </section>

      {typeof completeness === "number" && completeness > 0 && (
        <div className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {completeness.toFixed(0)}% audience-profile completeness
          </span>{" "}
          — % of sampled commenters with both a bio AND a custom avatar. Healthy audiences
          sit at 60%+; below 30% suggests bot-heavy engagement.
        </div>
      )}

      {unknownPct > 0 && (
        <div className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{unknownPct.toFixed(1)}% unresolved</span> —
          bio didn&apos;t give us a signal, no face match, and the display name wasn&apos;t in our
          dictionary. Excluded from the M/F percentages above (never guessed).
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

function AgeCard({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{pct.toFixed(0)}%</div>
      <div className="mt-2 h-1.5 rounded-full bg-border/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-ig"
          style={{ width: `${Math.min(100, pct * 2)}%` }}
        />
      </div>
    </div>
  );
}
