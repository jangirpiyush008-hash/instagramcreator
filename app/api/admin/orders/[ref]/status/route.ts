import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { supabaseService } from "@/core/database/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "awaiting_payment",
  "verifying",
  "paid",
  "fulfilling",
  "delivered",
  "failed",
  "refunded",
]);

// POST /api/admin/orders/[ref]/status  { status }
// Admin-session-authed. Overwrites the order's status field.

export async function POST(
  req: Request,
  ctx: { params: Promise<{ ref: string }> },
) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "Admin auth required" }, { status: 401 });
  }
  const { ref } = await ctx.params;
  if (!/^DC-[A-Z0-9]{8}$/i.test(ref)) {
    return NextResponse.json({ ok: false, error: "Invalid order ref" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { status } = raw as { status?: string };
  if (!status || !ALLOWED.has(status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }

  const supa = supabaseService();
  const { error } = await supa
    .from("service_orders")
    .update({ status })
    .eq("order_ref", ref.toUpperCase());
  if (error) {
    console.error("[admin/orders/status] update failed:", error.code, error.message);
    return NextResponse.json(
      { ok: false, error: `Update failed: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, status });
}
