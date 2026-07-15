import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { supabaseService } from "@/core/database/supabase";
import { CONSUMER_TIERS } from "@/core/billing/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/users/[id]/subscription
// Body: { plan: 'free' | 'starter' | 'pro' | 'scale', months?: 1..24 }
//
// Owner-comp / manual activation flow — bypasses Razorpay. Creates
// (or updates) a subscription row with provider='admin' so it's
// obvious this wasn't a real payment. current_period_end is set N
// months in the future.
//
// Setting plan='free' cancels the current active subscription instead
// of creating a new one — status becomes 'canceled'.

const VALID = new Set(["free", ...Object.keys(CONSUMER_TIERS)]);

interface Body {
  plan?: string;
  months?: number;
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
  const { plan, months = 1 } = raw as Body;
  if (!plan || !VALID.has(plan)) {
    return NextResponse.json(
      { ok: false, error: `Plan must be one of: ${[...VALID].join(", ")}` },
      { status: 400 },
    );
  }
  if (!Number.isFinite(months) || months < 1 || months > 24) {
    return NextResponse.json({ ok: false, error: "months must be 1–24" }, { status: 400 });
  }

  const supa = supabaseService();
  const now = new Date();

  if (plan === "free") {
    // Cancel any active subscription.
    const { error } = await supa
      .from("subscriptions")
      .update({ status: "canceled", updated_at: now.toISOString() })
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) {
      return NextResponse.json(
        { ok: false, error: `Cancel failed: ${error.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, plan: "free", cancelledActive: true });
  }

  // Cancel any existing active sub first — one active row at a time.
  await supa
    .from("subscriptions")
    .update({ status: "canceled", updated_at: now.toISOString() })
    .eq("user_id", userId)
    .eq("status", "active");

  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + months);

  // Insert the new active row. provider='admin' flags it as a comp
  // so filters, reports, and revenue math can distinguish it from
  // Razorpay-driven subs.
  const { error } = await supa.from("subscriptions").insert({
    user_id: userId,
    provider: "admin",
    plan,
    status: "active",
    current_period_end: periodEnd.toISOString(),
    provider_sub_id: null,
    provider_customer_id: null,
  });
  if (error) {
    return NextResponse.json(
      { ok: false, error: `Insert failed: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    plan,
    months,
    current_period_end: periodEnd.toISOString(),
  });
}
