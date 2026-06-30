import type { SocialTool } from "../types";

export const earningsEstimator: SocialTool = {
  id: "earnings-estimator",
  name: "Earnings Estimator",
  intentLabel: "How much could this creator earn?",
  blurb:
    "Estimate brand-deal and ad rates from public engagement and follower numbers.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "earnings-estimator",
    title: "Creator Earnings Estimator — Instagram & TikTok",
    description: "Estimate what a public creator account is worth from real engagement.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const posts = await data.getRecentPosts(platform, handle, 12);
    const est = await data.estimateEarnings(platform, profile, posts);
    return {
      toolId: "earnings-estimator",
      platform,
      handle,
      free: {
        followers: profile.followers,
        niche: est.niche,
        postingCadencePerMonth: est.postingCadencePerMonth,
      },
      locked: {
        perPostMin: est.perPostMin,
        perPostMax: est.perPostMax,
        perMonth: est.perMonth,
        perYear: est.perYear,
        currency: est.currency,
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
