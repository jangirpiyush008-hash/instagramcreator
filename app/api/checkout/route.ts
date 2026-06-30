import { NextResponse } from "next/server";
import { CheckoutRequestSchema } from "@/core/validation";
import { providerForRegion } from "@/core/payments/router";
import { regionFromHeaders } from "@/core/utils/region";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { PaymentError } from "@/core/utils/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in to continue" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CheckoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const region = regionFromHeaders(req.headers);
  const provider = providerForRegion(region);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  try {
    const session = await provider.createCheckout({
      userId: user.id,
      plan: parsed.data.plan,
      scanKey: parsed.data.scanKey,
      region,
      successUrl: `${siteUrl}/account?status=success`,
      cancelUrl: `${siteUrl}/account?status=canceled`,
    });
    return NextResponse.json({ ok: true, url: session.url, reference: session.reference });
  } catch (e) {
    if (e instanceof PaymentError) {
      return NextResponse.json(
        { ok: false, error: e.message, code: "payment" },
        { status: 502 },
      );
    }
    console.error("[api/checkout] error", e);
    return NextResponse.json(
      { ok: false, error: "Checkout failed" },
      { status: 500 },
    );
  }
}
