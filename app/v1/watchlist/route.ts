import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey, chargeCredits, logApiUsage } from "@/core/api/auth";
import { WATCHLIST_ADD_COST, WATCHLIST_READ_COST } from "@/core/api/credits";
import { supabaseService } from "@/core/database/supabase";
import { readRecentSnapshots } from "@/core/data/snapshots";
import { normalizeHandle } from "@/core/utils/handle";
import type { Platform } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddWatchlistSchema = z.object({
  platform: z.enum(["instagram", "tiktok", "youtube"]),
  handle: z.string().min(1).max(80),
  label: z.string().max(120).optional(),
});

// GET  /v1/watchlist               → list all tracked accounts + latest snapshot
// POST /v1/watchlist               → add {platform, handle, label?}

export async function GET(req: Request) {
  const started = Date.now();
  const auth = await authenticateApiKey(req);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  }
  const supa = supabaseService();

  const newBalance = await chargeCredits(auth, WATCHLIST_READ_COST);
  if (newBalance === null) {
    return NextResponse.json({ ok: false, error: "Credits exhausted", code: "credits_exhausted" }, { status: 402 });
  }

  const { data: rows, error } = await supa
    .from("api_watchlist")
    .select("id, platform, handle, label, created_at")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, code: "db_error" }, { status: 500 });
  }

  // Enrich each row with the two most recent snapshots (for a delta).
  const enriched = await Promise.all(
    (rows ?? []).map(async (r) => {
      const snaps = await readRecentSnapshots(supa, r.platform as Platform, r.handle, 2);
      const latest = snaps[0];
      const previous = snaps[1];
      return {
        id: r.id,
        platform: r.platform,
        handle: r.handle,
        label: r.label,
        addedAt: r.created_at,
        latestFollowers: latest?.followers ?? null,
        latestSnapshotAt: latest?.taken_at ?? null,
        deltaSincePrevious:
          latest && previous ? latest.followers - previous.followers : null,
      };
    }),
  );

  logApiUsage(supa, {
    keyId: auth.keyId,
    userId: auth.userId,
    endpoint: "v1.watchlist.list",
    creditsCharged: WATCHLIST_READ_COST,
    responseCode: 200,
    durationMs: Date.now() - started,
  });
  return NextResponse.json({
    ok: true,
    credits: { charged: WATCHLIST_READ_COST, remaining: newBalance },
    data: enriched,
  });
}

export async function POST(req: Request) {
  const started = Date.now();
  const auth = await authenticateApiKey(req);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body", code: "bad_body" }, { status: 400 });
  }
  const parsed = AddWatchlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; "), code: "bad_body" },
      { status: 400 },
    );
  }

  const supa = supabaseService();
  const handle = normalizeHandle(parsed.data.handle);

  const { data, error } = await supa
    .from("api_watchlist")
    .insert({
      user_id: auth.userId,
      platform: parsed.data.platform,
      handle,
      label: parsed.data.label ?? null,
    })
    .select("id, platform, handle, label, created_at")
    .single();

  if (error) {
    // Unique-constraint violation → already tracked; return the existing row.
    if (error.code === "23505") {
      const { data: existing } = await supa
        .from("api_watchlist")
        .select("id, platform, handle, label, created_at")
        .eq("user_id", auth.userId)
        .eq("platform", parsed.data.platform)
        .eq("handle", handle)
        .single();
      return NextResponse.json({
        ok: true,
        alreadyTracked: true,
        credits: { charged: 0, remaining: auth.creditsRemaining },
        data: existing,
      });
    }
    return NextResponse.json({ ok: false, error: error.message, code: "db_error" }, { status: 500 });
  }

  logApiUsage(supa, {
    keyId: auth.keyId,
    userId: auth.userId,
    endpoint: "v1.watchlist.add",
    platform: parsed.data.platform,
    handle,
    creditsCharged: WATCHLIST_ADD_COST,
    responseCode: 200,
    durationMs: Date.now() - started,
  });
  return NextResponse.json({
    ok: true,
    credits: { charged: WATCHLIST_ADD_COST, remaining: auth.creditsRemaining },
    data,
  });
}
