import { readRecentSnapshots } from "@/core/data/snapshots";
import { supabaseService } from "@/core/database/supabase";
import type { SocialTool } from "../types";

// Honest count-delta version. We can't reliably show WHO unfollowed without
// crawling the full follower list every day (thousands of API calls per big
// account) — so we surface the count-based signal instead: net change,
// gross gains, gross losses, and a weekly churn rate from the snapshots
// we already collect on every scan.
//
// When users pay for the tracked-accounts subscription later, this is where
// the full follower-list diff would slot in as an add-on layer.

function bucketByDay(rows: { followers: number; taken_at: string }[]) {
  // rows are newest-first; group by YYYY-MM-DD, keep the last-seen count per day.
  const map = new Map<string, number>();
  for (const r of rows) {
    const day = r.taken_at.slice(0, 10);
    if (!map.has(day)) map.set(day, r.followers);
  }
  // Oldest-first for chart display.
  return [...map.entries()].reverse().map(([day, count]) => ({ day, count }));
}

function windowDelta(
  rows: { followers: number; taken_at: string }[],
  currentFollowers: number,
  windowDays: number,
): { net: number; lost: number; gained: number; sampleHours: number } | null {
  if (rows.length === 0) return null;
  const cutoff = Date.now() - windowDays * 86_400_000;
  // rows are newest-first — find the first snapshot older than the cutoff.
  const anchor = rows.find((r) => new Date(r.taken_at).getTime() <= cutoff) ?? rows[rows.length - 1]!;
  const anchorAt = new Date(anchor.taken_at).getTime();
  const spanHours = Math.max((Date.now() - anchorAt) / 3_600_000, 0.001);
  const net = currentFollowers - anchor.followers;
  // We don't have per-user follows/unfollows without a full follower crawl.
  // Attribute the whole net to either gains OR losses depending on sign — a
  // deliberate simplification that we surface in the methodology note.
  const gained = net > 0 ? net : 0;
  const lost = net < 0 ? -net : 0;
  return { net, lost, gained, sampleHours: spanHours };
}

export const unfollowerTracker: SocialTool = {
  id: "unfollower-tracker",
  name: "Follower Churn Tracker",
  intentLabel: "Is this account losing followers?",
  blurb: "Track follower gains and losses over 7 and 30-day windows. Honest count-delta from real snapshots.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "unfollower-tracker",
    title: "Follower Churn Tracker — Instagram & TikTok",
    description: "See real follower gain and loss trends across any public account.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const supa = supabaseService();
    const rows = await readRecentSnapshots(supa, platform, handle, 200);
    const current = profile.followers;

    const week = windowDelta(rows, current, 7);
    const month = windowDelta(rows, current, 30);

    // Daily-bucketed chart of the last 30 days.
    const daily = bucketByDay(rows);
    const history = [...daily.map((d) => d.count), current];
    const historyLabels = [...daily.map((d) => d.day), "now"];

    // Weekly churn rate: lost / current, as a percentage.
    const churn7dPct = week && current > 0 ? Number(((week.lost / current) * 100).toFixed(2)) : 0;

    if (rows.length === 0) {
      return {
        toolId: "unfollower-tracker",
        platform,
        handle,
        free: {
          followers: current,
          following: profile.following,
          verified: profile.verified,
          gathering: true,
          note: "First snapshot — check back after any future scan to see churn.",
          history: [current],
          historyLabels: ["now"],
          net7d: 0,
          lost7d: 0,
          gained7d: 0,
          net30d: 0,
          lost30d: 0,
          gained30d: 0,
          churn7dPct: 0,
          snapshotCount: 1,
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      toolId: "unfollower-tracker",
      platform,
      handle,
      free: {
        followers: current,
        following: profile.following,
        verified: profile.verified,
        gathering: false,
        history,
        historyLabels,
        net7d: week?.net ?? 0,
        lost7d: week?.lost ?? 0,
        gained7d: week?.gained ?? 0,
        net30d: month?.net ?? 0,
        lost30d: month?.lost ?? 0,
        gained30d: month?.gained ?? 0,
        churn7dPct,
        snapshotCount: rows.length,
        firstSnapshotAt: rows[rows.length - 1]?.taken_at,
        methodology:
          "Computed from follower-count snapshots taken on each scan. Shows NET change per window — we don't crawl the full follower list, so we can't identify individual unfollowers without spending 1000+ API calls per snapshot.",
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
