import { NextResponse } from "next/server";
import { adapterFor } from "@/core/data/router";
import type { Platform } from "@/core/types";
import { PrivateAccountError, HandleNotFoundError, ProviderRateLimitError } from "@/core/utils/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/prewarm  body: { platform, handle }
//
// Called by the Overview master-search. Fetches the profile + a small
// slice of recent posts through the adapter stack, priming the primitive
// cache (data_cache table, 24h profile / 6h posts TTL). Any tool the
// user clicks next reads from cache instead of paying for a fresh API
// call — that's the "type once, click all 11 tools" flow.
//
// Returns a minimal profile snapshot so the Overview panel can render
// name/followers/avatar immediately without a second round trip.
//
// Not billed as a scan. It's a UX helper. Real credit metering happens
// on the actual tool run via /api/scan.

const VALID_PLATFORMS = new Set<Platform>(["instagram", "tiktok", "youtube"]);
const HANDLE_RE = /^[A-Za-z0-9._-]{1,64}$/;

export async function POST(req: Request) {
  let body: { platform?: string; handle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const platformRaw = body.platform;
  const handle = (body.handle ?? "").trim().replace(/^@/, "");

  if (!platformRaw || !VALID_PLATFORMS.has(platformRaw as Platform)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid platform" }, { status: 400 });
  }
  if (!handle || !HANDLE_RE.test(handle)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid handle" }, { status: 400 });
  }
  const platform = platformRaw as Platform;

  const adapter = adapterFor(platform);

  // Run in parallel — Promise.allSettled so a posts miss doesn't fail
  // the whole prewarm (profile is the important one; posts is a nice-to-have).
  const [profileRes, postsRes] = await Promise.allSettled([
    adapter.getProfile(platform, handle),
    adapter.getRecentPosts(platform, handle, 12),
  ]);

  if (profileRes.status === "rejected") {
    const err = profileRes.reason;
    if (err instanceof HandleNotFoundError) {
      return NextResponse.json(
        { ok: false, error: "handle-not-found", message: err.message },
        { status: 404 },
      );
    }
    if (err instanceof PrivateAccountError) {
      return NextResponse.json(
        { ok: false, error: "private-account", message: err.message },
        { status: 403 },
      );
    }
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "rate-limited", message: err.message },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "provider-error",
        message: err instanceof Error ? err.message : "Prewarm failed",
      },
      { status: 502 },
    );
  }

  const profile = profileRes.value;
  const postsCount = postsRes.status === "fulfilled" ? postsRes.value.length : 0;

  return NextResponse.json({
    ok: true,
    profile: {
      handle: profile.handle,
      displayName: profile.displayName ?? null,
      followers: profile.followers,
      following: profile.following ?? null,
      verified: !!profile.verified,
      avatarUrl: profile.avatarUrl ?? null,
      isPrivate: !!profile.isPrivate,
      niche: profile.niche ?? null,
    },
    postsPrewarmed: postsCount,
  });
}
