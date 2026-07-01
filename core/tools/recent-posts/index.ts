import type { SocialTool } from "../types";

// Grid of the account's most recent public posts, each with a playable video
// preview and individual MP4 download. Accepts:
//   postCount   — 12 / 20 / 30 / 50
//   contentType — "all" | "videos" | "shorts" (YouTube only; ignored for IG/TT)
//
// On YouTube, when the filter is set we over-fetch and filter down by
// duration (Shorts are ≤ 60 seconds — official YouTube convention). This is
// the safest heuristic: the API doesn't expose a direct isShort flag.

const SHORT_MAX_DURATION_SEC = 60;

type ContentType = "all" | "videos" | "shorts";

export const recentPosts: SocialTool = {
  id: "recent-posts",
  name: "Recent Posts",
  intentLabel: "Grab all their recent posts",
  blurb: "Download and preview the last 12-50 public posts. Individual MP4 downloads for each video.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "recent-posts-downloader",
    title: "Recent Posts Downloader — Instagram, TikTok & YouTube",
    description: "Grid gallery of the last public posts on any account with per-post MP4 download.",
  },
  async run({ platform, handle, data, params }) {
    const requested = Number(params?.postCount);
    const postCount = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.max(Math.round(requested), 3), 50)
      : 20;

    const rawContent = String(params?.contentType ?? "all").toLowerCase();
    const contentType: ContentType =
      rawContent === "videos" ? "videos" :
      rawContent === "shorts" ? "shorts" :
      "all";

    const profile = await data.getProfile(platform, handle);

    // On YouTube with a filter active, over-fetch so the filtered result
    // still hits the requested count. Fetch cap is 50 (YT playlistItems max).
    const fetchSize =
      platform === "youtube" && contentType !== "all"
        ? Math.min(50, Math.max(postCount * 3, postCount + 20))
        : postCount;

    const allPosts = await data.getRecentPosts(platform, handle, fetchSize);

    let posts = allPosts;
    if (platform === "youtube" && contentType !== "all") {
      posts = allPosts.filter((p) => {
        if (p.durationSec === undefined) return contentType === "videos";
        const isShort = p.durationSec <= SHORT_MAX_DURATION_SEC;
        return contentType === "shorts" ? isShort : !isShort;
      });
    }
    posts = posts.slice(0, postCount);

    // Also compute how many of each type exist in the fetched pool so the
    // view can show accurate counts ("5 shorts, 15 videos in last 20").
    let shortCount = 0;
    let videoCount = 0;
    if (platform === "youtube") {
      for (const p of allPosts) {
        if (p.durationSec !== undefined && p.durationSec <= SHORT_MAX_DURATION_SEC) {
          shortCount++;
        } else {
          videoCount++;
        }
      }
    }

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
        contentType,
        sampledPool: allPosts.length,
        shortCount,
        videoCount,
        posts,
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
