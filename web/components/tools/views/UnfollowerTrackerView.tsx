"use client";

import { Avatar, LockedMetric, MetricCard, SectionTitle, Sparkline } from "../primitives";
import type { Platform } from "@/core/types";

interface UnfollowerEntry {
  username: string;
  lostAt: string;
  followers: number;
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK_UNFOLLOWERS: UnfollowerEntry[] = [
  { username: "akhil.dev", lostAt: "2 hours ago", followers: 12_400 },
  { username: "neha.shops", lostAt: "Yesterday", followers: 980 },
  { username: "saanvi_writes", lostAt: "2 days ago", followers: 4_320 },
  { username: "the_rohit", lostAt: "3 days ago", followers: 28_900 },
  { username: "ananya.codes", lostAt: "4 days ago", followers: 1_240 },
];

export function UnfollowerTrackerView({ handle, entitled, data }: Props) {
  const followers = (data?.followers as number) ?? 184_320;
  const net7d = (data?.net7d as number) ?? 412;
  const gained = (data?.gained7d as number) ?? 1_124;
  const lost = (data?.lost7d as number) ?? 712;
  const since = (data?.trackedSince as string) ?? "Mar 4";
  const history = (data?.followerHistory as number[] | undefined) ?? [
    183_100, 183_240, 183_410, 183_580, 183_650, 183_720, 183_900, 184_030, 184_140, 184_220, 184_280, 184_320,
  ];
  const recent = (data?.recentUnfollowers as UnfollowerEntry[] | undefined) ?? FALLBACK_UNFOLLOWERS;
  const ghost = (data?.ghostFollowers as number) ?? 2_184;
  const mutualLost = (data?.mutualLost as number) ?? 42;

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · last 7 days`}>Follower changes</SectionTitle>

      <div className="grid sm:grid-cols-3 gap-3">
        <MetricCard label="Followers now" value={followers.toLocaleString()} accent="pink" />
        <MetricCard label="Net 7-day change" value={`${net7d >= 0 ? "+" : ""}${net7d.toLocaleString()}`} sub={`gained ${gained.toLocaleString()} · lost ${lost.toLocaleString()}`} accent="emerald" />
        <MetricCard label="Tracked since" value={since} sub="daily snapshots" accent="cyan" />
      </div>

      <section className="rounded-xl border border-border bg-card/60 p-5">
        <SectionTitle>Follower count, 30 days</SectionTitle>
        <Sparkline values={history} blurred={!entitled} height={120} />
      </section>

      <section>
        <SectionTitle hint={entitled ? `${recent.length} total` : "unlock to reveal"}>Recent unfollowers</SectionTitle>
        <div className="space-y-2">
          {recent.map((u, i) => (
            <div key={u.username + i} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
              <Avatar name={u.username} size={36} hueSeed={i * 70} />
              <div className="flex-1 min-w-0">
                <div className={"text-sm font-medium " + (entitled ? "" : "blur-locked")}>@{u.username}</div>
                <div className="text-xs text-muted-foreground">{u.lostAt} · {u.followers.toLocaleString()} followers</div>
              </div>
              <div className="text-xs text-muted-foreground">unfollowed</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-3">
        <LockedMetric label="Ghost followers" value={ghost.toLocaleString()} sub="haven't engaged in 90d" entitled={entitled} accent="amber" />
        <LockedMetric label="Mutual lost" value={mutualLost.toLocaleString()} sub="people you follow who unfollowed you" entitled={entitled} accent="red" />
      </div>
    </div>
  );
}
