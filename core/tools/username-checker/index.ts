import type { SocialTool } from "../types";
import { adapterFor } from "../../data/router";

export const usernameChecker: SocialTool = {
  id: "username-checker",
  name: "Username Checker",
  intentLabel: "Is this username available?",
  blurb: "Check whether a handle is free across Instagram and TikTok at once.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "username-checker",
    title: "Free Username Checker — Instagram & TikTok",
    description: "Check if a handle is taken across Instagram and TikTok in one search.",
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
