import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "../constants";
import { RateLimitError } from "../utils/errors";
import { hasActiveSubscription } from "./entitlements";

interface CheckArgs {
  supabaseService: SupabaseClient;
  userId: string | null;
  anonKey: string | null; // ip hash for anonymous users
}

// Bumps usage_daily ONLY on a real scan (cache miss). Throws RateLimitError if over.
export async function checkAndIncrementUsage(args: CheckArgs): Promise<void> {
  const { supabaseService, userId, anonKey } = args;
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  let limit: number;
  if (userId) {
    limit = (await hasActiveSubscription(supabaseService, userId))
      ? PLAN_LIMITS.subscriber
      : PLAN_LIMITS.free;
  } else {
    limit = PLAN_LIMITS.anon;
  }

  const filter = userId
    ? { user_id: userId, day }
    : { anon_key: anonKey ?? "0.0.0.0", day };

  // read current count — fail open if Supabase is unreachable (dev / preview mode)
  try {
    let query = supabaseService.from("usage_daily").select("id, scans_count").eq("day", day);
    query = userId ? query.eq("user_id", userId) : query.eq("anon_key", anonKey ?? "0.0.0.0");
    const { data: existing, error: readErr } = await query.maybeSingle();
    if (readErr) {
      console.warn("[rate-limit] supabase read failed, skipping:", readErr.message);
      return;
    }

    const current = existing?.scans_count ?? 0;
    if (current >= limit) {
      throw new RateLimitError(limit, "day");
    }

    if (existing?.id) {
      const { error } = await supabaseService
        .from("usage_daily")
        .update({ scans_count: current + 1 })
        .eq("id", existing.id);
      if (error) console.warn("[rate-limit] update failed, ignoring:", error.message);
    } else {
      const { error } = await supabaseService.from("usage_daily").insert({
        ...filter,
        scans_count: 1,
      });
      if (error) console.warn("[rate-limit] insert failed, ignoring:", error.message);
    }
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    console.warn("[rate-limit] network failure, allowing request:", e instanceof Error ? e.message : e);
  }
}
