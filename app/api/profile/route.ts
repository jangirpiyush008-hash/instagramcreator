import { NextResponse } from "next/server";
import { getCurrentUser, supabaseServer } from "@/web/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/profile — update the signed-in user's profile row.
// Uses supabaseServer (session-authed client) so RLS enforces
// auth.uid() = id automatically — a request from user A can never
// mutate user B's row even if they craft a body pointing at it.

interface Body {
  full_name?: string;
  phone?: string;
  country_code?: string;
  company?: string;
  job_title?: string;
  timezone?: string;
  marketing_opt_in?: boolean;
  product_updates_opt_in?: boolean;
}

// Very loose validators — we're storing free-text for humans, not
// executing anything. Just guard obvious abuse (huge payloads).
const MAX_LEN = 200;
function clip(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? null as unknown as string : t.slice(0, MAX_LEN);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const b = raw as Body;

  // Build the patch object. Undefined keys are intentionally NOT
  // included so we only touch fields the client sent (partial update).
  const patch: Record<string, unknown> = {};
  if ("full_name" in b) patch.full_name = clip(b.full_name);
  if ("phone" in b) patch.phone = clip(b.phone);
  if ("country_code" in b) {
    const cc = clip(b.country_code);
    // Normalize to uppercase 2-letter code. Reject anything longer.
    patch.country_code = cc ? cc.toUpperCase().slice(0, 2) : null;
  }
  if ("company" in b) patch.company = clip(b.company);
  if ("job_title" in b) patch.job_title = clip(b.job_title);
  if ("timezone" in b) patch.timezone = clip(b.timezone);
  if (typeof b.marketing_opt_in === "boolean") patch.marketing_opt_in = b.marketing_opt_in;
  if (typeof b.product_updates_opt_in === "boolean") patch.product_updates_opt_in = b.product_updates_opt_in;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  const supa = await supabaseServer();
  const { error } = await supa.from("profiles").update(patch).eq("id", user.id);
  if (error) {
    console.error("[api/profile] update failed:", error.code, error.message);
    return NextResponse.json(
      { ok: false, error: `Update failed: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, patch });
}
