"use client";

import { Avatar, Donut, LockedMetric, MetricCard, SectionTitle } from "../primitives";
import type { Platform } from "@/core/types";

interface FlaggedEntry {
  username: string;
  note: string;
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK_FLAGGED: FlaggedEntry[] = [
  { username: "user_847291", note: "0 posts · default avatar · 12 followers" },
  { username: "marketinghack_pro", note: "Mass-follow pattern · spam comments" },
  { username: "buy.likes.now", note: "Bio link to follower service" },
  { username: "raj_8847_x", note: "Inactive 14 months" },
];

export function FakeFollowerView({ handle, entitled, data }: Props) {
  const followers = (data?.followers as number) ?? 184_320;
  const sampleSize = (data?.sampleSize as number) ?? 3_000;
  const realPct = (data?.realPct as number) ?? 72;
  const inactivePct = (data?.inactivePct as number) ?? 17;
  const botPct = (data?.botPct as number) ?? 11;
  const flagged = (data?.flagged as FlaggedEntry[] | undefined) ?? FALLBACK_FLAGGED;

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle}`}>Audience quality</SectionTitle>

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
          <MetricCard label="Sampled" value={sampleSize.toLocaleString()} sub="randomized sample" accent="cyan" />
          <LockedMetric label="Likely real" value={`${realPct}%`} entitled={entitled} accent="emerald" />
          <LockedMetric label="Bot / spam" value={`${botPct}%`} entitled={entitled} accent="red" />
        </div>
      </div>

      <section>
        <SectionTitle>Most-suspicious flagged accounts</SectionTitle>
        <div className="space-y-2">
          {flagged.map((u, i) => (
            <div key={u.username + i} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
              <Avatar name={u.username} size={36} hueSeed={i * 90} />
              <div className="flex-1 min-w-0">
                <div className={"text-sm font-medium truncate " + (entitled ? "" : "blur-locked")}>@{u.username}</div>
                <div className={"text-xs text-muted-foreground truncate " + (entitled ? "" : "blur-locked")}>{u.note}</div>
              </div>
              <div className="text-xs text-red-300">flagged</div>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
        Estimate based on a randomized sample of {sampleSize.toLocaleString()} followers. Larger samples
        available on the subscriber plan.
      </div>
    </div>
  );
}
