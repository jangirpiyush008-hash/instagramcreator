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
// session cookie, enriches the profile row with the OAuth metadata
// (name, avatar) that Supabase captures but doesn't auto-copy to our
// own profiles table, then sends the user to /account.
// URL is kept param-free so Supabase's strict Redirect-URL allowlist
// matches exactly.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await supabaseServer();
    const { data: sessionData } = await supabase.auth.exchangeCodeForSession(code);
    // Enrich the profile with Google-provided metadata. The handle_new_user
    // trigger already created the row with just id + email + default region.
    // We layer on full_name and avatar_url here so we can personalize the
    // UI and pre-fill checkout later.
    const user = sessionData?.user;
    if (user) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName =
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        null;
      const avatarUrl =
        (meta.avatar_url as string | undefined) ??
        (meta.picture as string | undefined) ??
        null;
      if (fullName || avatarUrl) {
        // Best-effort — a failed update doesn't block sign-in.
        await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            avatar_url: avatarUrl,
          })
          .eq("id", user.id)
          .then(({ error }) => {
            if (error) {
              // profiles table may not have these columns yet — see 0004
              // migration. Non-fatal.
              console.warn("[auth/callback] profile enrichment failed:", error.message);
            }
          });
      }
    }
  }
  return NextResponse.redirect(`${publicOrigin(req)}/account`);
}
