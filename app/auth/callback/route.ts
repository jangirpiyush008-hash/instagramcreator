import { NextResponse } from "next/server";
import { supabaseServer } from "@/web/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Determine the correct PUBLIC origin to redirect to.
// Behind Railway's / Vercel's proxy, `req.url` shows the INTERNAL hostname
// (e.g. localhost:8080) which is useless for a browser redirect. Prefer
// explicit config, then standard forwarded headers, then fall back to
// req.url as a last resort.
function publicOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    new URL(req.url).host;
  return `${proto}://${host}`;
}

// Post-auth landing point. Exchanges the OAuth / magic-link code for a
// session cookie, then always sends the user to /account. URL is kept
// param-free so Supabase's strict Redirect-URL allowlist matches exactly.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${publicOrigin(req)}/account`);
}
