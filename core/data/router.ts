import type { Platform } from "../types";
import type { DataAdapter } from "./adapter";
import { YouTubeOfficialAdapter } from "./youtube-official";
import { MockProvider } from "./mock-provider";
import { RapidAPIInstagramAdapter } from "./rapidapi-instagram";
import { RapidAPITikTokAdapter } from "./rapidapi-tiktok";

// Picks the right adapter per platform.
//
// IG/TikTok: if RAPIDAPI_KEY is set, use the real RapidAPI adapter. Each
// adapter falls back to mock data per-method on any provider error, so a
// flaky third-party API can't break a scan.
//
// YouTube: if YOUTUBE_API_KEY is set, use the official YouTube Data API for
// profile/posts; everything else (comments, demographics, etc.) inherits from
// MockProvider.
//
// To swap providers later, change only this file — tools never see the change.

export function adapterFor(platform: Platform): DataAdapter {
  const rawKey = process.env.RAPIDAPI_KEY ?? "";
  const hasRapidApi = rawKey.trim().length > 0;
  // Diagnostic — one line per adapter selection so we can see in Deploy Logs
  // whether the router is picking real vs mock, and why. Safe to log: reveals
  // only whether a key is present and the platform, never the key itself.
  console.warn(
    `[router] platform=${platform} hasRapidApi=${hasRapidApi} keyLen=${rawKey.length} host=${
      platform === "instagram"
        ? process.env.IG_RAPIDAPI_HOST ?? "(unset)"
        : platform === "tiktok"
        ? process.env.TIKTOK_RAPIDAPI_HOST ?? "(unset)"
        : "(n/a)"
    }`,
  );

  switch (platform) {
    case "youtube":
      return process.env.YOUTUBE_API_KEY
        ? new YouTubeOfficialAdapter()
        : new MockProvider("instagram");
    case "instagram":
      return hasRapidApi
        ? new RapidAPIInstagramAdapter()
        : new MockProvider("instagram");
    case "tiktok":
      return hasRapidApi
        ? new RapidAPITikTokAdapter()
        : new MockProvider("tiktok");
  }
}
