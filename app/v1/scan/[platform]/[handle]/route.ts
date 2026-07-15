import { NextResponse } from "next/server";
import { authenticateApiKey, chargeCredits, logApiUsage } from "@/core/api/auth";
import { creditCost } from "@/core/api/credits";
import { executeScan, executeFullReport } from "@/core/scan/executor";
import { toScanErrorResponse } from "@/core/scan/errors";
import { supabaseService } from "@/core/database/supabase";
import type { Platform } from "@/core/types";
import type { ToolParams } from "@/core/tools/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public API endpoint. One URL pattern serves every tool in our registry
// AND the "full-report" bundle. Adding a 12th tool later means zero
// changes here — the tool becomes a valid ?tool= value automatically.
//
// GET /v1/scan/{platform}/{handle}?tool={toolId}&{...params}
// Headers: x-api-key: sk_live_...
//
// Special tool values:
//   - full-report → runs every eligible tool and returns them keyed by id
//
// Response envelope on success:
//   { ok: true, tool, platform, handle, credits: {charged, remaining},
//     data: <tool result | {toolId: result, ...} for full-report> }

const VALID_PLATFORMS = new Set<Platform>(["instagram", "tiktok", "youtube"]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ platform: string; handle: string }> },
) {
  const started = Date.now();
  const { platform: platformParam, handle } = await ctx.params;
  const url = new URL(req.url);
  const toolId = url.searchParams.get("tool");

  if (!VALID_PLATFORMS.has(platformParam as Platform)) {
    return NextResponse.json(
      { ok: false, error: `Unknown platform "${platformParam}". Valid: instagram, tiktok, youtube.`, code: "bad_platform" },
      { status: 400 },
    );
  }
  const platform = platformParam as Platform;

  if (!toolId) {
    return NextResponse.json(
      { ok: false, error: "Missing ?tool= parameter. See /docs for valid tool ids.", code: "missing_tool" },
      { status: 400 },
    );
  }

  // Auth first — no work if the key is bad.
  const auth = await authenticateApiKey(req);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  }

  // Reserved query params:
  //   ?fresh=1  → skip both cache layers (see freshAdapterFor doc)
  //   ?debug=1  → include the internal `diagnostics` counter block on
  //               tools that produce it (e.g. gender-split, fake-follower).
  //               Off by default so the public API stays clean.
  const bustCache = url.searchParams.get("fresh") === "1";
  const debug = url.searchParams.get("debug") === "1";

  // Pull any non-reserved search params through as tool params (postCount,
  // contentType, etc.). Numeric strings coerce to numbers.
  const params: ToolParams = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "tool" || k === "fresh" || k === "debug") continue;
    const num = Number(v);
    if (!Number.isNaN(num) && v.trim() !== "") params[k] = num;
    else if (v === "true" || v === "false") params[k] = v === "true";
    else params[k] = v;
  }

  const supa = supabaseService();

  try {
    // Full-report bundles every eligible tool.
    if (toolId === "full-report") {
      const cost = creditCost("full-report");
      const newBalance = await chargeCredits(auth, cost);
      if (newBalance === null) {
        return NextResponse.json(
          { ok: false, error: "Credits exhausted", code: "credits_exhausted" },
          { status: 402 },
        );
      }
      const bundle = await executeFullReport({ platform, handle });
      logApiUsage(supa, {
        keyId: auth.keyId,
        userId: auth.userId,
        endpoint: `v1.scan.full-report`,
        platform,
        handle,
        creditsCharged: cost,
        responseCode: 200,
        durationMs: Date.now() - started,
      });
      return NextResponse.json({
        ok: true,
        tool: "full-report",
        platform,
        handle,
        credits: { charged: cost, remaining: newBalance },
        data: debug ? bundle : stripDiagnosticsFromBundle(bundle),
      });
    }

    // Single-tool scan.
    const cost = creditCost(toolId);
    const newBalance = await chargeCredits(auth, cost);
    if (newBalance === null) {
      return NextResponse.json(
        { ok: false, error: "Credits exhausted", code: "credits_exhausted" },
        { status: 402 },
      );
    }
    const { result, cacheHit } = await executeScan({ platform, handle, toolId, params, bustCache });
    logApiUsage(supa, {
      keyId: auth.keyId,
      userId: auth.userId,
      endpoint: `v1.scan.${toolId}`,
      platform,
      handle,
      creditsCharged: cost,
      responseCode: 200,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      ok: true,
      tool: toolId,
      platform,
      handle,
      credits: { charged: cost, remaining: newBalance },
      cacheHit,
      data: debug ? result : stripDiagnostics(result),
    });
  } catch (e) {
    // Refund logic: since we charged optimistically before running the tool,
    // a failed run should NOT cost the customer. Best-effort refund by
    // deducting -cost (deduct_credits accepts negative-ish via inverse; we
    // do a direct update here since RPC only handles positive amounts).
    const cost = creditCost(toolId === "full-report" ? "full-report" : toolId);
    await supa
      .from("api_keys")
      .update({ credits_remaining: auth.creditsRemaining })
      .eq("id", auth.keyId)
      .then(({ error }) => {
        if (error) console.warn("[v1.scan] refund failed:", error.message);
      });
    logApiUsage(supa, {
      keyId: auth.keyId,
      userId: auth.userId,
      endpoint: `v1.scan.${toolId}`,
      platform,
      handle,
      creditsCharged: 0, // refunded
      responseCode: 500,
      durationMs: Date.now() - started,
    });
    void cost;
    return toScanErrorResponse(e);
  }
}

// Strip the internal `diagnostics` counter block from a tool result before
// returning it to the public API. Kept internal by default so we don't
// commit to a public shape we might refactor. Callers pass ?debug=1 when
// they need it (rare — only when debugging enrichment).
function stripDiagnostics(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;
  const free = r.free as Record<string, unknown> | undefined;
  if (free && "diagnostics" in free) {
    const { diagnostics: _drop, ...rest } = free;
    void _drop;
    return { ...r, free: rest };
  }
  return result;
}

function stripDiagnosticsFromBundle(bundle: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bundle)) out[k] = stripDiagnostics(v);
  return out;
}
