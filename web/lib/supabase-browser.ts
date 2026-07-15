"use client";

import { createBrowserClient } from "@supabase/ssr";

// These env vars are inlined at build time by Next.js because they carry
// the NEXT_PUBLIC_ prefix. If a deploy is built WITHOUT them set, the
// values become `undefined` in the client bundle and createBrowserClient
// throws a cryptic "Invalid URL" error the first time an event handler
// fires — which surfaces to the user as a blank "Application error" screen.
//
// Guarding here trades the cryptic Supabase error for a clear operator-
// facing message. In production we still want a hard failure (silent
// fallback would hide the misconfig), but it points at the real fix
// (set the env vars on the failing deploy) instead of at Supabase.
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase browser client is misconfigured: NEXT_PUBLIC_SUPABASE_URL " +
        "and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set at build time. " +
        "If you're seeing this on a preview/staging URL, redeploy that " +
        "service with the same env vars as production.",
    );
  }
  return createBrowserClient(url, key);
}
