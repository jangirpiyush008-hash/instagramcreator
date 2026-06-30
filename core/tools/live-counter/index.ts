import type { SocialTool } from "../types";

export const liveCounter: SocialTool = {
  id: "live-counter",
  name: "Live Follower Counter",
  intentLabel: "Watch the follower count live",
  blurb: "Live, real-time follower / subscriber counter that updates every few seconds.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "live-follower-counter",
    title: "Live Follower Counter — Instagram & TikTok",
    description: "Watch any public account's follower count change in real time.",
  },
  async run({ platform, handle, data }) {
    const live = await data.getLiveCount(platform, handle);
    return {
      toolId: "live-counter",
      platform,
      handle,
      free: {
        current: live.current,
        refreshSec: 2,
        history: live.history,
      },
      locked: {
        perHour: live.perHour,
        perDayProjection: live.perDayProjection,
        reachOneMillionDays: live.perHour
          ? Math.max(1, Math.round((1_000_000 - live.current) / live.perHour / 24))
          : null,
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
