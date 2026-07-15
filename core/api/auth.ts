// API auth + credit metering middleware for /v1/* endpoints.
//
// Flow per request:
//   1. Read x-api-key header
//   2. Hash + look up in api_keys, reject if missing / revoked
//   3. Look up the caller's wallet balance
//   4. If subscription credits + wallet credits together aren't enough
//      for this call → reject 402 with "credits_exhausted"
//   5. Attach the customer context (both balances) to the caller
//   6. After the request succeeds, deduct SUBSCRIPTION credits first
//      (via the atomic deduct_credits pg function). If the subscription
//      couldn't cover the whole amount, debit the remainder from the
//      wallet (via deduct_wallet_credits).
//   7. Log to api_usage
//
// If the tool call itself fails (upstream 429, 404, etc.) we DO NOT charge.
// Failed scans wouldn't cost the customer anyway.

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashApiKey } from "./keys";
import { supabaseService } from "@/core/database/supabase";
import { getWalletBalance, deductFromWallet } from "@/core/billing/wallet";

export interface ApiCustomer {
  keyId: string;
  userId: string;
  tier: string;
  // Both balances — used by chargeCredits to figure out where to debit
  // from and by the caller to know how many credits are left overall.
  creditsRemaining: number;      // subscription (api_keys.credits_remaining)
  walletCredits: number;         // wallet (sum of non-expired lots)
}

export type AuthFailure = { error: string; status: number; code: string };

export async function authenticateApiKey(request: Request): Promise<ApiCustomer | AuthFailure> {
  const raw = request.headers.get("x-api-key")?.trim();
  if (!raw) {
    return {
      error: "Missing x-api-key header. Get one at https://decodecreator.com/developer.",
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

  // Wallet balance is checked in addition to subscription — the caller
  // is "out of credits" only when BOTH pools are empty.
  const wallet = await getWalletBalance(supa, data.user_id);
  const totalAvailable = Math.max(0, data.credits_remaining) + wallet.credits;
  if (totalAvailable <= 0) {
    return {
      error:
        "Credits exhausted. Top up your wallet or upgrade your plan at https://decodecreator.com/developer.",
      status: 402,
      code: "credits_exhausted",
    };
  }

  return {
    keyId: data.id,
    userId: data.user_id,
    tier: data.tier,
    creditsRemaining: data.credits_remaining,
    walletCredits: wallet.credits,
  };
}

// Deduct credits: subscription first, wallet second. Returns TOTAL
// credits remaining across both pools (or null if the deduction can't
// be completed — a race where a concurrent call drained both since
// authenticateApiKey ran).
export async function chargeCredits(
  customer: ApiCustomer,
  amount: number,
): Promise<number | null> {
  if (amount <= 0) return customer.creditsRemaining + customer.walletCredits;
  const supa = supabaseService();

  // Step 1: try subscription pool. deduct_credits returns the NEW
  // credits_remaining on the api_keys row, or null when the request
  // would have gone negative (concurrent call snuck in).
  let subRemaining = customer.creditsRemaining;
  let toWallet = amount;

  if (customer.creditsRemaining > 0) {
    const takeFromSub = Math.min(amount, customer.creditsRemaining);
    const { data, error } = await supa.rpc("deduct_credits", {
      p_key_id: customer.keyId,
      p_amount: takeFromSub,
    });
    if (error) {
      console.warn("[api-auth] deduct_credits failed:", error.message);
      return customer.creditsRemaining + customer.walletCredits;
    }
    if (typeof data !== "number") {
      // Race: the pg function returned null → insufficient sub credits.
      // Fall through to wallet with the full amount.
      toWallet = amount;
    } else {
      subRemaining = data;
      toWallet = amount - takeFromSub;
    }
  }

  // Step 2: debit any remainder from the wallet. deductFromWallet spans
  // multiple lots FIFO and returns how many credits it actually took.
  let walletDebited = 0;
  if (toWallet > 0) {
    walletDebited = await deductFromWallet(supa, customer.userId, toWallet);
    if (walletDebited < toWallet) {
      // Underrun — both pools together came up short. This shouldn't
      // happen if authenticateApiKey ran <10ms ago, but log and let the
      // caller decide (it'll show credits as low, prompting a top-up).
      console.warn(
        `[api-auth] wallet underrun: wanted ${toWallet}, got ${walletDebited} for user ${customer.userId}`,
      );
    }
  }

  const newWalletBalance = Math.max(0, customer.walletCredits - walletDebited);
  return subRemaining + newWalletBalance;
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
