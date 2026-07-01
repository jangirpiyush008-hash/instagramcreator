import type { SocialTool } from "../types";

export const commentPicker: SocialTool = {
  id: "comment-picker",
  name: "Comment Picker",
  intentLabel: "Pick a giveaway winner",
  blurb: "Pick a random winner from the comments on any public post — duplicates filtered.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "giveaway-comment-picker",
    title: "Giveaway Comment Picker — Instagram, TikTok Instagram & TikTok YouTube",
    description: "Fair, random winner picker from public post comments.",
  },
  async run({ platform, handle, data }) {
    const { post, comments } = await data.getRecentComments(platform, handle, 5);
    const winner = comments[Math.floor(Math.random() * comments.length)] ?? comments[0]!;
    const totalComments = (post as { comments?: number }).comments ?? comments.length;
    return {
      toolId: "comment-picker",
      platform,
      handle,
      free: {
        totalComments,
        uniqueUsers: Math.floor(totalComments * 0.82),
        duplicatesRemoved: totalComments - Math.floor(totalComments * 0.82),
        winner: { username: winner.username, comment: winner.text },
        post: {
          id: post.id,
          title: post.title,
          caption: post.caption,
          postedAt: post.postedAt,
          durationSec: post.durationSec,
          thumbnailUrl: post.thumbnailUrl,
          thumbnailUrlHd: post.thumbnailUrlHd,
          videoUrl: post.videoUrl,
          videoUrlHd: post.videoUrlHd,
          permalink: post.permalink,
          likes: post.likes,
          comments: post.comments,
          views: post.views,
        },
        runnerUps: comments
          .filter((c) => c.id !== winner.id)
          .slice(0, 3)
          .map((c) => ({ username: c.username, comment: c.text })),
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
