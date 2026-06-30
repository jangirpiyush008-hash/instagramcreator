import type { SocialTool } from "../types";

export const thumbnailDownloader: SocialTool = {
  id: "thumbnail-downloader",
  name: "Thumbnail Downloader",
  intentLabel: "Grab the cover image",
  blurb: "Pull the full-res thumbnail or cover image from any public post.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "thumbnail-downloader",
    title: "Free Thumbnail Downloader — Instagram & TikTok",
    description: "Download high-res thumbnails and cover images from any public post.",
  },
  async run({ platform, handle, data }) {
    const { post, resolutions } = await data.getThumbnail(platform, handle);
    return {
      toolId: "thumbnail-downloader",
      platform,
      handle,
      free: {
        post: {
          id: post.id,
          title: post.title,
          postedAt: post.postedAt,
          durationSec: post.durationSec,
        },
        resolutions: resolutions.map((r) => ({
          label: r.label,
          locked: r.locked,
          url: r.locked ? null : r.url,
        })),
      },
      locked: {
        lockedUrls: resolutions
          .filter((r) => r.locked)
          .map((r) => ({ label: r.label, url: r.url })),
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
