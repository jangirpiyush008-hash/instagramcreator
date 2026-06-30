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
): Promise<ToolResult | null> {
  const key = scanKey(platform, handle, toolId);
  try {
    const { data, error } = await supabaseService
      .from("scans")
      .select("result, expires_at")
      .eq("scan_key", key)
      .gt("expires_at", new Date().toISOString())
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
): Promise<void> {
  const key = scanKey(platform, handle, toolId);
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000).toISOString();
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
