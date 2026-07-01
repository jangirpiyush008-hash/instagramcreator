import type { SocialTool } from "../types";

// Detailed engagement-rate analytics — same shape works for IG / TikTok / YouTube.
//
// Beyond the headline % we add:
//   - per-post breakdown so users can see WHICH posts drove the score
//   - median + stdev so a single viral post can't distort the picture
//   - consistency score = how tight the distribution is (lower stdev = better)
//   - views-per-follower efficiency for platforms with view counts
//   - comment-to-like ratio as a quality signal (bots pump likes, not comments)
//   - posting cadence from real timestamps
//   - follower-size benchmark table with the "healthy ER" range for accounts
//     of similar scale

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

function stdev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sq = nums.map((n) => (n - mean) ** 2);
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / nums.length);
}

// Follower-size ER benchmark. Bigger accounts always get lower ER because the
// audience gets more diverse and less activated per-post. Ranges below reflect
// widely-cited creator-industry data (Hopper HQ / Later / Influencer Marketing
// Hub averages, cross-checked against public sources).
function benchmarkFor(followers: number, platform: string): {
  band: string;
  healthyMin: number;
  healthyMax: number;
} {
  const platformFloor: Record<string, number> = {
    instagram: 0.6,
    tiktok: 2.5,
    youtube: 1.0,
  };
  const floor = platformFloor[platform] ?? 1.0;
  if (followers < 10_000) {
    return { band: "nano (<10K)", healthyMin: floor * 3, healthyMax: floor * 6 };
  }
  if (followers < 100_000) {
    return { band: "micro (10K–100K)", healthyMin: floor * 2, healthyMax: floor * 4 };
  }
  if (followers < 1_000_000) {
    return { band: "mid (100K–1M)", healthyMin: floor * 1.2, healthyMax: floor * 2.5 };
  }
  if (followers < 10_000_000) {
    return { band: "macro (1M–10M)", healthyMin: floor * 0.6, healthyMax: floor * 1.5 };
  }
  return { band: "mega (>10M)", healthyMin: floor * 0.3, healthyMax: floor * 1.0 };
}

export const engagementRate: SocialTool = {
  id: "engagement-rate",
  name: "Engagement Rate",
  intentLabel: "How engaged is this audience?",
  blurb:
    "Detailed per-post engagement analytics: median, distribution, comment quality, posting cadence, and follower-size benchmark.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "engagement-rate-calculator",
    title: "Free Engagement Rate Calculator — Instagram, TikTok & YouTube",
    description:
      "Full engagement analytics for any public account: per-post ER, medians, benchmark, posting cadence. Public data only.",
  },
  async run({ platform, handle, data, params }) {
    const requested = Number(params?.postCount);
    const postCount = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.max(Math.round(requested), 3), 50)
      : 12;
    const profile = await data.getProfile(platform, handle);
    const posts = await data.getRecentPosts(platform, handle, postCount);
    const followers = profile.followers ?? 0;

    // Per-post ER + supporting metrics.
    const perPost = posts.map((p) => {
      const engagement = p.likes + p.comments;
      const er = followers > 0 ? (engagement / followers) * 100 : 0;
      const viewsPerFollowerPct =
        followers > 0 && p.views !== undefined ? (p.views / followers) * 100 : null;
      const commentToLikeRatio = p.likes > 0 ? p.comments / p.likes : 0;
      return {
        id: p.id,
        postedAt: p.postedAt,
        likes: p.likes,
        comments: p.comments,
        views: p.views ?? null,
        engagementRatePct: Number(er.toFixed(2)),
        viewsPerFollowerPct: viewsPerFollowerPct !== null
          ? Number(viewsPerFollowerPct.toFixed(2))
          : null,
        commentToLikeRatio: Number(commentToLikeRatio.toFixed(4)),
        thumbnailUrl: p.thumbnailUrl,
        thumbnailUrlHd: p.thumbnailUrlHd,
        videoUrl: p.videoUrl,
        videoUrlHd: p.videoUrlHd,
        permalink: p.permalink,
        caption: p.caption,
        title: p.title,
        durationSec: p.durationSec,
      };
    });

    // Aggregate stats.
    const erValues = perPost.map((p) => p.engagementRatePct);
    const totals = posts.reduce(
      (a, p) => ({ likes: a.likes + p.likes, comments: a.comments + p.comments }),
      { likes: 0, comments: 0 },
    );
    const n = Math.max(posts.length, 1);
    const avgEngagement = (totals.likes + totals.comments) / n;
    const meanEr = followers > 0 ? (avgEngagement / followers) * 100 : 0;
    const medianEr = median(erValues);
    const stdevEr = stdev(erValues);
    const bestPost = [...perPost].sort((a, b) => b.engagementRatePct - a.engagementRatePct)[0] ?? null;
    const worstPost = [...perPost].sort((a, b) => a.engagementRatePct - b.engagementRatePct)[0] ?? null;

    // Views efficiency (only if any post has views — IG carousels don't).
    const viewsRatios = perPost
      .map((p) => p.viewsPerFollowerPct)
      .filter((v): v is number => v !== null);
    const medianViewsPerFollower = median(viewsRatios);

    // Comment-quality: median comment-to-like ratio. Very low = engagement is
    // shallow (people tap heart, don't type); very high = deep engagement or
    // controversy. Organic norms sit around 0.5-2%.
    const clRatios = perPost.map((p) => p.commentToLikeRatio);
    const medianCommentToLike = median(clRatios) * 100;

    // Posting cadence — posts per week over the observed sample window.
    const validDates = posts
      .map((p) => new Date(p.postedAt).getTime())
      .filter((t) => Number.isFinite(t) && t > 0);
    let postsPerWeek = 0;
    if (validDates.length >= 2) {
      const minT = Math.min(...validDates);
      const maxT = Math.max(...validDates);
      const spanWeeks = Math.max((maxT - minT) / (7 * 86_400_000), 0.1);
      postsPerWeek = Number((validDates.length / spanWeeks).toFixed(1));
    }

    // Consistency label: lower stdev-to-mean ratio = more consistent.
    const consistencyRatio = meanEr > 0 ? stdevEr / meanEr : 0;
    const consistency =
      consistencyRatio < 0.4 ? "Very consistent" :
      consistencyRatio < 0.8 ? "Consistent" :
      consistencyRatio < 1.5 ? "Variable" :
      "Highly variable";

    // Benchmark for this account's follower band.
    const bench = benchmarkFor(followers, platform);
    const benchmarkVerdict: "below" | "healthy" | "above" =
      meanEr < bench.healthyMin ? "below" :
      meanEr > bench.healthyMax ? "above" :
      "healthy";
    const benchmarkLabel =
      benchmarkVerdict === "above" ? "above average" :
      benchmarkVerdict === "below" ? "below average" :
      "average";

    // Trend for the sparkline (oldest → newest).
    const trend = perPost.slice().reverse().map((p) => p.engagementRatePct);

    // Top 3 posts by engagement — for the MediaCard gallery in the view.
    const topPosts = [...perPost]
      .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
      .slice(0, 3);

    return {
      toolId: "engagement-rate",
      platform,
      handle,
      free: {
        displayName: profile.displayName ?? handle,
        followers,
        following: profile.following,
        verified: profile.verified,
        avatarUrl: profile.avatarUrl,
        postsAnalyzed: posts.length,

        // Headline
        engagementRatePct: Number(meanEr.toFixed(2)),
        benchmark: benchmarkLabel,
        benchmarkVerdict,
        benchmarkBand: bench.band,
        benchmarkHealthyMin: Number(bench.healthyMin.toFixed(2)),
        benchmarkHealthyMax: Number(bench.healthyMax.toFixed(2)),

        // Aggregate stats
        avgLikes: Math.round(totals.likes / n),
        avgComments: Math.round(totals.comments / n),
        medianEngagementRatePct: Number(medianEr.toFixed(2)),
        stdevEngagementRatePct: Number(stdevEr.toFixed(2)),
        consistency,
        consistencyRatio: Number(consistencyRatio.toFixed(2)),

        // Reach
        medianViewsPerFollowerPct: viewsRatios.length > 0
          ? Number(medianViewsPerFollower.toFixed(1))
          : null,
        postsWithViews: viewsRatios.length,

        // Quality
        medianCommentToLikePct: Number(medianCommentToLike.toFixed(2)),

        // Cadence
        postsPerWeek,
        oldestPostAt: validDates.length ? new Date(Math.min(...validDates)).toISOString() : null,
        newestPostAt: validDates.length ? new Date(Math.max(...validDates)).toISOString() : null,

        // Best / worst
        bestPost,
        worstPost,

        // Charts + galleries
        trend,
        perPost,
        topPosts,
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
