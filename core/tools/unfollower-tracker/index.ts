import type { SocialTool } from "../types";

export const unfollowerTracker: SocialTool = {
  id: "unfollower-tracker",
  name: "Unfollower Tracker",
  intentLabel: "Who unfollowed me?",
  blurb: "Daily snapshots of your followers — see who joined, who left, and growth trends.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "unfollower-tracker",
    title: "Unfollower Tracker — Instagram & TikTok",
    description: "Daily follower snapshots and a clean diff of who left.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const delta = await data.getUnfollowerDelta(platform, handle);
    return {
      toolId: "unfollower-tracker",
      platform,
      handle,
      free: {
        followers: profile.followers,
        net7d: delta.net7d,
        gained7d: delta.gained7d,
        lost7d: delta.lost7d,
        trackedSince: delta.trackedSince,
        followerHistory: delta.followerHistory,
      },
      locked: {
        recentUnfollowers: delta.recentUnfollowers,
        ghostFollowers: delta.ghostFollowers,
        mutualLost: delta.mutualLost,
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
