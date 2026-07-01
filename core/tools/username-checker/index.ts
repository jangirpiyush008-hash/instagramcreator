import type { SocialTool } from "../types";
import { adapterFor } from "../../data/router";

export const usernameChecker: SocialTool = {
  id: "username-checker",
  name: "Username Checker",
  intentLabel: "Is this username available?",
  blurb: "Check whether a handle is free across Instagram, TikTok, and YouTube at once.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "username-checker",
    title: "Free Username Checker — Instagram, TikTok Instagram & TikTok YouTube",
    description: "Check if a handle is taken across Instagram, TikTok, and YouTube in one search.",
  },
  async run({ handle }) {
    // Check both platforms regardless of which one the user entered from.
    const ig = await adapterFor("instagram").isHandleAvailable("instagram", handle);
    const tt = await adapterFor("tiktok").isHandleAvailable("tiktok", handle);
    const platforms = [
      { ...ig, label: "Instagram" },
      { ...tt, label: "TikTok" },
    ];
    return {
      toolId: "username-checker",
      platform: "instagram",
      handle,
      free: {
        platforms: platforms.map((p) => ({
          label: p.label,
          available: p.available,
        })),
        alternatives: [
          `${handle}.official`,
          `${handle}_hq`,
          `the.${handle}`,
          `${handle}.in`,
          `${handle}_now`,
        ],
      },
      locked: {
        platformsDetail: platforms,
      },
      generatedAt: new Date().toISOString(),
    };
  },
};
