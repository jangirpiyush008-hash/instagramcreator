import { NextResponse } from "next/server";
import { issueAdminSession, verifyAdminPassword, clearAdminSession } from "@/web/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/auth  { password } → sets admin session cookie
// DELETE /api/admin/auth              → clears the session

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const password = (body as { password?: string }).password ?? "";
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ ok: false, error: "Password required" }, { status: 400 });
  }
  if (!verifyAdminPassword(password)) {
    // Generic message — never confirm whether a specific input string
    // is close to the real password.
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  await issueAdminSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
