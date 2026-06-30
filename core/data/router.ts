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
  const hasRapidApi = !!process.env.RAPIDAPI_KEY;

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
