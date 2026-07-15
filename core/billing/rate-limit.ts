import type { SupabaseClient } from "@supabase/supabase-js";
import { RateLimitError } from "../utils/errors";
import { ANON_LIMITS, tierAllowsTool, type ConsumerTier } from "./tiers";
import { getUserTier } from "./entitlements";

// Rate-limit / usage-meter for the internal /api/scan endpoint. Uses the
// `usage_daily` table for both anonymous (per-IP-hash) and signed-in
// (per-user) counters. Anonymous users get a small day-bucket; signed-in
// users get a monthly quota based on their consumer tier.
//
// Public-API traffic uses /v1/scan with x-api-key credit metering — that
// path bypasses this file entirely.

const DEV_BYPASS = process.env.RATE_LIMIT_DEV_BYPASS === "1";

export interface UsageInfo {
  tier: string;                 // "anon" | "free" | "starter" | "pro" | "scale"
  limit: number;                // scans allowed in the current window
  used: number;                 // scans already used (INCLUDING this one)
  window: "day" | "month";
  remaining: number;            // max(0, limit - used)
  requiresAuth?: boolean;       // true when the tool needs sign-in and user is anon
}

interface CheckArgs {
  supabaseService: SupabaseClient;
  userId: string | null;
  anonKey: string | null;       // ip hash for anonymous users
  toolId: string;
}

// Bumps usage_daily on a successful scan attempt. Throws RateLimitError
// if the caller is already over quota. Returns UsageInfo (post-increment)
// so the API can surface "3 of 5 used" to the UI without a second round-trip.
export async function checkAndIncrementUsage(args: CheckArgs): Promise<UsageInfo> {
  const { supabaseService, userId, anonKey, toolId } = args;

  // ── Anonymous path ────────────────────────────────────────────────────
  if (!userId) {
    // Anon can only run tools on ANON_LIMITS.toolIds. Everything else
    // requires sign-in. We surface this as a distinct code so the UI can
    // show a "sign in to use this tool" gate, not a rate-limit banner.
    if (!ANON_LIMITS.toolIds.includes(toolId as (typeof ANON_LIMITS.toolIds)[number])) {
      const err = new RateLimitError(ANON_LIMITS.scansPerDay, "day");
      // Reuse the RateLimitError shape so the API doesn't need a new
      // exception type — the route handler distinguishes via `requiresAuth`.
      (err as RateLimitError & { requiresAuth?: boolean }).requiresAuth = true;
      throw err;
    }
    const used = await bumpDayBucket(supabaseService, { anon_key: anonKey ?? "0.0.0.0" });
    const info: UsageInfo = {
      tier: "anon",
      limit: ANON_LIMITS.scansPerDay,
      used,
      window: "day",
      remaining: Math.max(0, ANON_LIMITS.scansPerDay - used),
    };
    if (DEV_BYPASS) return info;
    if (used > ANON_LIMITS.scansPerDay) {
      throw new RateLimitError(ANON_LIMITS.scansPerDay, "day");
    }
    return info;
  }

  // ── Signed-in path ────────────────────────────────────────────────────
  const tier = await getUserTier(supabaseService, userId);

  // Free-tier users can only run the tools their plan permits. Paid tiers
  // ("starter" upward) are `toolIds: "all"` so this check is a no-op for them.
  if (!tierAllowsTool(tier, toolId)) {
    const err = new RateLimitError(tier.scansPerMonth, "month");
    (err as RateLimitError & { needsUpgrade?: boolean; currentTier?: string }).needsUpgrade = true;
    (err as RateLimitError & { needsUpgrade?: boolean; currentTier?: string }).currentTier = tier.id;
    throw err;
  }

  const used = await bumpMonthBucket(supabaseService, userId);
  const info: UsageInfo = {
    tier: tier.id,
    limit: tier.scansPerMonth,
    used,
    window: "month",
    remaining: Math.max(0, tier.scansPerMonth - used),
  };
  if (DEV_BYPASS) return info;
  if (used > tier.scansPerMonth) {
    throw new RateLimitError(tier.scansPerMonth, "month");
  }
  return info;
}

// ── DB helpers ──────────────────────────────────────────────────────────

// Increment (or insert) today's counter for an anonymous IP-hash.
// Returns the post-increment count. Fails open on Supabase errors so a
// database outage doesn't block scans (we just don't rate-limit briefly).
async function bumpDayBucket(
  supa: SupabaseClient,
  filter: { anon_key?: string; user_id?: string },
): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  try {
    let read = supa.from("usage_daily").select("id, scans_count").eq("day", day);
    if (filter.user_id) read = read.eq("user_id", filter.user_id);
    if (filter.anon_key) read = read.eq("anon_key", filter.anon_key);
    const { data: existing, error: readErr } = await read.maybeSingle();
    if (readErr) {
      // Fail CLOSED: a DB error shouldn't let a caller sneak past the
      // rate limit. Returning Infinity forces the calling check
      // `used >= limit` to trip. Dev bypass via RATE_LIMIT_DEV_BYPASS=1
      // remains an option for anyone running against a broken/local DB.
      console.error("[rate-limit] day-read failed, DENYING request:", readErr.message);
      return Number.MAX_SAFE_INTEGER;
    }
    if (existing?.id) {
      const next = (existing.scans_count ?? 0) + 1;
      const { error } = await supa.from("usage_daily").update({ scans_count: next }).eq("id", existing.id);
      if (error) {
        console.error("[rate-limit] day-update failed, DENYING request:", error.message);
        return Number.MAX_SAFE_INTEGER;
      }
      return next;
    }
    const { error } = await supa.from("usage_daily").insert({ ...filter, day, scans_count: 1 });
    if (error) {
      console.error("[rate-limit] day-insert failed, DENYING request:", error.message);
      return Number.MAX_SAFE_INTEGER;
    }
    return 1;
  } catch (e) {
    console.error(
      "[rate-limit] day bucket exception, DENYING request:",
      e instanceof Error ? e.message : e,
    );
    return Number.MAX_SAFE_INTEGER;
  }
}

// Increment the CURRENT MONTH's counter for a signed-in user. We store one
// row per user per calendar month using day=YYYY-MM-01 as the anchor.
// This lets us reuse the existing usage_daily table without a schema change.
async function bumpMonthBucket(supa: SupabaseClient, userId: string): Promise<number> {
  const now = new Date();
  const monthAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  try {
    const { data: existing, error: readErr } = await supa
      .from("usage_daily")
      .select("id, scans_count")
      .eq("user_id", userId)
      .eq("day", monthAnchor)
      .maybeSingle();
    if (readErr) {
      console.error("[rate-limit] month-read failed, DENYING request:", readErr.message);
      return Number.MAX_SAFE_INTEGER;
    }
    if (existing?.id) {
      const next = (existing.scans_count ?? 0) + 1;
      const { error } = await supa.from("usage_daily").update({ scans_count: next }).eq("id", existing.id);
      if (error) {
        console.error("[rate-limit] month-update failed, DENYING request:", error.message);
        return Number.MAX_SAFE_INTEGER;
      }
      return next;
    }
    const { error } = await supa
      .from("usage_daily")
      .insert({ user_id: userId, day: monthAnchor, scans_count: 1 });
    if (error) {
      console.error("[rate-limit] month-insert failed, DENYING request:", error.message);
      return Number.MAX_SAFE_INTEGER;
    }
    return 1;
  } catch (e) {
    console.error(
      "[rate-limit] month bucket exception, DENYING request:",
      e instanceof Error ? e.message : e,
    );
    return Number.MAX_SAFE_INTEGER;
  }
}

// Convenience type-guard consumers can use to check whether a caught
// RateLimitError carries the auth-required hint.
export function isAuthRequiredError(e: unknown): e is RateLimitError & { requiresAuth: true } {
  return e instanceof RateLimitError && (e as { requiresAuth?: boolean }).requiresAuth === true;
}

export function isUpgradeRequiredError(
  e: unknown,
): e is RateLimitError & { needsUpgrade: true; currentTier: string } {
  return e instanceof RateLimitError && (e as { needsUpgrade?: boolean }).needsUpgrade === true;
}

// Read-only: fetch current usage without incrementing (for account dashboard).
export async function readUsage(
  supa: SupabaseClient,
  userId: string,
  tier: ConsumerTier,
): Promise<UsageInfo> {
  const now = new Date();
  const monthAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  try {
    const { data } = await supa
      .from("usage_daily")
      .select("scans_count")
      .eq("user_id", userId)
      .eq("day", monthAnchor)
      .maybeSingle();
    const used = data?.scans_count ?? 0;
    return {
      tier: tier.id,
      limit: tier.scansPerMonth,
      used,
      window: "month",
      remaining: Math.max(0, tier.scansPerMonth - used),
    };
  } catch {
    return { tier: tier.id, limit: tier.scansPerMonth, used: 0, window: "month", remaining: tier.scansPerMonth };
  }
}
