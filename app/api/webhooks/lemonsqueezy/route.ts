import { NextResponse } from "next/server";
import { LemonSqueezyProvider } from "@/core/payments/lemonsqueezy";
import { supabaseService } from "@/core/database/supabase";
import { PRICING } from "@/core/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("x-signature") ?? "";
  const raw = await req.text();
  const provider = new LemonSqueezyProvider();

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
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supa = supabaseService();

  if (event.type === "payment.success" && event.plan === "one_time") {
    const data = event.data as { orderId?: string };
    await supa.from("unlocks").insert({
      user_id: event.userId,
      scan_key: event.scanKey ?? "",
      provider: "lemonsqueezy",
      provider_payment_id: data.orderId ?? null,
      amount_minor: PRICING.GLOBAL.oneTime,
      currency: "USD",
    });
  } else if (event.type === "subscription.active") {
    const data = event.data as { subId?: string; current_period_end?: string | null };
    await supa.from("subscriptions").upsert(
      {
        user_id: event.userId,
        provider: "lemonsqueezy",
        provider_sub_id: data.subId ?? null,
        plan: event.plan === "annual" ? "annual" : "monthly",
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
  } else if (event.type === "subscription.past_due") {
    const data = event.data as { subId?: string };
    if (data.subId) {
      await supa
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("provider_sub_id", data.subId);
    }
  }

  return NextResponse.json({ ok: true });
}
