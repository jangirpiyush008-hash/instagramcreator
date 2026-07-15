import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { supabaseService } from "@/core/database/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/refund
// Body: { payment_id, amount_paise?, notes? }
//
// Initiates a REAL Razorpay refund via their POST /v1/payments/:id/refund
// endpoint. Amount in paise (1 INR = 100 paise); omit for a full refund.
//
// Also logs the refund attempt as an admin_refunds row so we have a
// paper trail — Razorpay's dashboard also shows it, but our own record
// is faster to query.
//
// Auth: basic auth using RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET env
// vars (same creds the payment code already uses).

interface Body {
  payment_id?: string;
  amount_paise?: number;
  notes?: string;
}

interface RzpRefundResponse {
  id?: string;
  entity?: string;
  amount?: number;
  currency?: string;
  payment_id?: string;
  status?: string;
  error?: { description?: string; code?: string };
}

export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "Admin auth required" }, { status: 401 });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return NextResponse.json(
      { ok: false, error: "Razorpay credentials not configured in Railway env" },
      { status: 500 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { payment_id, amount_paise, notes } = raw as Body;
  if (!payment_id || typeof payment_id !== "string" || !/^pay_[A-Za-z0-9]{8,}$/.test(payment_id)) {
    return NextResponse.json(
      { ok: false, error: 'Payment ID must look like "pay_XXXXXXXX"' },
      { status: 400 },
    );
  }
  if (amount_paise != null && (!Number.isFinite(amount_paise) || amount_paise <= 0)) {
    return NextResponse.json(
      { ok: false, error: "amount_paise must be a positive number (or omit for full refund)" },
      { status: 400 },
    );
  }

  const body: Record<string, unknown> = {};
  if (amount_paise) body.amount = Math.floor(amount_paise);
  if (notes) body.notes = { admin_note: notes.slice(0, 200) };

  const url = `https://api.razorpay.com/v1/payments/${encodeURIComponent(payment_id)}/refund`;
  const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  let rzpResp: RzpRefundResponse;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    rzpResp = (await res.json()) as RzpRefundResponse;
    if (!res.ok || rzpResp.error) {
      const msg = rzpResp.error?.description ?? `Razorpay ${res.status}`;
      // Log attempt with the failure so it's auditable.
      await logRefund({ paymentId: payment_id, status: "failed", error: msg, amountPaise: amount_paise, notes });
      return NextResponse.json(
        { ok: false, error: msg, code: rzpResp.error?.code ?? String(res.status) },
        { status: 400 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Network error" },
      { status: 502 },
    );
  }

  await logRefund({
    paymentId: payment_id,
    refundId: rzpResp.id,
    status: rzpResp.status ?? "processed",
    amountPaise: rzpResp.amount ?? amount_paise,
    notes,
  });

  return NextResponse.json({
    ok: true,
    refund_id: rzpResp.id,
    payment_id: rzpResp.payment_id,
    amount: rzpResp.amount,
    currency: rzpResp.currency,
    status: rzpResp.status,
  });
}

// Fire-and-forget log to admin_refunds. Table may not exist yet on
// early deploys — swallow the "relation does not exist" error so the
// refund itself still succeeds. Create-if-missing SQL is documented
// in the admin panel help text; a proper migration follows next.
async function logRefund(entry: {
  paymentId: string;
  refundId?: string;
  status: string;
  error?: string;
  amountPaise?: number;
  notes?: string;
}): Promise<void> {
  try {
    const supa = supabaseService();
    await supa.from("admin_refunds").insert({
      razorpay_payment_id: entry.paymentId,
      razorpay_refund_id: entry.refundId ?? null,
      status: entry.status,
      error: entry.error ?? null,
      amount_paise: entry.amountPaise ?? null,
      notes: entry.notes ?? null,
    });
  } catch (e) {
    console.warn("[admin/refund] log write failed (table may not exist yet):", e);
  }
}
