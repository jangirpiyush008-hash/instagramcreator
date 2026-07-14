import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { generateApiKey } from "@/core/api/keys";
import { TIERS } from "@/core/api/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/account/keys — signed-in user creates a new API key.
// Returns the raw key ONCE in the response. Server never stores it in raw
// form — only the sha256 hash goes to the DB.

const BodySchema = z.object({
  name: z.string().trim().min(1).max(60).default("Default"),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in", code: "unauth" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body", code: "bad_body" }, { status: 400 });
  }

  const supa = supabaseService();

  // Enforce a small ceiling per user so a compromised session can't spam
  // thousands of keys.
  const { count } = await supa
    .from("api_keys")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { ok: false, error: "Max 10 active keys per account. Revoke unused ones first.", code: "key_limit" },
      { status: 400 },
    );
  }

  const key = generateApiKey();
  const tier = TIERS.starter;
  const { data, error } = await supa
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      key_hash: key.hash,
      key_prefix: key.visiblePrefix,
      tier: "starter",
      credits_remaining: tier.credits,
      credits_included: tier.credits,
    })
    .select("id, key_prefix, tier, credits_remaining, credits_included, created_at")
    .single();
  if (error) {
    console.error("[account/keys] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "Failed to create key", code: "db_error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    raw: key.raw, // shown exactly once
    key: data,
  });
}
