import type { SocialTool } from "../types";

// Grid of the account's most recent public posts, each with a playable video
// preview and individual MP4 download. Accepts a `postCount` param (12/20/30/50)
// so users can scale the gallery to what they need.
//
// This is a straightforward wrapper around getRecentPosts — the view does the
// heavy lifting (MediaCard per post + a bulk-download link row at the top).

export const recentPosts: SocialTool = {
  id: "recent-posts",
  name: "Recent Posts",
  intentLabel: "Grab all their recent posts",
  blurb: "Download and preview the last 12-50 public posts. Individual MP4 downloads for each video.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "recent-posts-downloader",
    title: "Recent Posts Downloader — Instagram, TikTok Instagram & TikTok YouTube",
    description: "Grid gallery of the last public posts on any account with per-post MP4 download.",
  },
  async run({ platform, handle, data, params }) {
    const requested = Number(params?.postCount);
    const postCount = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.max(Math.round(requested), 3), 50)
      : 20;
    const profile = await data.getProfile(platform, handle);
    const posts = await data.getRecentPosts(platform, handle, postCount);
    return {
      toolId: "recent-posts",
      platform,
      handle,
      free: {
        displayName: profile.displayName ?? handle,
        followers: profile.followers,
        following: profile.following,
        verified: profile.verified,
        avatarUrl: profile.avatarUrl,
        postCount: posts.length,
        posts,
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
