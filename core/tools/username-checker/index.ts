import type { SocialTool } from "../types";
import { adapterFor } from "../../data/router";
import { HandleNotFoundError, PrivateAccountError } from "../../utils/errors";
import type { Platform } from "../../types";
import type { UsernameAvailability } from "../../data/adapter";

// Per-platform check that translates known errors into meaningful states
// instead of blowing up the whole scan:
//   - HandleNotFoundError  → handle is free
//   - PrivateAccountError  → handle is taken (private account still counts)
//   - anything else        → mark that platform as "unknown" (available: null)
//                            so the UI shows an honest gray "couldn't verify"
//                            state instead of a fake "Taken" with fabricated
//                            follower count. The other platforms stay visible.
async function checkOne(platform: Platform, handle: string): Promise<
  UsernameAvailability & { error?: string; isPrivate?: boolean }
> {
  try {
    return await adapterFor(platform).isHandleAvailable(platform, handle);
  } catch (e) {
    if (e instanceof HandleNotFoundError) {
      return { platform, available: true };
    }
    if (e instanceof PrivateAccountError) {
      return { platform, available: false, isPrivate: true };
    }
    return {
      platform,
      available: null,
      error: e instanceof Error ? e.message : "check failed",
    };
  }
}

export const usernameChecker: SocialTool = {
  id: "username-checker",
  name: "Username Checker",
  intentLabel: "Is this username available?",
  blurb: "Check whether a handle is free across Instagram, TikTok, and YouTube at once.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "username-checker",
    title: "Free Username Checker — Instagram, TikTok & YouTube",
    description: "Check if a handle is taken across Instagram, TikTok, and YouTube in one search.",
  },
  async run({ handle }) {
    // Run both platforms in parallel so one slow provider doesn't block the other.
    const [ig, tt] = await Promise.all([
      checkOne("instagram", handle),
      checkOne("tiktok", handle),
    ]);
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
          isPrivate: p.isPrivate ?? false,
          error: p.error,
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
