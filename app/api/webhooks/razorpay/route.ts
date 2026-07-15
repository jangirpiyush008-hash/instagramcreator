import { NextResponse } from "next/server";
import { RazorpayProvider } from "@/core/payments/razorpay";
import { supabaseService } from "@/core/database/supabase";
import { PRICING } from "@/core/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (event.type === "payment.success" && event.plan === "one_time") {
    const data = event.data as { paymentId?: string; amount?: number };
    await supa.from("unlocks").insert({
      user_id: event.userId,
      scan_key: event.scanKey ?? "",
      provider: "razorpay",
      provider_payment_id: data.paymentId ?? null,
      amount_minor: data.amount ?? PRICING.IN.oneTime,
      currency: "INR",
    });
  } else if (event.type === "subscription.active") {
    const data = event.data as { subId?: string; current_period_end?: string | null };
    // Store the plan string as-is when it's a known consumer tier so
    // getUserTier() can map straight back without a translation layer.
    // Legacy 'annual' stays 'annual'; everything else defaults to 'starter'
    // (the lowest paid tier) so an unexpected string never grants Pro/Scale.
    const knownTiers = new Set(["starter", "pro", "scale", "annual"]);
    const plan = event.plan && knownTiers.has(event.plan) ? event.plan : "starter";
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
  } else if (event.type === "subscription.canceled") {
    const data = event.data as { subId?: string };
    if (data.subId) {
      await supa
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("provider_sub_id", data.subId);
    }
  }

  return NextResponse.json({ ok: true });
}
