"use client";

import { CaveatBanner, Donut, MetricCard, SectionTitle } from "../primitives";
import type { Platform } from "@/core/types";

interface Reason {
  flag: string;
  note: string;
  delta: number;
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

export function FakeFollowerView({ handle, entitled, data }: Props) {
  const followers = (data?.followers as number) ?? 184_320;
  const realPct = (data?.realPct as number) ?? 72;
  const inactivePct = (data?.inactivePct as number) ?? 17;
  const botPct = (data?.botPct as number) ?? 11;
  const erPct = (data?.engagementRatePct as number) ?? 2.4;
  const following = (data?.following as number) ?? 0;
  const postsAnalyzed = (data?.postsAnalyzed as number) ?? 0;
  const verified = (data?.verified as boolean) ?? false;
  const reasons = (data?.reasons as Reason[] | undefined) ?? [];
  const methodology = (data?.methodology as string | undefined);
  const caveat = data?.caveat as string | undefined;

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · ${postsAnalyzed} posts analyzed`}>Audience quality</SectionTitle>
      {caveat && <CaveatBanner>{caveat}</CaveatBanner>}

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
        <div className="rounded-xl border border-border bg-card/60 p-6 flex items-center justify-center">
          <Donut
            entitled={entitled}
            segments={[
              { label: "Real", pct: realPct, color: "hsl(322 95% 60%)" },
              { label: "Inactive", pct: inactivePct, color: "hsl(45 95% 55%)" },
              { label: "Bot / spam", pct: botPct, color: "hsl(0 84% 60%)" },
            ]}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3 content-start">
          <MetricCard label="Followers" value={followers.toLocaleString()} accent="pink" />
          <MetricCard label="Following" value={following.toLocaleString()} />
          <MetricCard label="Engagement rate" value={`${erPct.toFixed(2)}%`} accent="cyan" />
          <MetricCard label="Verified" value={verified ? "Yes" : "No"} accent={verified ? "emerald" : "amber"} />
        </div>
      </div>

      <section>
        <SectionTitle>What we found</SectionTitle>
        {reasons.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 text-sm">
            <span className="text-emerald-300 font-medium">Looks healthy.</span>{" "}
            <span className="text-muted-foreground">
              Engagement rate, follow ratio, and verification status all in the normal range for an
              organic account of this size.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {reasons.map((r, i) => (
              <div key={i} className="rounded-xl border border-border bg-card/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-wider text-red-300 font-medium">
                    –{Math.abs(r.delta)}
                  </span>
                  <div className="text-sm font-medium">{r.flag}</div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{r.note}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {methodology && (
        <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Methodology:</span> {methodology}
        </div>
      )}
    </div>
  );
}
