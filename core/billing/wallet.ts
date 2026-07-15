// Wallet operations for the developer API pay-as-you-go flow.
// All writes go through the service-role Supabase client — never expose
// direct wallet mutation to the browser.

import type { SupabaseClient } from "@supabase/supabase-js";
import { WALLET_CREDIT_VALIDITY_MONTHS } from "./tiers";

export interface WalletBalance {
  credits: number;         // total non-expired credits
  lots: WalletLot[];       // for the "expiring soon" indicator on the dashboard
}

export interface WalletLot {
  id: string;
  source: string;
  creditsGranted: number;
  creditsRemaining: number;
  expiresAt: string;       // ISO
  createdAt: string;
}

// Read the caller's live wallet balance + the underlying lots. RLS
// scopes SELECT to auth.uid = user_id, so the anon key works too — but
// we take supabaseService because callers already have it handy.
export async function getWalletBalance(
  supa: SupabaseClient,
  userId: string,
): Promise<WalletBalance> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supa
    .from("wallet_credits")
    .select("id, source, credits_granted, credits_remaining, expires_at, created_at")
    .eq("user_id", userId)
    .gt("expires_at", nowIso)
    .gt("credits_remaining", 0)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[wallet] balance read failed:", error.message);
    return { credits: 0, lots: [] };
  }
  const lots: WalletLot[] = (data ?? []).map((r) => ({
    id: r.id,
    source: r.source,
    creditsGranted: r.credits_granted,
    creditsRemaining: r.credits_remaining,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
  const credits = lots.reduce((s, l) => s + l.creditsRemaining, 0);
  return { credits, lots };
}

// Add a new credit lot. Called from the Razorpay webhook after
// payment.captured for a wallet top-up, or programmatically for promo /
// refund grants. `validityMonths` overrides the default 12.
export async function creditWallet(
  supa: SupabaseClient,
  args: {
    userId: string;
    credits: number;
    source: string;           // e.g. "topup:topup-50" | "promo:signup" | "refund:CS-123"
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    razorpayLinkId?: string;
    amountMinor?: number;
    currency?: string;
    validityMonths?: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const months = args.validityMonths ?? WALLET_CREDIT_VALIDITY_MONTHS;
  const expiresAt = new Date();
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + months);
  const { data, error } = await supa
    .from("wallet_credits")
    .insert({
      user_id: args.userId,
      source: args.source,
      credits_granted: args.credits,
      credits_remaining: args.credits,
      razorpay_payment_id: args.razorpayPaymentId ?? null,
      razorpay_order_id: args.razorpayOrderId ?? null,
      razorpay_link_id: args.razorpayLinkId ?? null,
      amount_minor: args.amountMinor ?? null,
      currency: args.currency ?? "INR",
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[wallet] credit insert failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}

// Deduct credits atomically via the pg function. Returns how many
// credits were actually deducted — normally equals `amount`, or less if
// the wallet was short (caller should treat shortfall as insufficient
// balance and roll back whatever action needed the credits).
export async function deductFromWallet(
  supa: SupabaseClient,
  userId: string,
  amount: number,
): Promise<number> {
  if (amount <= 0) return 0;
  const { data, error } = await supa.rpc("deduct_wallet_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.warn("[wallet] deduct failed:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
