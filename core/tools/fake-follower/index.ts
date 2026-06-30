import type { SocialTool } from "../types";

export const fakeFollower: SocialTool = {
  id: "fake-follower",
  name: "Real Follower Check",
  intentLabel: "How real is this follower count?",
  blurb: "Estimate the share of inactive, bot, and low-quality accounts in any public following.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "real-follower-check",
    title: "Real Follower Check — Instagram & TikTok",
    description: "See how much of an account's audience is real. Public-data analysis.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const audit = await data.getFollowerAudit(platform, handle, 3000);
    return {
      toolId: "fake-follower",
      platform,
      handle,
      free: {
        followers: profile.followers,
        sampleSize: audit.sampleSize,
      },
      locked: {
        realPct: audit.realPct,
        inactivePct: audit.inactivePct,
        botPct: audit.botPct,
        flagged: audit.flagged,
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
