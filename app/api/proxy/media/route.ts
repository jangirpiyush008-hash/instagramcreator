import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams a remote media asset (thumbnail or video) through this server so the
// browser can display or download it. Third-party CDNs (tiktokcdn, cdninstagram)
// return 403 on cross-origin embed / download because of hotlink protection —
// proxying through our origin bypasses that because the CDN sees a request
// with our IP and our own Referer (none), not the browser's.
//
// Allowlist: only proxy hosts we actually source media from. Prevents this
// endpoint being used as an open forwarder for arbitrary URLs.

const ALLOWED_HOST_PATTERNS = [
  /(^|\.)tiktokcdn(-us)?\.com$/i,
  /(^|\.)tiktokcdn-eu\.com$/i,
  /(^|\.)tiktokv\.com$/i,
  /(^|\.)tiktokv-us\.com$/i,
  /(^|\.)muscdn\.com$/i,
  /(^|\.)cdninstagram\.com$/i,
  /(^|\.)fbcdn\.net$/i,
  /(^|\.)tikwm\.com$/i,
];

function isAllowedUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname;
  if (!ALLOWED_HOST_PATTERNS.some((rx) => rx.test(host))) return null;
  return u;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  const filename = searchParams.get("filename");
  const download = searchParams.get("download") === "1";

  if (!target) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }
  const parsed = isAllowedUrl(target);
  if (!parsed) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch(parsed.toString(), {
      // Some CDNs check Referer; sending none avoids the browser's Referer
      // being forwarded and getting rejected.
      headers: { "user-agent": "Mozilla/5.0 DecodeCreator-Media-Proxy" },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: 502 },
      );
    }
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    const headers: Record<string, string> = {
      "content-type": contentType,
      "cache-control": "public, max-age=300",
    };
    if (contentLength) headers["content-length"] = contentLength;
    if (download) {
      const safeName = (filename ?? "download").replace(/[^\w.\-]/g, "_");
      headers["content-disposition"] = `attachment; filename="${safeName}"`;
    }
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
