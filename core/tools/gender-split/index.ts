import type { SocialTool } from "../types";

export const genderSplit: SocialTool = {
  id: "gender-split",
  name: "Audience Demographics",
  intentLabel: "What's the male / female split?",
  blurb:
    "Estimate the audience demographics — male, female, and other — from public follower signals.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "audience-demographics",
    title: "Audience Demographics — Male / Female Split for Instagram & TikTok",
    description:
      "Estimate any public account's audience gender breakdown from public follower signals.",
  },
  async run({ platform, handle, data }) {
    const demo = await data.getDemographics(platform, handle);
    return {
      toolId: "gender-split",
      platform,
      handle,
      free: {
        sampleSize: demo.sampleSize,
        method: "Public signals",
        confidence: demo.sampleSize >= 1000 ? "High" : "Medium",
      },
      locked: {
        malePct: demo.malePct,
        femalePct: demo.femalePct,
        otherPct: demo.otherPct,
        topAgeRange: demo.topAgeRange,
        topCountry: demo.topCountry,
        topCity: demo.topCity,
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
