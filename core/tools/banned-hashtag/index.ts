import type { SocialTool } from "../types";

export const bannedHashtag: SocialTool = {
  id: "banned-hashtag",
  name: "Banned Hashtag Checker",
  intentLabel: "Is this hashtag banned or restricted?",
  blurb: "See which hashtags are flagged, restricted, or hiding posts from the feed.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "banned-hashtag-checker",
    title: "Banned Hashtag Checker — Instagram & TikTok",
    description: "Find out if a hashtag is restricted before you post.",
  },
  async run({ platform, handle, data }) {
    // Treat the input as a hashtag for this tool.
    const tag = handle.replace(/^#+/, "");
    const status = await data.getHashtagStatus(platform, tag);
    return {
      toolId: "banned-hashtag",
      platform,
      handle: tag,
      free: {
        hashtag: tag,
        status: status.status,
        postsCount24h: status.postsCount24h,
        firstFlaggedAt: status.firstFlaggedAt ?? null,
      },
      locked: {
        reachDropPct: status.reachDropPct,
        searchVisibility: status.searchVisibility,
        reachTrend: status.reachTrend,
        alternatives: status.alternatives,
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
