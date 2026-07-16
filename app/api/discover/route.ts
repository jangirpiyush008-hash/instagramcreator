import { NextResponse } from "next/server";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { getUserTier } from "@/core/billing/entitlements";
import { searchCreators, readDiagnostic, type SearchFilters } from "@/core/discover/search";
import type { Platform } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/discover?platform=instagram&q=skincare&followers_min=10000&followers_max=100000&er_min=2
//
// Response: { ok: true, results: DiscoveryHit[], gated?: boolean }
//
// Gating: Pro tier and above get unlimited searches. Free/Starter get
// a small taste (5 searches/day tracked in localStorage on the client;
// server side we just check tier). Anon users get a preview of the
// first 5 results with a "Sign in for full results" upsell.

const VALID_PLATFORMS = new Set<Platform>(["instagram", "tiktok", "youtube"]);
const ALLOWED_TIERS_FULL = new Set(["pro", "scale"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") as Platform | null;
  if (!platform || !VALID_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid ?platform= (instagram|tiktok|youtube)" },
      { status: 400 },
    );
  }

  const filters: SearchFilters = {
    q: url.searchParams.get("q") ?? undefined,
    limit: parseIntSafe(url.searchParams.get("limit"), 20, 1, 50),
    followersMin: parseIntSafe(url.searchParams.get("followers_min"), undefined),
    followersMax: parseIntSafe(url.searchParams.get("followers_max"), undefined),
    erMin: parseFloatSafe(url.searchParams.get("er_min")),
    erMax: parseFloatSafe(url.searchParams.get("er_max")),
    verifiedOnly: url.searchParams.get("verified_only") === "1",
  };

  const user = await getCurrentUser();
  const supa = supabaseService();

  // Tier check runs against the service client (uses user id, needs
  // service role for the subscriptions table lookup). Free/Starter
  // users still get results — just a smaller preview page.
  let previewOnly = false;
  if (!user) {
    previewOnly = true;
  } else {
    const tier = await getUserTier(supa, user.id);
    if (!ALLOWED_TIERS_FULL.has(tier.id)) previewOnly = true;
  }

  const results = await searchCreators(supa, platform, filters);

  // Include provider diagnostic on ANY 0-result response OR when
  // ?diag=1 is passed. Turns "why did I get nothing" from a Railway
  // logs hunt into a one-line curl.
  const wantDiag = url.searchParams.get("diag") === "1" || results.length === 0;
  const diag = wantDiag ? readDiagnostic() : undefined;

  // Preview mode: return only 5, flag gated=true so the UI shows an upsell.
  if (previewOnly) {
    return NextResponse.json({
      ok: true,
      results: results.slice(0, 5),
      gated: true,
      total: results.length,
      ...(diag ? { diag } : {}),
    });
  }
  return NextResponse.json({
    ok: true,
    results,
    gated: false,
    total: results.length,
    ...(diag ? { diag } : {}),
  });
}

function parseIntSafe<T>(v: string | null, dflt: T, min?: number, max?: number): number | T {
  if (v == null || v === "") return dflt;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}
function parseFloatSafe(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}
