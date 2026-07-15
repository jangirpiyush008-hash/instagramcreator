import { NextResponse } from "next/server";
import { getCurrentUser, supabaseServer } from "@/web/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/profile/password — change the signed-in user's password.
// Supabase Auth handles both the reauth check (we ask for the current
// password) and the new-password write. We don't touch the DB ourselves.
//
// Body: { currentPassword, newPassword }
//
// Note: Google-OAuth-only users don't have a password to change. We
// detect that (no email/password identity on the user) and return a
// specific error so the UI can hide the form or show "Set password".

interface Body {
  currentPassword?: string;
  newPassword?: string;
}

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

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
  const { currentPassword, newPassword } = raw as Body;

  if (!currentPassword || typeof currentPassword !== "string") {
    return NextResponse.json(
      { ok: false, error: "Current password required" },
      { status: 400 },
    );
  }
  if (
    !newPassword ||
    typeof newPassword !== "string" ||
    newPassword.length < MIN_PASSWORD ||
    newPassword.length > MAX_PASSWORD
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `New password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`,
      },
      { status: 400 },
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { ok: false, error: "New password must differ from current" },
      { status: 400 },
    );
  }

  const supa = await supabaseServer();

  // Reauth by attempting a sign-in with the current password. This is
  // the only sanctioned way to verify the current password on the
  // Supabase JS client. It creates a fresh session — harmless because
  // the session cookie was already valid.
  if (!user.email) {
    return NextResponse.json(
      { ok: false, error: "This account has no email password to change (OAuth-only)." },
      { status: 400 },
    );
  }
  const { error: reauthErr } = await supa.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthErr) {
    return NextResponse.json(
      { ok: false, error: "Current password is incorrect" },
      { status: 401 },
    );
  }

  const { error: updateErr } = await supa.auth.updateUser({ password: newPassword });
  if (updateErr) {
    console.error("[api/profile/password] update failed:", updateErr.message);
    return NextResponse.json(
      { ok: false, error: `Password change failed: ${updateErr.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
