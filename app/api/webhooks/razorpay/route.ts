import { NextResponse } from "next/server";
import { RazorpayProvider } from "@/core/payments/razorpay";
import { supabaseService } from "@/core/database/supabase";
import { PRICING } from "@/core/constants";
import { creditWallet } from "@/core/billing/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Razorpay webhook. Verifies signature, then routes:
//   • payment.success + plan='one_time'       → unlocks table (single-report unlock)
//   • payment.success + kind='wallet-topup'   → wallet_credits ledger (NEW in Phase K)
//   • subscription.active                     → subscriptions table (starter/pro/scale)
//   • subscription.canceled                   → mark subscription canceled
//
// All handlers are idempotent-safe by (provider_payment_id or provider_sub_id)
// so a duplicate delivery from Razorpay doesn't double-credit anything.

export async function POST(req: Request) {
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  const raw = await req.text();
  const provider = new RazorpayProvider();

  let event;
  try {
    event = await provider.verifyWebhook(raw, sig);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "bad signature" },
      { status: 400 },
    );
  }

  if (!event.userId) {
    // ignore events we can't attribute (no userId in notes)
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supa = supabaseService();

  if (event.type === "payment.success") {
    const data = event.data as {
      paymentId?: string;
      amount?: number;
      kind?: string;
      source?: string;
      credits?: number;
    };

    // ── Wallet top-up path ───────────────────────────────────────────
    // Notes carry kind='wallet-topup' + source + credits. The server
    // that CREATED the Payment Link computed `credits` (from pack data
    // OR from creditsFromRupees for custom amounts) — the webhook
    // trusts that number and grants it. Idempotency: skip if a lot
    // already exists for this razorpay_payment_id.
    if (data.kind === "wallet-topup") {
      if (!data.credits || data.credits <= 0) {
        console.warn("[webhook] wallet-topup missing/invalid credits in notes");
        return NextResponse.json({ ok: true, ignored: "bad_credits" });
      }
      if (data.paymentId) {
        const { data: existing } = await supa
          .from("wallet_credits")
          .select("id")
          .eq("razorpay_payment_id", data.paymentId)
          .maybeSingle();
        if (existing) {
          return NextResponse.json({ ok: true, alreadyCredited: true });
        }
      }
      const result = await creditWallet(supa, {
        userId: event.userId,
        credits: data.credits,
        source: data.source ?? "topup:custom",
        razorpayPaymentId: data.paymentId,
        amountMinor: data.amount,
        currency: "INR",
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
      }
      return NextResponse.json({ ok: true, credited: data.credits });
    }

    // ── One-time unlock path (legacy per-report purchase) ────────────
    if (event.plan === "one_time") {
      await supa.from("unlocks").insert({
        user_id: event.userId,
        scan_key: event.scanKey ?? "",
        provider: "razorpay",
        provider_payment_id: data.paymentId ?? null,
        amount_minor: data.amount ?? PRICING.IN.oneTime,
        currency: "INR",
      });
      return NextResponse.json({ ok: true });
    }

    // Payment for something we don't recognise (subscription first
    // payment fires payment.captured too — handled by subscription.active
    // below). Log-and-ignore.
    return NextResponse.json({ ok: true, ignored: "no_route" });
  }

  if (event.type === "subscription.active") {
    const data = event.data as { subId?: string; current_period_end?: string | null };
    // Store the plan string as-is when it's a known consumer tier so
    // getUserTier() can map straight back without a translation layer.
    // Plans now come in as 'starter' / 'starter:annual' / etc. so we
    // strip the ':annual' suffix for the tier lookup and keep the
    // cycle info in a separate column if we ever add one.
    const knownTiers = new Set(["starter", "pro", "scale", "annual", "api-starter"]);
    const rawPlan = event.plan ?? "starter";
    const baseTier = rawPlan.split(":")[0] ?? "starter";
    const plan = knownTiers.has(baseTier) ? rawPlan : "starter";
    await supa.from("subscriptions").upsert(
      {
        user_id: event.userId,
        provider: "razorpay",
        provider_sub_id: data.subId ?? null,
        plan,
        status: "active",
        current_period_end: data.current_period_end ?? null,
      },
      { onConflict: "provider_sub_id" },
    );
    return NextResponse.json({ ok: true });
  }

  if (event.type === "subscription.canceled") {
    const data = event.data as { subId?: string };
    if (data.subId) {
      await supa
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("provider_sub_id", data.subId);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: event.type });
}
