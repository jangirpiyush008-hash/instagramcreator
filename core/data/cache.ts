import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform } from "../types";
import type { ToolResult } from "../tools/types";
import { CACHE_TTL_HOURS } from "../constants";
import { scanKey } from "../utils/handle";

// Caches a full ToolResult (free + locked) for 48h.
// Cache is keyed by scan_key = platform:handle:toolId.
// Cached hits do NOT count against the user's daily rate limit (see api/scan).

export async function getCachedToolResult(
  supabaseService: SupabaseClient,
  platform: Platform,
  handle: string,
  toolId: string,
  // Optional per-tool max age (seconds). When set, we ALSO require the
  // row to be younger than this — otherwise a pre-existing 48h row would
  // leak stale results into a tool that has since dropped to a shorter
  // TTL (e.g. authenticity-analyzer, 5min). Without this argument the
  // read behaves exactly as before.
  maxAgeSeconds?: number,
): Promise<ToolResult | null> {
  const key = scanKey(platform, handle, toolId);
  try {
    let query = supabaseService
      .from("scans")
      .select("result, expires_at, created_at")
      .eq("scan_key", key)
      .gt("expires_at", new Date().toISOString());
    if (maxAgeSeconds && maxAgeSeconds > 0) {
      const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
      query = query.gt("created_at", cutoff);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.result as ToolResult;
  } catch (e) {
    console.warn("[cache] read failed, treating as miss:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function writeCachedToolResult(
  supabaseService: SupabaseClient,
  platform: Platform,
  handle: string,
  toolId: string,
  result: ToolResult,
  // Optional per-tool TTL in seconds. Falls back to the global
  // CACHE_TTL_HOURS default.
  ttlSeconds?: number,
): Promise<void> {
  const key = scanKey(platform, handle, toolId);
  const ttlMs =
    ttlSeconds && ttlSeconds > 0
      ? ttlSeconds * 1000
      : CACHE_TTL_HOURS * 3600 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  try {
    const { error } = await supabaseService.from("scans").insert({
      scan_key: key,
      platform,
      handle,
      tool_id: toolId,
      result,
      expires_at: expiresAt,
    });
    if (error) console.warn("[cache] write failed:", error.message);
  } catch (e) {
    console.warn("[cache] write threw, ignoring:", e instanceof Error ? e.message : e);
  }
}
