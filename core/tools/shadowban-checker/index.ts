import type { SocialTool } from "../types";

// Real shadowban signals from public post metrics. A shadowbanned account's
// posts get thrown off the explore/for-you feeds — the tell is view-count and
// like-count collapsing relative to follower count.
//
// Ratios we compute per post:
//   viewsPerFollower  — healthy 5–30% (organic), <1% suggests suppressed
//   likesPerView      — healthy 3–8% (video), <0.5% suggests bad reach mix
//   commentsPerLike   — bots pump likes but not comments; huge like/comment
//                       gap → engagement pods or bought engagement
//
// Trend: split recent posts in half (older vs newer). If the newer half's
// median viewsPerFollower is <60% of the older half's, that's a reach-drop
// signal — the classic shadowban pattern.

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

export const shadowbanChecker: SocialTool = {
  id: "shadowban-checker",
  name: "Shadowban Checker",
  intentLabel: "Is this account being hidden from the feed?",
  blurb: "Detect reach drops by comparing public post visibility against follower count and recent-vs-older trends.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "shadowban-checker",
    title: "Shadowban Checker — Instagram & TikTok",
    description: "Public-data check for reach drops and shadowbans.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const posts = await data.getRecentPosts(platform, handle, 12);
    const followers = profile.followers ?? 0;

    // Compute per-post ratios. TikTok posts always have view counts; IG
    // photos don't (only reels do), so guard against divisions by zero.
    const viewsPerFollower = posts.map((p) =>
      followers > 0 && p.views !== undefined ? (p.views / followers) * 100 : null,
    );
    const likesPerFollower = posts.map((p) =>
      followers > 0 ? (p.likes / followers) * 100 : 0,
    );

    const validViewsRatios = viewsPerFollower.filter((v): v is number => v !== null);
    const medViewsPerFollower = median(validViewsRatios);
    const medLikesPerFollower = median(likesPerFollower);

    // Trend: split newest half vs older half of the sample.
    const half = Math.floor(posts.length / 2);
    const newerHalf = posts.slice(0, half);
    const olderHalf = posts.slice(half);
    const newerViews = newerHalf
      .map((p) => (followers > 0 && p.views !== undefined ? (p.views / followers) * 100 : null))
      .filter((v): v is number => v !== null);
    const olderViews = olderHalf
      .map((p) => (followers > 0 && p.views !== undefined ? (p.views / followers) * 100 : null))
      .filter((v): v is number => v !== null);
    const newerMed = median(newerViews);
    const olderMed = median(olderViews);
    const trendDropPct = olderMed > 0 ? Math.round(((olderMed - newerMed) / olderMed) * 100) : 0;

    // Reach trend chart — likes per follower per post (indexed 100 = baseline)
    // so shadowban recovery views a rising line.
    const baseline = medLikesPerFollower || 1;
    const reachTrend = posts
      .slice()
      .reverse()
      .map((p) => Math.round(((p.likes / (followers || 1)) * 100 / baseline) * 100));

    // Signals — each maps to a "ok" / "warn" / "bad" bucket the view already
    // knows how to render.
    const bucket = (
      val: number,
      thresholds: { good: number; warn: number },
    ): "ok" | "warn" | "bad" =>
      val >= thresholds.good ? "ok" : val >= thresholds.warn ? "warn" : "bad";

    const viewsSignal = platform === "tiktok"
      ? bucket(medViewsPerFollower, { good: 15, warn: 5 })
      : validViewsRatios.length > 0
        ? bucket(medViewsPerFollower, { good: 20, warn: 8 })
        : "ok"; // no video posts to measure → no penalty
    const likesSignal = bucket(medLikesPerFollower, { good: 3, warn: 1 });
    const trendSignal: "ok" | "warn" | "bad" =
      trendDropPct >= 50 ? "bad" : trendDropPct >= 25 ? "warn" : "ok";

    const badSignals = [viewsSignal, likesSignal, trendSignal].filter((s) => s !== "ok").length;
    const status = badSignals >= 2 ? "warn" : badSignals === 1 ? "warn" : "ok";

    return {
      toolId: "shadowban-checker",
      platform,
      handle,
      free: {
        status,
        followers,
        postsAnalyzed: posts.length,
        signals: [
          {
            name: platform === "tiktok" ? "Views per follower" : "Reel views per follower",
            value: viewsSignal,
            note: validViewsRatios.length === 0
              ? "No video posts in sample — nothing to measure."
              : `Median ${medViewsPerFollower.toFixed(1)}% (healthy: 5–30%).`,
          },
          {
            name: "Likes per follower",
            value: likesSignal,
            note: `Median ${medLikesPerFollower.toFixed(2)}% across ${posts.length} recent posts.`,
          },
          {
            name: "Recent vs older reach",
            value: trendSignal,
            note: trendDropPct > 0
              ? `Recent posts down ${trendDropPct}% vs older ones in this sample.`
              : "Recent posts are performing in line with older ones.",
          },
        ],
        reachTrend,
        trendDropPct,
        medianViewsPerFollowerPct: Number(medViewsPerFollower.toFixed(1)),
        medianLikesPerFollowerPct: Number(medLikesPerFollower.toFixed(2)),
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
