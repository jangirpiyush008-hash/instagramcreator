// Shared scan executor — used by both /api/scan (web UI, session-cookie auth)
// and /v1/scan/... (public API, x-api-key auth). Single source of truth for:
//   - cache lookup
//   - adapter selection
//   - snapshot writing
//   - cache write-back
//
// Callers own their own auth + rate-limiting + credit metering. This module
// is intentionally auth-agnostic.

import type { Platform } from "@/core/types";
import type { ToolResult, ToolParams } from "@/core/tools/types";
import { getTool } from "@/core/tools/registry";
import { adapterFor, freshAdapterFor } from "@/core/data/router";
import { getCachedToolResult, writeCachedToolResult } from "@/core/data/cache";
import { supabaseService } from "@/core/database/supabase";
import { recordProfileSnapshot } from "@/core/data/snapshots";
import { normalizeHandle } from "@/core/utils/handle";

export interface ExecuteScanArgs {
  platform: Platform;
  handle: string;
  toolId: string;
  params?: ToolParams;
  // Skip BOTH cache layers (tool-result cache + underlying primitive
  // cache). Use only from the API layer when explicitly requested via
  // ?fresh=1 — this is a diagnostic escape hatch, not a normal path.
  bustCache?: boolean;
}

export interface ExecuteScanResult {
  result: ToolResult;
  cacheHit: boolean;
}

export async function executeScan(args: ExecuteScanArgs): Promise<ExecuteScanResult> {
  const platform = args.platform;
  const handle = normalizeHandle(args.handle);
  const tool = getTool(args.toolId);
  const params = args.params;

  if (!tool || !tool.platforms.includes(platform)) {
    // Encode as an error the caller can turn into an HTTP 404 — cleaner
    // than throwing a generic Error the caller has to sniff.
    throw new ScanExecutorError(
      "not_available",
      `Tool ${args.toolId} not available for ${platform}`,
    );
  }

  const supa = supabaseService();
  const hasParams = params && Object.keys(params).length > 0;
  const bust = !!args.bustCache;

  // 1) cache lookup — cache is per-tool by scan key, only used for default
  //    params AND when the caller didn't ask to bust cache.
  const cached =
    bust || hasParams ? null : await getCachedToolResult(supa, platform, handle, args.toolId);
  if (cached) {
    return { result: cached, cacheHit: true };
  }

  // 2) run the tool via the platform's adapter. Normal path is
  //    CachedAdapter-wrapped (shared primitive cache); ?fresh=1 uses the
  //    raw adapter so we can see live provider data without waiting for
  //    the TTL. Diagnostic-only — see freshAdapterFor's doc comment.
  const data = bust ? freshAdapterFor(platform) : adapterFor(platform);
  const result = await tool.run({ platform, handle, data, params });

  // 3) snapshot follower count for the growth tools
  const free = (result as { free?: { followers?: unknown; following?: unknown } }).free ?? {};
  const followers = typeof free.followers === "number" ? free.followers : undefined;
  const following = typeof free.following === "number" ? free.following : undefined;
  if (followers !== undefined) {
    await recordProfileSnapshot(supa, platform, handle, followers, following);
  }

  // 4) cache write-back (default-params runs only)
  if (!hasParams) {
    await writeCachedToolResult(supa, platform, handle, args.toolId, result);
  }

  return { result, cacheHit: false };
}

// Bundle every tool for a handle into one call. Used by the /v1/scan
// full-report endpoint. Primitives are shared via CachedAdapter, so this
// costs closer to 4-5 upstream API calls than 11.
export async function executeFullReport(args: {
  platform: Platform;
  handle: string;
}): Promise<Record<string, ToolResult | { error: string }>> {
  const { platform } = args;
  const handle = normalizeHandle(args.handle);
  const { getAllToolsForPlatform } = await import("@/core/tools/registry-helpers");
  const tools = getAllToolsForPlatform(platform);
  const entries = await Promise.all(
    tools.map(async (toolId) => {
      try {
        const { result } = await executeScan({ platform, handle, toolId });
        return [toolId, result] as const;
      } catch (e) {
        return [
          toolId,
          { error: e instanceof Error ? e.message : "scan failed" },
        ] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

// Sentinel error class so callers (route handlers) can pattern-match
// executor-level failures separately from adapter errors that already
// have their own custom types.
export class ScanExecutorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ScanExecutorError";
  }
}
