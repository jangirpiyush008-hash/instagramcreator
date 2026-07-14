import { NextResponse } from "next/server";
import { authenticateApiKey, logApiUsage } from "@/core/api/auth";
import { supabaseService } from "@/core/database/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /v1/watchlist/{id} — untrack an account. RLS ensures a customer
// can only delete their own rows even if they guess someone else's UUID.

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const started = Date.now();
  const { id } = await ctx.params;
  const auth = await authenticateApiKey(req);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  }

  const supa = supabaseService();
  const { error, count } = await supa
    .from("api_watchlist")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, code: "db_error" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ ok: false, error: "Watchlist entry not found", code: "not_found" }, { status: 404 });
  }

  logApiUsage(supa, {
    keyId: auth.keyId,
    userId: auth.userId,
    endpoint: "v1.watchlist.delete",
    creditsCharged: 0,
    responseCode: 200,
    durationMs: Date.now() - started,
  });
  return NextResponse.json({ ok: true });
}
