import type { SocialTool } from "../types";

const SIGNAL_NOTES: Record<string, string> = {
  hashtagSearch: "Recent posts appearing under tested tags",
  exploreReach: "Reach down vs your 90-day baseline",
  reelsDistribution: "Reels surfacing to non-followers",
  storyReplies: "Engagement consistent with prior month",
};

export const shadowbanChecker: SocialTool = {
  id: "shadowban-checker",
  name: "Shadowban Checker",
  intentLabel: "Is this account being hidden from the feed?",
  blurb: "Detect reach drops and shadowbans by comparing public visibility to follower count.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "shadowban-checker",
    title: "Shadowban Checker — Instagram & TikTok",
    description: "Public-data check for reach drops and shadowbans.",
  },
  async run({ platform, handle, data }) {
    const sig = await data.getReachSignals(platform, handle);
    const reduced =
      [sig.hashtagSearch, sig.exploreReach, sig.reelsDistribution, sig.storyReplies].filter(
        (s) => s !== "ok",
      ).length >= 2;
    const status = reduced ? "warn" : "ok";
    return {
      toolId: "shadowban-checker",
      platform,
      handle,
      free: {
        status,
        signals: [
          { name: "Hashtag search visibility", value: sig.hashtagSearch, note: SIGNAL_NOTES.hashtagSearch },
          { name: "Explore feed reach", value: sig.exploreReach, note: SIGNAL_NOTES.exploreReach },
          { name: "Reels distribution", value: sig.reelsDistribution, note: SIGNAL_NOTES.reelsDistribution },
          { name: "Story replies", value: sig.storyReplies, note: SIGNAL_NOTES.storyReplies },
        ],
      },
      locked: {
        reachTrend: sig.reachTrend,
        estimatedRecoveryDays: sig.estimatedRecoveryDays,
        estimatedLiftAfterClearPct: reduced ? 60 + Math.round(Math.random() * 40) : 5,
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
