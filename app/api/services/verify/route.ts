import { NextResponse } from "next/server";
import { supabaseService } from "@/core/database/supabase";
import { verifyUsdtPayment } from "@/core/services/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/services/verify
// Body: { orderRef, txHash }
//
// Response shapes:
//   { ok: true, status: 'paid', ... }      — verified, order marked paid
//   { ok: false, status: 'failed', ... }   — verification failed with reason
//   { ok: false, error: '...' }            — pre-verification error (bad ref, already paid, etc.)

interface Body {
  orderRef?: string;
  txHash?: string;
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const body = raw as Body;
  const orderRef = (body.orderRef ?? "").trim().toUpperCase();
  const txHash = (body.txHash ?? "").trim().toLowerCase();

  if (!/^DC-[A-F0-9]{8}$/.test(orderRef)) {
    return NextResponse.json({ ok: false, error: "Invalid order reference" }, { status: 400 });
  }
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return NextResponse.json(
      { ok: false, error: "Transaction hash should be 66 chars starting with 0x" },
      { status: 400 },
    );
  }

  const supa = supabaseService();

  // Load order.
  const { data: order, error: readErr } = await supa
    .from("service_orders")
    .select(
      "id, order_ref, status, wallet_address, total_usdt, created_at, tx_hash, network",
    )
    .eq("order_ref", orderRef)
    .maybeSingle();

  if (readErr) {
    console.error("[services/verify] read failed:", readErr.message);
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
  }
  if (order.status === "paid" || order.status === "fulfilling" || order.status === "delivered") {
    return NextResponse.json({
      ok: true,
      status: order.status,
      message: "Order already verified.",
    });
  }
  if (order.status === "refunded" || order.status === "failed") {
    return NextResponse.json(
      { ok: false, error: `Order is ${order.status} — contact support.` },
      { status: 400 },
    );
  }

  // Prevent replay of a tx hash across orders (index enforces this at
  // DB level too, but a friendly error is better than a unique-violation).
  if (order.tx_hash && order.tx_hash.toLowerCase() !== txHash) {
    return NextResponse.json(
      { ok: false, error: "A different tx hash was already submitted for this order." },
      { status: 400 },
    );
  }
  const { data: dup } = await supa
    .from("service_orders")
    .select("order_ref")
    .ilike("tx_hash", txHash)
    .neq("order_ref", orderRef)
    .maybeSingle();
  if (dup) {
    return NextResponse.json(
      { ok: false, error: "This transaction is already linked to another order." },
      { status: 400 },
    );
  }

  // Flip to verifying while we call BscScan. If BscScan is slow we
  // still return within the timeout — the status stays "verifying"
  // and the client can retry.
  await supa
    .from("service_orders")
    .update({ status: "verifying", tx_hash: txHash })
    .eq("id", order.id);

  const orderCreatedSec = Math.floor(new Date(order.created_at).getTime() / 1000);

  const verdict = await verifyUsdtPayment({
    txHash,
    expectedRecipient: order.wallet_address,
    expectedAmountUsdt: Number(order.total_usdt),
    // 30-min grace period backward for clock skew + manual pre-payment
    // before checkout. The verify function itself allows another 24h
    // grace on top for slow-confirming txs.
    minTimestampSec: orderCreatedSec - 30 * 60,
  });

  if (!verdict.ok) {
    await supa
      .from("service_orders")
      .update({
        status: "awaiting_payment",           // let them try a different hash
        tx_verification_error: verdict.reason ?? "unknown",
      })
      .eq("id", order.id);
    return NextResponse.json({
      ok: false,
      status: "failed",
      error: verdict.reason ?? "Verification failed.",
    });
  }

  // Persist which chain the tx was actually verified on. Useful for
  // support (admin can jump to the right explorer) and reporting
  // (which chain do customers actually pay on).
  const detectedNetwork = verdict.chain ?? order.network;
  await supa
    .from("service_orders")
    .update({
      status: "paid",
      tx_verified_at: new Date().toISOString(),
      amount_received_usdt: verdict.amountReceivedUsdt ?? null,
      from_address: verdict.fromAddress ?? null,
      tx_verification_error: null,
      network: detectedNetwork,
    })
    .eq("id", order.id);

  // TODO(admin panel): here is where we'd fire the supplier API call
  // to actually deliver the order. For now we stop at "paid" and
  // Piyush processes each one manually until the fulfilment worker
  // ships.

  return NextResponse.json({
    ok: true,
    status: "paid",
    chain: verdict.chain,
    amountReceivedUsdt: verdict.amountReceivedUsdt,
    fromAddress: verdict.fromAddress,
    explorerUrl: verdict.explorerUrl,
  });
}
