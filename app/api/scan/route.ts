import { NextResponse } from "next/server";
import { ScanRequestSchema } from "@/core/validation";
import { isEntitled } from "@/core/billing/entitlements";
import {
  checkAndIncrementUsage,
  isAuthRequiredError,
  isUpgradeRequiredError,
} from "@/core/billing/rate-limit";
import { blurLocked } from "@/core/tools/teaser";
import { supabaseService } from "@/core/database/supabase";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { scanKey } from "@/core/utils/handle";
import { regionFromHeaders } from "@/core/utils/region";
import { hashIp, getClientIp } from "@/core/utils/hash";
import { RateLimitError } from "@/core/utils/errors";
import { executeScan } from "@/core/scan/executor";
import { toScanErrorResponse } from "@/core/scan/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Internal web-UI scan endpoint. Uses session-cookie auth (getCurrentUser),
// checks tier-based rate limits, and returns the (possibly-teased) result
// along with usage counters so the UI can show "3 of 5 used". Public-API
// traffic uses /v1/scan/... with x-api-key auth + credit metering.

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

  const { platform, toolId, params, handle } = parsed.data;
  const user = await getCurrentUser();
  const supa = supabaseService();
  const region = regionFromHeaders(req.headers);
  const key = scanKey(platform, handle, toolId);

  try {
    // Rate-limit BEFORE the executor so we don't burn provider budget on a
    // rejected request. Also blocks anon access to signed-in-only tools.
    const anonKey = user ? null : await hashIp(getClientIp(req.headers));
    const usage = await checkAndIncrementUsage({
      supabaseService: supa,
      userId: user?.id ?? null,
      anonKey,
      toolId,
    });

    const { result } = await executeScan({ platform, handle, toolId, params });

    // Entitlement gate: only signed-in users with an active subscription
    // OR a matching one-time unlock see the full 'locked' block. Everyone
    // else gets the free teaser view (locked fields blurred to placeholders).
    const entitled = await isEntitled(supa, user?.id ?? null, key);
    const gated = entitled ? result : blurLocked(result);

    return NextResponse.json({
      ok: true,
      entitled,
      result: gated,
      scanKey: key,
      region,
      isAuthed: !!user,
      usage,
    });
  } catch (e) {
    if (isAuthRequiredError(e)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Sign in to use this tool. Free anonymous access is limited to a couple of preview tools.",
          code: "auth_required",
        },
        { status: 401 },
      );
    }
    if (isUpgradeRequiredError(e)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Your ${e.currentTier} plan doesn't include this tool. Upgrade to Starter for full access.`,
          code: "upgrade_required",
          currentTier: e.currentTier,
        },
        { status: 402 },
      );
    }
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        {
          ok: false,
          error: user
            ? `You've used your monthly scan quota (${e.limit}). Upgrade to the next tier for more scans.`
            : `You've used your 5 free scans for today. Sign up free to get 20 scans a month.`,
          code: "rate_limit",
          limit: e.limit,
          window: e.windowLabel,
          isAuthed: !!user,
        },
        { status: 429 },
      );
    }
    return toScanErrorResponse(e);
  }
}
