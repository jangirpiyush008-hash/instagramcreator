import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { supabaseService } from "@/core/database/supabase";
import { creditWallet } from "@/core/billing/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/users/create
// Body:
//   { email, full_name?, mode: 'password'|'invite',
//     password?, seed_credits?, seed_note? }
//
// Uses the Supabase auth admin API (via service-role client) which:
//   - password mode  → creates the user AND sets password immediately.
//                       auto-confirmed so they can sign in right away.
//   - invite mode    → emails them a magic link to set their own
//                       password. Email delivery goes through Supabase's
//                       configured SMTP (or their default sender).

interface Body {
  email?: string;
  full_name?: string;
  mode?: "password" | "invite";
  password?: string;
  seed_credits?: number;
  seed_note?: string;
}

export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "Admin auth required" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const b = raw as Body;

  const email = (b.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
  }
  const mode = b.mode === "invite" ? "invite" : "password";
  if (mode === "password") {
    if (!b.password || b.password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }
  }
  const seedCredits =
    typeof b.seed_credits === "number" && Number.isFinite(b.seed_credits) && b.seed_credits > 0
      ? Math.floor(b.seed_credits)
      : 0;
  if (seedCredits > 100_000) {
    return NextResponse.json(
      { ok: false, error: "seed_credits capped at 100000 — top up more via credit adjustment later" },
      { status: 400 },
    );
  }

  const supa = supabaseService();

  // Supabase admin API — createUser vs inviteUserByEmail.
  // Both live under supa.auth.admin.*. The service-role client we
  // already use (via supabaseService()) has the required permissions.
  let userId: string;
  try {
    if (mode === "password") {
      const { data, error } = await supa.auth.admin.createUser({
        email,
        password: b.password,
        email_confirm: true,
        user_metadata: b.full_name ? { full_name: b.full_name } : undefined,
      });
      if (error || !data?.user) {
        return NextResponse.json(
          { ok: false, error: error?.message ?? "Auth create failed" },
          { status: 400 },
        );
      }
      userId = data.user.id;
    } else {
      const { data, error } = await supa.auth.admin.inviteUserByEmail(email, {
        data: b.full_name ? { full_name: b.full_name } : undefined,
      });
      if (error || !data?.user) {
        return NextResponse.json(
          { ok: false, error: error?.message ?? "Invite send failed" },
          { status: 400 },
        );
      }
      userId = data.user.id;
    }
  } catch (e) {
    console.error("[admin/users/create] failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Create failed" },
      { status: 500 },
    );
  }

  // The handle_new_user trigger on auth.users creates the profiles row
  // for us. Best-effort update full_name if it wasn't picked up from
  // user_metadata (some Supabase versions delay the sync).
  if (b.full_name) {
    await supa.from("profiles").update({ full_name: b.full_name }).eq("id", userId);
  }

  // Optional wallet seed. Uses the same creditWallet helper the
  // Razorpay webhook uses, so admin-created lots behave identically
  // in the wallet history (source = "admin:comp:<note>").
  let creditsGiven = 0;
  if (seedCredits > 0) {
    try {
      const source = `admin:comp:${(b.seed_note ?? "onboarding").slice(0, 60)}`;
      await creditWallet(supa, { userId, credits: seedCredits, source });
      creditsGiven = seedCredits;
    } catch (e) {
      // Non-fatal — user was created, just the seed failed. Log and
      // return partial success so the admin can retry via the credit
      // adjustment form on the user detail page.
      console.warn("[admin/users/create] seed failed:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    email,
    mode,
    credits_given: creditsGiven || undefined,
  });
}
