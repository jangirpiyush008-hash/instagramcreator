import { readRecentSnapshots } from "@/core/data/snapshots";
import { supabaseService } from "@/core/database/supabase";
import type { SocialTool } from "../types";

// Real live-counter using stored follower snapshots. Every scan of any tool
// writes a snapshot (see scan API route), so history builds up passively.
//
//   - <2 snapshots → we return a "gathering data" state; the view shows the
//     current follower number and a "check back after the next scan" note.
//   - 2+ snapshots → compute per-hour delta from the oldest snapshot in the
//     window vs the current one, project per-day, and estimate time to the
//     next milestone (1M, 10M, or +10% of current, whichever is nearest).
//
// Not truly "live" (updates on scan, not by the second) — the tool name is a
// historical UI label. Under the hood this is honest tracked growth, which is
// what matters for the actual product value.

export const liveCounter: SocialTool = {
  id: "live-counter",
  name: "Follower Growth",
  intentLabel: "Watch this account grow over time",
  blurb: "Real follower growth tracked across every scan. Per-hour and per-day deltas from live data.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "live-follower-counter",
    title: "Live Follower Counter — Instagram & TikTok",
    description: "Track any public account's follower growth in real time.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const current = profile.followers;
    const supa = supabaseService();
    // Get up to the last 200 snapshots (30 days at ~7/day is well under this).
    const rows = await readRecentSnapshots(supa, platform, handle, 200);

    // The scan API writes THIS scan's snapshot AFTER tool.run() returns, so we
    // treat the current profile.followers as the newest data point here.
    if (rows.length === 0) {
      return {
        toolId: "live-counter",
        platform,
        handle,
        free: {
          current,
          followers: current,
          verified: profile.verified,
          following: profile.following,
          history: [current],
          historyLabels: ["now"],
          perHour: 0,
          perDayProjection: 0,
          sampleHours: 0,
          firstSnapshotAt: null,
          note: "First snapshot — refresh after any future scan to see growth.",
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

    // rows is newest-first. Oldest snapshot in the window is what we compare against.
    const oldest = rows[rows.length - 1]!;
    const oldestAt = new Date(oldest.taken_at).getTime();
    const nowMs = Date.now();
    const spanHours = Math.max((nowMs - oldestAt) / 3_600_000, 0.001);
    const delta = current - oldest.followers;
    const perHour = delta / spanHours;
    const perDayProjection = perHour * 24;

    // Nearest milestone: 1M, 10M, 100M, or +10% of current — whichever is
    // closest above current and reachable at the current rate.
    const milestones = [1_000_000, 10_000_000, 100_000_000, Math.ceil(current * 1.1)]
      .filter((m) => m > current)
      .sort((a, b) => a - b);
    const target = milestones[0] ?? current * 1.1;
    const daysToTarget =
      perDayProjection > 0 ? Math.round((target - current) / perDayProjection) : null;

    // History chart: oldest→newest, so lines rise left-to-right.
    const history = [...rows].reverse().map((r) => r.followers).concat([current]);
    const historyLabels = [...rows]
      .reverse()
      .map((r) => new Date(r.taken_at).toLocaleDateString())
      .concat(["now"]);

    return {
      toolId: "live-counter",
      platform,
      handle,
      free: {
        current,
        followers: current,
        verified: profile.verified,
        following: profile.following,
        history,
        historyLabels,
        perHour: Number(perHour.toFixed(2)),
        perDayProjection: Math.round(perDayProjection),
        sampleHours: Number(spanHours.toFixed(1)),
        firstSnapshotAt: oldest.taken_at,
        targetMilestone: target,
        daysToTarget,
        deltaSinceOldest: delta,
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
