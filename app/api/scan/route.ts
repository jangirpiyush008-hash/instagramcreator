import { NextResponse } from "next/server";
import { ScanRequestSchema } from "@/core/validation";
import { getTool } from "@/core/tools/registry";
import { adapterFor } from "@/core/data/router";
import { getCachedToolResult, writeCachedToolResult } from "@/core/data/cache";
import { isEntitled } from "@/core/billing/entitlements";
import { checkAndIncrementUsage } from "@/core/billing/rate-limit";
import { blurLocked } from "@/core/tools/teaser";
import { supabaseService } from "@/core/database/supabase";
import { recordProfileSnapshot } from "@/core/data/snapshots";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { normalizeHandle, scanKey } from "@/core/utils/handle";
import { regionFromHeaders } from "@/core/utils/region";
import { hashIp, getClientIp } from "@/core/utils/hash";
import {
  DataSourceError,
  HandleNotFoundError,
  NotImplementedError,
  PrivateAccountError,
  ProviderRateLimitError,
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

  const { platform, toolId, params } = parsed.data;
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
  // Skip cache when the caller passes custom params (e.g. engagement-rate
  // with a non-default post count). Otherwise a 24-post scan would collide
  // with the cached 12-post one under the same cache key.
  const hasParams = params && Object.keys(params).length > 0;

  try {
    // 1) cache lookup — cached hits do NOT count against rate limit
    let result = hasParams ? null : await getCachedToolResult(supa, platform, handle, toolId);

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
      result = await tool.run({ platform, handle, data, params });

      // 3a) write a follower snapshot so live-counter accumulates real history
      // no matter which tool the visitor scanned. Best-effort.
      const free = (result as { free?: { followers?: unknown; following?: unknown } }).free ?? {};
      const followers = typeof free.followers === "number" ? free.followers : undefined;
      const following = typeof free.following === "number" ? free.following : undefined;
      if (followers !== undefined) {
        await recordProfileSnapshot(supa, platform, handle, followers, following);
      }

      // 4) cache for 48h (best-effort) — only cache default-params runs, so
      // subsequent default fetches are fast but custom-count runs always
      // read fresh data.
      if (!hasParams) {
        await writeCachedToolResult(supa, platform, handle, toolId, result);
      }
    }

    // 5) entitlement gate — return blurred locked values for non-entitled users
    // DEV: force-unlocked while we build/test the full product. Real gate
    // returns via `isEntitled(supa, user?.id ?? null, key)` — restore before
    // going live with payments.
    const entitled = true;
    void isEntitled;
    void blurLocked;
    const responseResult = result;

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
    if (e instanceof HandleNotFoundError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: "not_found" },
        { status: 404 },
      );
    }
    if (e instanceof ProviderRateLimitError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: "provider_rate_limit" },
        { status: 503 },
      );
    }
    if (e instanceof PrivateAccountError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: "private_account" },
        { status: 422 },
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
