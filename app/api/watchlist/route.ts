import { NextResponse } from "next/server";
import { getCurrentUser, supabaseServer } from "@/web/lib/supabase-server";
import type { Platform } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PLATFORMS = new Set<Platform>(["instagram", "tiktok", "youtube"]);
const HANDLE_RE = /^[A-Za-z0-9._-]{1,64}$/;

// POST /api/watchlist { platform, handle, label? }
//
// Adds a creator to the user's watchlist. Duplicate (platform, handle)
// upserts idempotently — clicking "Save" twice on the same card is a
// no-op. Uses the anon-authed supabaseServer client so RLS on
// api_watchlist enforces user_id = auth.uid() automatically.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in to save creators" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as { platform?: string; handle?: string; label?: string };
  if (!b.platform || !VALID_PLATFORMS.has(b.platform as Platform)) {
    return NextResponse.json({ ok: false, error: "Invalid platform" }, { status: 400 });
  }
  if (!b.handle || !HANDLE_RE.test(b.handle)) {
    return NextResponse.json({ ok: false, error: "Invalid handle" }, { status: 400 });
  }

  const supa = await supabaseServer();
  // ignoreDuplicates: the unique (user_id, platform, handle) constraint
  // means clicking "Save" twice is a no-op — DO NOTHING on conflict.
  // Also side-steps the missing UPDATE RLS policy on api_watchlist,
  // which would otherwise reject a real upsert.
  const { error } = await supa
    .from("api_watchlist")
    .upsert(
      {
        user_id: user.id,
        platform: b.platform,
        handle: b.handle,
        label: b.label ?? null,
      },
      { onConflict: "user_id,platform,handle", ignoreDuplicates: true },
    );

  if (error) {
    console.warn("[api/watchlist] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/watchlist?platform=X&handle=Y — remove a saved creator.
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  const handle = url.searchParams.get("handle");
  if (!platform || !VALID_PLATFORMS.has(platform as Platform)) {
    return NextResponse.json({ ok: false, error: "Invalid platform" }, { status: 400 });
  }
  if (!handle || !HANDLE_RE.test(handle)) {
    return NextResponse.json({ ok: false, error: "Invalid handle" }, { status: 400 });
  }

  const supa = await supabaseServer();
  const { error } = await supa
    .from("api_watchlist")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", platform)
    .eq("handle", handle);
  if (error) {
    return NextResponse.json({ ok: false, error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
