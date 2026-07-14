// API auth + credit metering middleware for /v1/* endpoints.
//
// Flow per request:
//   1. Read x-api-key header
//   2. Hash + look up in api_keys, reject if missing / revoked / no credits
//   3. Attach the customer context to the caller
//   4. After the request succeeds, atomically deduct credits via
//      deduct_credits(p_key_id, p_amount) — the pg function guarantees no
//      race between two concurrent calls both proceeding on the last credit
//   5. Log to api_usage
//
// If the tool call itself fails (upstream 429, 404, etc.) we DO NOT charge
// — a failed scan wouldn't cost the customer anyway.

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashApiKey } from "./keys";
import { supabaseService } from "@/core/database/supabase";

export interface ApiCustomer {
  keyId: string;
  userId: string;
  tier: string;
  creditsRemaining: number;
}

export type AuthFailure = { error: string; status: number; code: string };

export async function authenticateApiKey(request: Request): Promise<ApiCustomer | AuthFailure> {
  const raw = request.headers.get("x-api-key")?.trim();
  if (!raw) {
    return {
      error: "Missing x-api-key header. Get one at https://decodecreator.com/account.",
      status: 401,
      code: "no_api_key",
    };
  }

  const supa = supabaseService();
  const { data, error } = await supa
    .from("api_keys")
    .select("id, user_id, tier, credits_remaining, revoked_at")
    .eq("key_hash", hashApiKey(raw))
    .maybeSingle();

  if (error) {
    console.error("[api-auth] db lookup failed:", error.message);
    return { error: "Auth lookup failed. Try again.", status: 500, code: "auth_lookup_failed" };
  }
  if (!data) {
    return { error: "Invalid API key.", status: 401, code: "invalid_api_key" };
  }
  if (data.revoked_at) {
    return { error: "This API key has been revoked.", status: 401, code: "revoked_api_key" };
  }
  if (data.credits_remaining <= 0) {
    return {
      error: "Monthly credit allowance exhausted. Upgrade your plan or wait for the next cycle.",
      status: 402,
      code: "credits_exhausted",
    };
  }

  return {
    keyId: data.id,
    userId: data.user_id,
    tier: data.tier,
    creditsRemaining: data.credits_remaining,
  };
}

// Atomic deduction using the deduct_credits pg function. Returns the new
// balance, or null if the deduction would have gone negative (which means
// a concurrent call snuck in and consumed the last of the credits).
export async function chargeCredits(
  customer: ApiCustomer,
  amount: number,
): Promise<number | null> {
  if (amount <= 0) return customer.creditsRemaining;
  const supa = supabaseService();
  const { data, error } = await supa.rpc("deduct_credits", {
    p_key_id: customer.keyId,
    p_amount: amount,
  });
  if (error) {
    console.warn("[api-auth] deduct_credits failed:", error.message);
    return customer.creditsRemaining; // best effort — don't block the request
  }
  return typeof data === "number" ? data : null;
}

// Fire-and-forget usage log. Failure to log doesn't break the request —
// worst case is one row missing from the usage chart.
export function logApiUsage(
  supa: SupabaseClient,
  entry: {
    keyId: string;
    userId: string;
    endpoint: string;
    platform?: string;
    handle?: string;
    creditsCharged: number;
    responseCode: number;
    durationMs?: number;
  },
): void {
  void supa
    .from("api_usage")
    .insert({
      key_id: entry.keyId,
      user_id: entry.userId,
      endpoint: entry.endpoint,
      platform: entry.platform ?? null,
      handle: entry.handle ?? null,
      credits_charged: entry.creditsCharged,
      response_code: entry.responseCode,
      duration_ms: entry.durationMs ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("[api-auth] usage log failed:", error.message);
    });
}
