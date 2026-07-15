import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSUMER_TIERS, tierById, type ConsumerTier } from "./tiers";

// Look up which consumer tier the user is on right now.
// Anonymous users → free (they'll hit the anon 5-per-day cap before the
// free-plan monthly cap). Signed-in without active sub → free tier.
// Active sub → the plan string in the subscriptions row (starter/pro/scale).
export async function getUserTier(
  supabaseService: SupabaseClient,
  userId: string | null,
): Promise<ConsumerTier> {
  if (!userId) return CONSUMER_TIERS.free!;
  try {
    const { data } = await supabaseService
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString())
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    return tierById(data?.plan);
  } catch (e) {
    console.warn("[entitlements] tier lookup failed, defaulting to free:", e instanceof Error ? e.message : e);
    return CONSUMER_TIERS.free!;
  }
}

// True if user has an active subscription whose current_period_end is in the future,
// OR a one-time unlock matching this scanKey.
export async function isEntitled(
  supabaseService: SupabaseClient,
  userId: string | null,
  scanKey: string,
): Promise<boolean> {
  if (!userId) return false;
  const now = new Date().toISOString();

  try {
    const [{ data: subs }, { data: unlocks }] = await Promise.all([
      supabaseService
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .gt("current_period_end", now)
        .limit(1),
      supabaseService
        .from("unlocks")
        .select("id")
        .eq("user_id", userId)
        .eq("scan_key", scanKey)
        .limit(1),
    ]);
    return (subs && subs.length > 0) || (unlocks && unlocks.length > 0) || false;
  } catch (e) {
    console.warn("[entitlements] supabase lookup failed, defaulting to not-entitled:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function hasActiveSubscription(
  supabaseService: SupabaseClient,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabaseService
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .limit(1);
  return !!(data && data.length > 0);
}
