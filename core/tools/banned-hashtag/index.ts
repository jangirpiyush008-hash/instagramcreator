import type { SocialTool } from "../types";

// Known-restricted / commonly-shadowbanned hashtags on Instagram + TikTok.
// This is a curated allowlist of tags well-documented as flagged or removed
// from search — enough for an honest first-pass check. Tags NOT in this list
// return an "unknown" status rather than a fake "ok" — that's the honest
// signal.
//
// Sources: platform trust-and-safety pages, published shadowban researchers,
// and community-reported flagged tags (updated periodically).
const KNOWN_BANNED = new Set([
  // Explicit / adult (both platforms)
  "sex", "sexy", "nude", "naked", "boobs", "ass", "curvy", "loseweight",
  "adult", "petite", "thick", "hotness", "kink", "kinky",
  // Drugs / substance
  "weed", "cocaine", "drugs", "alcohol", "beerpong", "kush", "dope",
  // Self-harm / body-shame (IG explicit list)
  "thinspiration", "thinspo", "bonespo", "proana", "probulimia",
  // Spam / follow-baiting
  "like4like", "l4l", "likeforlike", "followme", "follow4follow", "f4f",
  "instalike", "instagood", "tagsforlikes", "tflers", "shoutout", "sfs",
  // TikTok-flagged
  "dating", "singlelife", "single", "wtf", "brain",
  // Political sensitive (varies)
  "kissing", "milf",
]);

const KNOWN_RESTRICTED = new Set([
  // Tags where recent posts are hidden but the tag isn't fully banned
  "beauty", "hot", "girls", "girl", "gym", "fitness", "workout",
  "asian", "curvy", "streetwear", "underboob", "cleavage",
]);

// Safer alternatives creators can swap in.
const SAFE_ALTS: Record<string, string[]> = {
  gym: ["gymlife", "gymmotivation", "gymtime", "fitfam"],
  fitness: ["fitnessmotivation", "fitspiration", "fitlife", "fittips"],
  beauty: ["makeuplooks", "beautyblog", "skincaretips", "beautyaddict"],
  workout: ["workoutmotivation", "trainingtips", "homeworkout", "gymworkout"],
  weed: [],
  sex: [],
};

function classify(tag: string): {
  status: "ok" | "warn" | "bad" | "unknown";
  reason: string;
} {
  const t = tag.toLowerCase();
  if (KNOWN_BANNED.has(t)) {
    return { status: "bad", reason: "Fully hidden from search / auto-flagged on posts." };
  }
  if (KNOWN_RESTRICTED.has(t)) {
    return { status: "warn", reason: "Recent posts are hidden — old posts still visible." };
  }
  if (/^\d+$/.test(t)) {
    return { status: "warn", reason: "Numeric-only tags rank very poorly." };
  }
  if (t.length < 3) {
    return { status: "warn", reason: "Very short tags are usually deprioritized in ranking." };
  }
  if (t.length > 30) {
    return { status: "warn", reason: "Excessively long tags are treated as low-quality." };
  }
  return {
    status: "unknown",
    reason:
      "Not on our known-flagged list. Public hashtag stats aren't exposed by IG / TikTok APIs to third parties — we can't confirm reach without a partner integration.",
  };
}

export const bannedHashtag: SocialTool = {
  id: "banned-hashtag",
  name: "Banned Hashtag Checker",
  intentLabel: "Is this hashtag banned or restricted?",
  blurb: "Cross-check any hashtag against a curated list of known-banned and shadowbanned tags on Instagram and TikTok.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "banned-hashtag-checker",
    title: "Banned Hashtag Checker — Instagram, TikTok Instagram & TikTok YouTube",
    description: "Find out if a hashtag is restricted before you post.",
  },
  async run({ platform, handle }) {
    const tag = handle.replace(/^#+/, "").toLowerCase();
    const { status, reason } = classify(tag);
    const alternatives = SAFE_ALTS[tag] ?? [];

    return {
      toolId: "banned-hashtag",
      platform,
      handle: tag,
      free: {
        hashtag: tag,
        status,
        reason,
        searchVisibility:
          status === "bad" ? "hidden" : status === "warn" ? "partial" : status === "ok" ? "visible" : "unknown",
        alternatives,
        checkedAgainst: KNOWN_BANNED.size + KNOWN_RESTRICTED.size,
        methodology:
          "We check against a curated list of tags widely documented as banned or shadowbanned on Instagram and TikTok. Tags not on our list return 'unknown' — we don't fake a green light we can't verify.",
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
