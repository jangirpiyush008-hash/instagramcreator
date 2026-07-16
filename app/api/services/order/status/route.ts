import { NextResponse } from "next/server";
import { supabaseService } from "@/core/database/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public status polling. The client checkout page hits this every
// few seconds while the order is in verifying/pending_manual so it
// can flip to the success view the moment admin marks the order paid.
//
// Auth: order_ref is the shared secret (DC-<8 hex>, 4B entropy = safe
// from guessing at this scale). We deliberately DON'T require email
// on the read side so a user who lost their session can still resume.

const REF_RE = /^DC-[A-F0-9]{8}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = (url.searchParams.get("ref") ?? "").trim().toUpperCase();
  if (!REF_RE.test(ref)) {
    return NextResponse.json({ ok: false, error: "Invalid order reference" }, { status: 400 });
  }

  const supa = supabaseService();
  const { data, error } = await supa
    .from("service_orders")
    .select(
      "order_ref, email, status, total_usd, total_usdt, amount_received_usdt, tx_hash, tx_verified_at, tx_verification_error, wallet_address, network",
    )
    .eq("order_ref", ref)
    .maybeSingle();

  if (error) {
    console.error("[services/order/status] read failed:", error.message);
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
  }

  // We deliberately expose the email as an initial (e.g. "j••••@gmail.com")
  // so the checkout resume screen can confirm the user has the right
  // order without leaking the address if the ref is shared.
  const email = data.email ?? "";
  const maskedEmail = email
    ? email.replace(/^(.).*(@.*)$/, (_m: string, a: string, b: string) => `${a}••••${b}`)
    : "";

  return NextResponse.json({
    ok: true,
    orderRef: data.order_ref,
    status: data.status,
    maskedEmail,
    amountUsdt: Number(data.total_usdt),
    totalUsd: Number(data.total_usd),
    amountReceivedUsdt: data.amount_received_usdt != null ? Number(data.amount_received_usdt) : null,
    walletAddress: data.wallet_address,
    network: data.network,
    hasTxHash: !!data.tx_hash,
    verifiedAt: data.tx_verified_at,
    lastError: data.tx_verification_error,
  });
}
