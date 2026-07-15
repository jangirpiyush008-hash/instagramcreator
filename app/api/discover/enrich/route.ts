import { NextResponse } from "next/server";
import { adapterFor } from "@/core/data/router";
import { supabaseService } from "@/core/database/supabase";
import type { Platform } from "@/core/types";
import type { Post } from "@/core/data/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/discover/enrich?platform=X&handle=Y[&n=4]
//
// On-demand post enrichment for Discovery results. Called when the
// user clicks "Show posts" on a card. Uses the same adapter stack
// as the main /scan flow — CachedAdapter-wrapped so re-fetches for
// the same handle hit the primitive cache and don't cost provider
// credit twice.
//
// Writes the result back to creator_index.recent_posts (jsonb) so
// subsequent Discovery searches that return this handle show the
// posts inline WITHOUT another API call.
//
// Cost per call: ~$0.002-0.005 (one getRecentPosts). Cheap enough
// that even a few dozen clicks per search still adds pennies.

const VALID_PLATFORMS = new Set<Platform>(["instagram", "tiktok", "youtube"]);
const HANDLE_RE = /^[A-Za-z0-9._-]{1,64}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const platformRaw = url.searchParams.get("platform");
  const handle = (url.searchParams.get("handle") ?? "").trim();
  const nRaw = url.searchParams.get("n");
  const n = Math.min(12, Math.max(1, parseInt(nRaw ?? "4", 10) || 4));

  if (!platformRaw || !VALID_PLATFORMS.has(platformRaw as Platform)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid platform" },
      { status: 400 },
    );
  }
  if (!handle || !HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid handle" },
      { status: 400 },
    );
  }
  const platform = platformRaw as Platform;

  const supa = supabaseService();

  // Serve cached recent_posts if we already have them (fresh in the
  // last 6 hours). Same handle-hit doesn't burn provider quota twice.
  const cacheFresh = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supa
    .from("creator_index")
    .select("recent_posts, refreshed_at")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();
  if (
    cached?.recent_posts &&
    Array.isArray(cached.recent_posts) &&
    cached.recent_posts.length > 0 &&
    cached.refreshed_at &&
    cached.refreshed_at > cacheFresh
  ) {
    return NextResponse.json({
      ok: true,
      posts: (cached.recent_posts as Post[]).slice(0, n),
      cached: true,
    });
  }

  // Cache miss / stale → call the real adapter.
  const adapter = adapterFor(platform);
  let posts: Post[] = [];
  try {
    posts = await adapter.getRecentPosts(platform, handle, n);
  } catch (e) {
    console.warn(
      "[discover/enrich] adapter.getRecentPosts failed:",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Provider error" },
      { status: 502 },
    );
  }

  // Trim to just the fields the discovery UI needs — smaller row + less
  // to trust. `videoUrlHd` and audience-enrichment fields stay out.
  const trimmed = posts.slice(0, n).map((p) => ({
    id: p.id,
    thumbnailUrl: p.thumbnailUrl ?? p.thumbnailUrlHd ?? null,
    likes: p.likes ?? 0,
    comments: p.comments ?? 0,
    views: p.views ?? null,
    caption: (p.caption ?? p.title ?? "").slice(0, 280),
    permalink: p.permalink ?? null,
    postedAt: p.postedAt,
  }));

  // Write back to creator_index for next-search-instant. Non-fatal on
  // failure — the response still has the fresh data.
  await supa
    .from("creator_index")
    .upsert(
      {
        platform,
        handle,
        recent_posts: trimmed,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: "platform,handle" },
    )
    .then(({ error }) => {
      if (error) console.warn("[discover/enrich] cache upsert failed:", error.message);
    });

  return NextResponse.json({ ok: true, posts: trimmed, cached: false });
}
