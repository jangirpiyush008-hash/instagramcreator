import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { supabaseService } from "@/core/database/supabase";
import { creditWallet, deductFromWallet } from "@/core/billing/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/users/[id]/credits  { delta: number, note?: string }
//   delta > 0 → credits the user (adds a lot with source = admin:<note>)
//   delta < 0 → deducts credits (FIFO across lots)
//
// Admin-session-authed. Not exposed to users directly.

interface Body {
  delta?: number;
  note?: string;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "Admin auth required" }, { status: 401 });
  }
  const { id: userId } = await ctx.params;
  if (!/^[0-9a-f-]{20,}$/.test(userId)) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { delta, note } = raw as Body;
  if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) {
    return NextResponse.json(
      { ok: false, error: "delta must be a non-zero number" },
      { status: 400 },
    );
  }
  // Hard cap to prevent typo-level accidents.
  if (Math.abs(delta) > 1_000_000) {
    return NextResponse.json(
      { ok: false, error: "delta too large (>1M) — split into smaller adjustments" },
      { status: 400 },
    );
  }

  const supa = supabaseService();
  const source = `admin:${(note ?? "adjustment").slice(0, 60)}`;

  try {
    if (delta > 0) {
      await creditWallet(supa, { userId, credits: delta, source });
    } else {
      const taken = await deductFromWallet(supa, userId, -delta);
      if (taken < -delta) {
        // Not enough credits to fulfill the deduct — return partial info.
        return NextResponse.json({
          ok: true,
          partial: true,
          requested: delta,
          applied: -taken,
          reason: "insufficient wallet balance",
        });
      }
    }
    return NextResponse.json({ ok: true, applied: delta });
  } catch (e) {
    console.error("[admin/credits] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Wallet write failed" },
      { status: 500 },
    );
  }
}
