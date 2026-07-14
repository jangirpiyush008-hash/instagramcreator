import type { Platform } from "../types";
import type { DataAdapter } from "./adapter";
import { YouTubeOfficialAdapter } from "./youtube-official";
import { MockProvider } from "./mock-provider";
import { RapidAPIInstagramAdapter } from "./rapidapi-instagram";
import { RapidAPITikTokAdapter } from "./rapidapi-tiktok";
import { HikerInstagramAdapter } from "./hiker-instagram";
import { CachedAdapter } from "./cached-adapter";
import { supabaseService } from "@/core/database/supabase";

// Picks the right adapter per platform and wraps it in the primitive cache.
//
// Provider preference (Instagram):
//   1. HikerAPI (HIKER_API_KEY) — pay-per-request, more reliable, richer data
//   2. RapidAPI RockSolid (RAPIDAPI_KEY) — fixed-monthly, historic default
//   3. MockProvider — dev-only, when nothing is configured
//
// TikTok: RapidAPI tikwm (RAPIDAPI_KEY) or MockProvider.
// YouTube: always returns the real YouTubeOfficialAdapter — no mock fallback,
// so a missing YOUTUBE_API_KEY surfaces as a clean error instead of seeded
// fake data (the bug we already fought once for IG/TT).
//
// EVERY returned adapter is wrapped in CachedAdapter so downstream tools
// share a primitive cache: two tools scanning the same handle for the same
// data type pay ONCE. Cache is Supabase-backed, TTL-per-primitive, silently
// bypassed if the cache table is unreachable.
//
// To swap providers later, change only this file — tools never see it.

export function adapterFor(platform: Platform): DataAdapter {
  const hasHiker = (process.env.HIKER_API_KEY ?? "").trim().length > 0;
  const hasRapidApi = (process.env.RAPIDAPI_KEY ?? "").trim().length > 0;

  let inner: DataAdapter;
  switch (platform) {
    case "youtube":
      inner = new YouTubeOfficialAdapter();
      break;
    case "instagram":
      if (hasHiker) inner = new HikerInstagramAdapter();
      else if (hasRapidApi) inner = new RapidAPIInstagramAdapter();
      else inner = new MockProvider("instagram");
      break;
    case "tiktok":
      inner = hasRapidApi ? new RapidAPITikTokAdapter() : new MockProvider("tiktok");
      break;
  }

  return new CachedAdapter(inner, supabaseService());
}
