import { NextResponse } from "next/server";
import { ScanRequestSchema } from "@/core/validation";
import { isEntitled } from "@/core/billing/entitlements";
import { checkAndIncrementUsage } from "@/core/billing/rate-limit";
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

// Internal web-UI scan endpoint. Uses session-cookie auth (getCurrentUser)
// and the free-user rate limit. Public API traffic uses /v1/scan/... with
// x-api-key auth + credit metering. Both share core/scan/executor.

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
    // rejected request. Cache-hit path also checks (cheap either way).
    const anonKey = user ? null : await hashIp(getClientIp(req.headers));
    await checkAndIncrementUsage({
      supabaseService: supa,
      userId: user?.id ?? null,
      anonKey,
    });

    const { result } = await executeScan({ platform, handle, toolId, params });

    // DEV: entitlement gate is force-open while we build. Flip both `void`s
    // back to real usage before wiring live payments.
    const entitled = true;
    void isEntitled;
    void blurLocked;

    return NextResponse.json({
      ok: true,
      entitled,
      result,
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
    return toScanErrorResponse(e);
  }
}
