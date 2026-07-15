import { NextResponse } from "next/server";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import {
  CREDIT_PACK_BY_ID,
  WALLET_MIN_MANUAL_INR,
  WALLET_MAX_MANUAL_INR,
  creditsFromRupees,
} from "@/core/billing/tiers";
import { createRazorpayPaymentLink } from "@/core/payments/razorpay";
import { PaymentError } from "@/core/utils/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/wallet/topup?pack=topup-50           ← fixed pack
// GET /api/wallet/topup?amount=1500             ← custom amount in rupees
//
// Creates a Razorpay Payment Link for the given amount + credit grant,
// 303-redirects the user to the hosted checkout URL. We use GET+redirect
// so a plain <a href=…> from the pricing page / dashboard works without
// any client JS. Amount and credit count are both computed server-side —
// the client can't spoof either.

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const packId = url.searchParams.get("pack");
  const amountRaw = url.searchParams.get("amount");

  // Anon → bounce through auth modal, preserving the topup URL as `next`.
  if (!user) {
    const nextParams = new URLSearchParams();
    if (packId) nextParams.set("pack", packId);
    if (amountRaw) nextParams.set("amount", amountRaw);
    const next = `/api/wallet/topup${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
    return NextResponse.redirect(
      new URL(`/?auth=signup&next=${encodeURIComponent(next)}`, url),
    );
  }

  // Determine amount + credits + source label from the query params.
  let amountInrPaise: number;
  let credits: number;
  let source: string;
  let description: string;

  if (packId) {
    const pack = CREDIT_PACK_BY_ID[packId];
    if (!pack) {
      return NextResponse.json(
        { ok: false, error: "Unknown pack id", code: "bad_pack" },
        { status: 400 },
      );
    }
    amountInrPaise = pack.amountInrPaise;
    credits = pack.credits;
    source = `topup:${pack.id}`;
    description = `DecodeCreator wallet top-up: ${pack.credits.toLocaleString()} credits (${pack.amountInrDisplay})`;
  } else if (amountRaw) {
    // Custom recharge. Parse, validate, compute credits at baseline rate.
    const rupees = Number.parseInt(amountRaw, 10);
    if (!Number.isFinite(rupees) || rupees < WALLET_MIN_MANUAL_INR) {
      return NextResponse.json(
        {
          ok: false,
          error: `Minimum custom recharge is ₹${WALLET_MIN_MANUAL_INR}.`,
          code: "amount_too_low",
        },
        { status: 400 },
      );
    }
    if (rupees > WALLET_MAX_MANUAL_INR) {
      return NextResponse.json(
        {
          ok: false,
          error: `Maximum single recharge is ₹${WALLET_MAX_MANUAL_INR.toLocaleString("en-IN")}. Buy a pack for bigger amounts (better rate too).`,
          code: "amount_too_high",
        },
        { status: 400 },
      );
    }
    amountInrPaise = rupees * 100;
    credits = creditsFromRupees(rupees);
    source = "topup:custom";
    description = `DecodeCreator wallet top-up: ${credits.toLocaleString()} credits (₹${rupees.toLocaleString("en-IN")})`;
  } else {
    return NextResponse.json(
      { ok: false, error: "Missing ?pack= or ?amount= parameter", code: "bad_request" },
      { status: 400 },
    );
  }

  // Look up display email for prefilling Razorpay's customer field.
  const supa = supabaseService();
  const { data: profile } = await supa
    .from("profiles")
    .select("email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const callbackUrl = `${siteUrl}/developer?tab=wallet&status=topup-success`;

  try {
    const { url: hostedUrl, linkId } = await createRazorpayPaymentLink({
      userId: user.id,
      amountMinor: amountInrPaise,
      credits,
      currency: "INR",
      description,
      source,
      customerEmail: profile?.email ?? user.email ?? undefined,
      customerName: profile?.full_name ?? undefined,
      callbackUrl,
    });
    void linkId;
    return NextResponse.redirect(hostedUrl, { status: 303 });
  } catch (e) {
    if (e instanceof PaymentError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: "payment" },
        { status: 502 },
      );
    }
    console.error("[wallet/topup] error", e);
    return NextResponse.json(
      { ok: false, error: "Failed to create top-up link" },
      { status: 500 },
    );
  }
}
