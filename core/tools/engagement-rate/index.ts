import type { SocialTool } from "../types";

export const engagementRate: SocialTool = {
  id: "engagement-rate",
  name: "Engagement Rate",
  intentLabel: "How engaged is this audience?",
  blurb:
    "Average interactions per post as a percent of followers. The single number creators and brands look at first.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "engagement-rate-calculator",
    title: "Free Engagement Rate Calculator — Instagram & TikTok",
    description:
      "Check any public account's real engagement rate in seconds. Public data only — the account is never notified.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const posts = await data.getRecentPosts(platform, handle, 12);
    const totals = posts.reduce(
      (a, p) => ({ likes: a.likes + p.likes, comments: a.comments + p.comments }),
      { likes: 0, comments: 0 },
    );
    const n = Math.max(posts.length, 1);
    const avg = (totals.likes + totals.comments) / n;
    const er = profile.followers ? (avg / profile.followers) * 100 : 0;
    const trend = posts
      .slice()
      .reverse()
      .map((p) =>
        profile.followers
          ? ((p.likes + p.comments) / profile.followers) * 100
          : 0,
      );
    // Top 3 posts by engagement, so the view can render playable/downloadable
    // MediaCards for the posts that drove the score.
    const topPosts = posts
      .slice()
      .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
      .slice(0, 3);
    return {
      toolId: "engagement-rate",
      platform,
      handle,
      free: {
        displayName: profile.displayName ?? handle,
        followers: profile.followers,
        verified: profile.verified,
        postsAnalyzed: posts.length,
        trend,
        engagementRatePct: Number(er.toFixed(2)),
        avgLikes: Math.round(totals.likes / n),
        avgComments: Math.round(totals.comments / n),
        benchmark: er > 3 ? "above average" : er > 1 ? "average" : "below average",
        topPosts,
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
