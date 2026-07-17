import type { Platform } from "../types";
import type { DataAdapter } from "./adapter";
import { YouTubeOfficialAdapter } from "./youtube-official";
import { MockProvider } from "./mock-provider";
import { RapidAPIInstagramAdapter } from "./rapidapi-instagram";
import { RapidAPITikTokAdapter } from "./rapidapi-tiktok";
import { HikerInstagramAdapter } from "./hiker-instagram";
import { TikwmDirectAdapter } from "./tikwm-direct";
import { CachedAdapter } from "./cached-adapter";
import { ChainAdapter, type NamedAdapter } from "./chain";
import { EnsembleDataInstagramAdapter } from "./ensembledata-instagram";
import { EnsembleDataTikTokAdapter } from "./ensembledata-tiktok";
import { supabaseService } from "@/core/database/supabase";

// Provider fallback chain per platform.
//
// Instagram order (cheapest-first, quality-first, mock-last):
//   1. Ensembledata     (ENSEMBLEDATA_TOKEN)     — pay-per-request, no minimum
//   2. HikerAPI         (HIKER_API_KEY)          — richer data, $50 min top-up
//   3. RapidAPI/RockSolid (RAPIDAPI_KEY)         — fixed-monthly baseline
//   4. RapidAPI fallback host (IG_RAPIDAPI_HOST_FALLBACK) — diversity within RapidAPI
//   5. MockProvider — final safety net so users never see raw errors
//
// TikTok order:
//   1. tikwm direct       (TIKWM_API_KEY)
//   2. Ensembledata       (ENSEMBLEDATA_TOKEN)
//   3. RapidAPI tikwm     (RAPIDAPI_KEY)
//   4. MockProvider
//
// YouTube: single provider (YouTube Data API v3) — no cheap alternative,
// and mock fallback would return misleading data. Kept out of the chain.
//
// Only providers whose env vars are set get included in the chain, in
// the order set above. Circuit breaker + per-attempt fallback lives in
// ChainAdapter — router just composes the list.
//
// EVERY returned adapter is wrapped in CachedAdapter so downstream tools
// share a primitive cache: two tools scanning the same handle for the
// same data type pay ONCE. Cache is Supabase-backed, TTL-per-primitive,
// silently bypassed if the cache table is unreachable.
//
// To swap providers later, change only this file — tools never see it.

function hasEnv(name: string): boolean {
  return (process.env[name] ?? "").trim().length > 0;
}

function baseAdapterFor(platform: Platform): DataAdapter {
  if (platform === "youtube") {
    // No chain — YouTube's provider is the only one and mock fallback
    // is worse than an honest error. Single adapter, no chain wrapper.
    return new YouTubeOfficialAdapter();
  }

  const chain: NamedAdapter[] = [];

  if (platform === "instagram") {
    if (hasEnv("ENSEMBLEDATA_TOKEN")) {
      chain.push({ name: "ensembledata", adapter: new EnsembleDataInstagramAdapter() });
    }
    if (hasEnv("HIKER_API_KEY")) {
      chain.push({ name: "hiker", adapter: new HikerInstagramAdapter() });
    }
    if (hasEnv("RAPIDAPI_KEY")) {
      const primaryHost = process.env.IG_RAPIDAPI_HOST?.trim();
      chain.push({
        name: "rapidapi",
        adapter: new RapidAPIInstagramAdapter(undefined, primaryHost),
      });
      // Second RapidAPI marketplace host — same key, different provider.
      // Gives us another IG source without adding a new signup. When set,
      // the chain tries it if the primary RapidAPI host 429s or dies.
      const fallbackHost = process.env.IG_RAPIDAPI_HOST_FALLBACK?.trim();
      if (fallbackHost && fallbackHost !== primaryHost) {
        chain.push({
          name: "rapidapi-fallback",
          adapter: new RapidAPIInstagramAdapter(undefined, fallbackHost),
        });
      }
    }
  }

  if (platform === "tiktok") {
    if (hasEnv("TIKWM_API_KEY")) {
      chain.push({ name: "tikwm", adapter: new TikwmDirectAdapter() });
    }
    if (hasEnv("ENSEMBLEDATA_TOKEN")) {
      chain.push({ name: "ensembledata", adapter: new EnsembleDataTikTokAdapter() });
    }
    if (hasEnv("RAPIDAPI_KEY")) {
      chain.push({ name: "rapidapi", adapter: new RapidAPITikTokAdapter() });
    }
  }

  // Mock is ALWAYS the last element — guarantees the chain never throws
  // "no provider available" in production, and gives dev a working
  // experience without any env vars set.
  chain.push({ name: "mock", adapter: new MockProvider(platform) });

  // Single-provider case (e.g. only Mock configured) — skip the chain
  // wrapper for minimal indirection.
  if (chain.length === 1) return chain[0]!.adapter;
  return new ChainAdapter(chain);
}

// Standard path — CachedAdapter-wrapped, shared primitive cache.
export function adapterFor(platform: Platform): DataAdapter {
  return new CachedAdapter(baseAdapterFor(platform), supabaseService());
}

// Diagnostic path — raw chain, no caching. Called from executeScan when
// ?fresh=1 is passed on the API. Do NOT use in normal traffic — it
// bypasses the shared primitive cache and blows up provider spend.
export function freshAdapterFor(platform: Platform): DataAdapter {
  return baseAdapterFor(platform);
}
