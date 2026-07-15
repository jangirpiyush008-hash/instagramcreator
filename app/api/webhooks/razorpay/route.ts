import { NextResponse } from "next/server";
import { RazorpayProvider } from "@/core/payments/razorpay";
import { supabaseService } from "@/core/database/supabase";
import { PRICING } from "@/core/constants";
import { creditWallet } from "@/core/billing/wallet";
import { CREDIT_PACK_BY_ID } from "@/core/billing/tiers";

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
      packId?: string;
    };

    // ── Wallet top-up path ───────────────────────────────────────────
    // The Payment Link's notes carry kind='wallet-topup' + packId. We
    // look up the pack server-side (never trust the payload's credit
    // count) and insert a fresh wallet_credits lot. Idempotency: check
    // for an existing lot with the same razorpay_payment_id first.
    if (data.kind === "wallet-topup" && data.packId) {
      const pack = CREDIT_PACK_BY_ID[data.packId];
      if (!pack) {
        console.warn(`[webhook] wallet-topup unknown packId: ${data.packId}`);
        return NextResponse.json({ ok: true, ignored: "bad_pack" });
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
        credits: pack.credits,
        source: `topup:${pack.id}`,
        razorpayPaymentId: data.paymentId,
        amountMinor: data.amount ?? pack.amountInrPaise,
        currency: "INR",
      });
      if (!result.ok) {
        // 500 so Razorpay retries — genuinely a DB failure on our side
        return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
      }
      return NextResponse.json({ ok: true, credited: pack.credits });
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
