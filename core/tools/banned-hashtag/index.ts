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
    title: "Banned Hashtag Checker — Instagram, TikTok & YouTube",
    description: "Find out if a hashtag is restricted before you post.",
  },
  async run({ platform, handle }) {
    const tag = handle.replace(/^#+/, "").toLowerCase();
    const isYouTube = platform === "youtube";

    // YouTube's hashtag rules work differently from IG/TikTok:
    //   • YouTube doesn't publicly "ban" hashtags the same way
    //   • Official rule: videos with >15 hashtags in the description → ALL
    //     hashtags on that video are ignored (this is a per-video check, we
    //     surface it in the guidance).
    //   • Some sensitive-topic hashtags are hidden from hashtag pages, but
    //     Google doesn't publish the list.
    // Rather than pretend our IG/TT dictionary applies, we tell the user
    // honestly what YouTube's rules actually are.
    if (isYouTube) {
      const ytStructural = /^\d+$/.test(tag)
        ? { status: "warn" as const, reason: "Numeric-only hashtags rank poorly on YouTube search." }
        : tag.length < 3
        ? { status: "warn" as const, reason: "Very short hashtags rarely surface in search." }
        : tag.length > 30
        ? { status: "warn" as const, reason: "Long hashtags are treated as low-quality." }
        : { status: "unknown" as const, reason: "YouTube doesn't publish a banned-hashtag list. Focus instead on the per-video rules below." };

      return {
        toolId: "banned-hashtag",
        platform,
        handle: tag,
        free: {
          hashtag: tag,
          status: ytStructural.status,
          reason: ytStructural.reason,
          searchVisibility: "unknown",
          alternatives: [],
          checkedAgainst: 0,
          caveat:
            "⚠️ Tentative on YouTube — YouTube has no public 'banned hashtag' list like Instagram/TikTok. We can only flag structural issues (too short, too long, numeric-only). The real YT rules are enforced per-video.",
          ytRules: [
            {
              rule: "≤ 15 hashtags per video description",
              detail: "If you use more than 15, YouTube ignores ALL hashtags on that video. Enforced by Google.",
            },
            {
              rule: "Hashtags must match the video content",
              detail: "Off-topic or spammy hashtags can trigger a policy strike on the video.",
            },
            {
              rule: "Sensitive-topic hashtags may be hidden from hashtag pages",
              detail: "Google doesn't publish this list — safest to avoid political, medical, or adult-adjacent tags.",
            },
          ],
          methodology:
            "YouTube's hashtag enforcement is per-video (15-tag rule) and per-topic (sensitive-content hidden from browse). Google doesn't expose which hashtags are hidden, so we check what we can: structural sanity (length, format) plus surface YouTube's own published rules.",
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

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
