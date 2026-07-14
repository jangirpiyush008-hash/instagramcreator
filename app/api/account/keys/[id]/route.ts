import { NextResponse } from "next/server";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/account/keys/{id} — soft-revoke (sets revoked_at). Requests
// using the raw key start failing immediately. We keep the row so usage
// history still resolves against it.

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in", code: "unauth" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supa = supabaseService();

  const { error, count } = await supa
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, code: "db_error" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ ok: false, error: "Key not found or already revoked", code: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
