import { NextResponse } from "next/server";
import { ScanRequestSchema } from "@/core/validation";
import { getTool } from "@/core/tools/registry";
import { adapterFor } from "@/core/data/router";
import { getCachedToolResult, writeCachedToolResult } from "@/core/data/cache";
import { isEntitled } from "@/core/billing/entitlements";
import { checkAndIncrementUsage } from "@/core/billing/rate-limit";
import { blurLocked } from "@/core/tools/teaser";
import { supabaseService } from "@/core/database/supabase";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { normalizeHandle, scanKey } from "@/core/utils/handle";
import { regionFromHeaders } from "@/core/utils/region";
import { hashIp, getClientIp } from "@/core/utils/hash";
import {
  DataSourceError,
  NotImplementedError,
  RateLimitError,
} from "@/core/utils/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ScanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { platform, toolId } = parsed.data;
  const handle = normalizeHandle(parsed.data.handle);
  const tool = getTool(toolId);
  if (!tool || !tool.platforms.includes(platform)) {
    return NextResponse.json(
      { ok: false, error: `Tool ${toolId} not available for ${platform}` },
      { status: 404 },
    );
  }

  const user = await getCurrentUser();
  const supa = supabaseService();
  const region = regionFromHeaders(req.headers);
  const key = scanKey(platform, handle, toolId);

  try {
    // 1) cache lookup — cached hits do NOT count against rate limit
    let result = await getCachedToolResult(supa, platform, handle, toolId);

    if (!result) {
      // 2) rate-limit BEFORE we burn data-API budget
      const anonKey = user ? null : await hashIp(getClientIp(req.headers));
      await checkAndIncrementUsage({
        supabaseService: supa,
        userId: user?.id ?? null,
        anonKey,
      });

      // 3) run the tool through its adapter
      const data = adapterFor(platform);
      result = await tool.run({ platform, handle, data });

      // 4) cache for 48h (best-effort)
      await writeCachedToolResult(supa, platform, handle, toolId, result);
    }

    // 5) entitlement gate — return blurred locked values for non-entitled users
    const entitled = await isEntitled(supa, user?.id ?? null, key);
    const responseResult = entitled ? result : blurLocked(result);

    return NextResponse.json({
      ok: true,
      entitled,
      result: responseResult,
      scanKey: key,
      region,
      isAuthed: !!user,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Daily scan limit reached (${e.limit}). Sign in or subscribe for more.`,
          code: "rate_limit",
        },
        { status: 429 },
      );
    }
    if (e instanceof NotImplementedError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This platform isn't wired to a live data source yet. YouTube scans are available now; Instagram and TikTok ship in Phase 2.",
          code: "not_implemented",
        },
        { status: 501 },
      );
    }
    if (e instanceof DataSourceError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: "data_source" },
        { status: 502 },
      );
    }
    console.error("[api/scan] error", e);
    return NextResponse.json(
      { ok: false, error: "Unexpected error" },
      { status: 500 },
    );
  }
}
