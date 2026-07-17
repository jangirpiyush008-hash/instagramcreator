import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { snapshotHealth, resetProvider } from "@/core/data/provider-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only provider health telemetry. Read-only GET returns current
// state of every provider in the chain (circuit-breaker state, success/
// failure counts, latency percentiles, recent 200 attempts).
//
// POST /api/admin/providers/health/reset — manually re-close a breaker
// after topping up a provider's balance. Body: { provider: "hiker" }.
//
// Never gated by anything other than the admin session cookie; the
// health map is process-local and contains no secrets. Even if leaked,
// there's nothing sensitive to expose — just error counts and latency.

export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const snapshot = snapshotHealth();
  return NextResponse.json({ ok: true, ...snapshot });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const provider = (body as { provider?: string }).provider ?? "";
  if (!provider || typeof provider !== "string") {
    return NextResponse.json(
      { ok: false, error: "Provider name required" },
      { status: 400 },
    );
  }
  const reset = resetProvider(provider);
  if (!reset) {
    return NextResponse.json(
      { ok: false, error: `Unknown provider: ${provider}` },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, provider, message: "Breaker reset" });
}
