import { NextResponse } from "next/server";
import { authenticateApiKey, chargeCredits, logApiUsage } from "@/core/api/auth";
import { DOWNLOAD_PROXY_COST } from "@/core/api/credits";
import { supabaseService } from "@/core/database/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /v1/download?url={media_url}[&filename=X][&stream=1]
// Charged download proxy for API customers. Same allowlist + streaming as
// /api/proxy/media internally — we just gate + meter it. Redirects to the
// internal proxy which does the actual streaming.

const ALLOWED_HOST_PATTERNS = [
  /(^|\.)tiktokcdn(-us)?\.com$/i,
  /(^|\.)tiktokcdn-eu\.com$/i,
  /(^|\.)tiktokv\.com$/i,
  /(^|\.)tiktokv-us\.com$/i,
  /(^|\.)muscdn\.com$/i,
  /(^|\.)cdninstagram\.com$/i,
  /(^|\.)fbcdn\.net$/i,
  /(^|\.)tikwm\.com$/i,
  /(^|\.)ytimg\.com$/i,
  /(^|\.)googleusercontent\.com$/i,
];

export async function GET(req: Request) {
  const started = Date.now();
  const auth = await authenticateApiKey(req);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  const filename = url.searchParams.get("filename") ?? undefined;
  const stream = url.searchParams.get("stream") === "1";

  if (!target) {
    return NextResponse.json({ ok: false, error: "Missing ?url= parameter", code: "missing_url" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid url", code: "bad_url" }, { status: 400 });
  }
  if (!ALLOWED_HOST_PATTERNS.some((rx) => rx.test(parsed.hostname))) {
    return NextResponse.json(
      { ok: false, error: `Host ${parsed.hostname} not on the allowlist. Contact support to add.`, code: "host_not_allowed" },
      { status: 400 },
    );
  }

  const newBalance = await chargeCredits(auth, DOWNLOAD_PROXY_COST);
  if (newBalance === null) {
    return NextResponse.json({ ok: false, error: "Credits exhausted", code: "credits_exhausted" }, { status: 402 });
  }

  // Delegate to the internal media proxy, which handles the actual streaming
  // + CDN allowlist + Content-Disposition. We tack on a header the proxy
  // ignores so nothing changes in that route.
  const proxied = new URL("/api/proxy/media", url.origin);
  proxied.searchParams.set("url", target);
  if (filename) proxied.searchParams.set("filename", filename);
  if (stream) proxied.searchParams.set("download", "1");

  const supa = supabaseService();
  logApiUsage(supa, {
    keyId: auth.keyId,
    userId: auth.userId,
    endpoint: "v1.download",
    creditsCharged: DOWNLOAD_PROXY_COST,
    responseCode: 200,
    durationMs: Date.now() - started,
  });

  // Client follows the redirect and gets the file streamed directly.
  return NextResponse.redirect(proxied.toString(), 302);
}
