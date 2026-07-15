import { NextResponse } from "next/server";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { CREDIT_PACK_BY_ID } from "@/core/billing/tiers";
import { createRazorpayPaymentLink } from "@/core/payments/razorpay";
import { PaymentError } from "@/core/utils/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/wallet/topup?pack=topup-50
//
// Creates a Razorpay Payment Link for the given pack and 302 REDIRECTS
// the user to the hosted checkout URL. We use GET+redirect so a plain
// <a href=…> from the pricing page or dashboard works without JS. The
// pack ID lives in the URL (public info — the pack catalog is public
// on /pricing) and the amount is looked up server-side so the client
// can't spoof the amount.

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    // Bounce through auth modal, preserving intent so post-signup we
    // land back here and try again.
    const url = new URL(req.url);
    const packId = url.searchParams.get("pack") ?? "";
    const next = `/api/wallet/topup?pack=${encodeURIComponent(packId)}`;
    return NextResponse.redirect(
      new URL(`/?auth=signup&next=${encodeURIComponent(next)}`, url),
    );
  }

  const url = new URL(req.url);
  const packId = url.searchParams.get("pack") ?? "";
  const pack = CREDIT_PACK_BY_ID[packId];
  if (!pack) {
    return NextResponse.json(
      { ok: false, error: "Unknown pack id", code: "bad_pack" },
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
      amountMinor: pack.amountInrPaise,
      currency: "INR",
      description: `DecodeCreator wallet top-up: ${pack.credits.toLocaleString()} credits (${pack.amountInrDisplay})`,
      packId: pack.id,
      customerEmail: profile?.email ?? user.email ?? undefined,
      customerName: profile?.full_name ?? undefined,
      callbackUrl,
    });
    void linkId; // stored on the wallet_credits row via webhook, not needed here
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
