import type { Platform } from "../types";

const HANDLE_RX = /^[A-Za-z0-9._-]{1,40}$/;

// Reserved paths on IG / TT / YT that look like a handle after we strip
// the domain prefix ("instagram.com/reel/DcyZlHDSofz/" → "reel"). If we
// let these through, the tool tries to fetch a nonexistent user, wastes
// a provider call, and surfaces as a misleading "rate-limited" or
// "not-found" error. Reject them explicitly.
export const RESERVED_HANDLE_PATHS = new Set([
  // Instagram
  "reel", "reels", "p", "tv", "explore", "stories", "s", "accounts",
  "direct", "about", "web", "developer", "legal",
  // TikTok
  "discover", "foryou", "following", "trending", "live", "video", "tag",
  // YouTube
  "watch", "shorts", "playlist", "channel", "c", "user", "results",
  "embed", "feed", "hashtag",
]);

export type UrlKind = "profile" | "post" | "reel" | "story" | "other";

// Classify an Instagram (or TikTok / YouTube) URL by inspecting the path
// segment that comes after the domain. Used client-side to give the
// user a helpful error the moment they paste a reel/post URL into a
// profile-input tool.
export function classifyUrl(input: string): UrlKind {
  const m = input
    .trim()
    .match(
      /^https?:\/\/(?:www\.)?(?:instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\/([^/?#]+)/i,
    );
  if (!m || !m[1]) return "other";
  const seg = m[1].toLowerCase();
  if (seg === "reel" || seg === "reels") return "reel";
  if (seg === "p" || seg === "tv" || seg === "watch" || seg === "shorts") return "post";
  if (seg === "stories" || seg === "s") return "story";
  if (RESERVED_HANDLE_PATHS.has(seg)) return "other";
  return "profile";
}

export function normalizeHandle(input: string): string {
  let h = input.trim();
  // strip leading @
  if (h.startsWith("@")) h = h.slice(1);
  // strip url prefixes
  h = h.replace(
    /^https?:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\//i,
    "",
  );
  // strip trailing slash and query
  h = h.split(/[/?#]/)[0] ?? "";
  return h.toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  if (!HANDLE_RX.test(handle)) return false;
  // Reserved platform paths that look like a valid handle but aren't a
  // creator account — reject so we don't waste a provider call.
  if (RESERVED_HANDLE_PATHS.has(handle.toLowerCase())) return false;
  return true;
}

export function scanKey(platform: Platform, handle: string, toolId: string): string {
  return `${platform}:${normalizeHandle(handle)}:${toolId}`;
}
