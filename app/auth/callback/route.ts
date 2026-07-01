import { NextResponse } from "next/server";
import { supabaseServer } from "@/web/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Post-auth landing point. Exchanges the OAuth / magic-link code for a
// session cookie, then always sends the user to /account. Keeping this URL
// param-free is important — Supabase's Redirect URL allowlist uses strict
// matching and rejects anything with a query string, so /login must NOT
// tack on a ?next=... here.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/account", url.origin));
}
