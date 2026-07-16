import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseService } from "@/core/database/supabase";
import { getServiceById, computePrice } from "@/core/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fallback wallet — real one comes from SERVICES_USDT_WALLET_BEP20 env var
// so it can be rotated without a code deploy. Hardcoded value here is
// the same one Piyush provided; kept as fallback so the endpoint doesn't
// break the day someone forgets to set the env var.
const DEFAULT_WALLET = "0x0ae6a9e19a702546e36b5267749b0f278fd289c1";

// Sanity limits so a malicious client can't submit a 500MB cart.
const MAX_ITEMS = 20;
// Minimum order — deliberately low to allow real-crypto testing.
// Set via SERVICES_MIN_ORDER_USD env if you want to raise it later
// (e.g. to make sub-cent orders uneconomic once fulfilment automates).
const MIN_ORDER_USD = Number(process.env.SERVICES_MIN_ORDER_USD ?? "0.10");
const MAX_ORDER_USD = Number(process.env.SERVICES_MAX_ORDER_USD ?? "5000");

interface IncomingItem {
  serviceId: string;
  qty: number;
  targetUrl: string;
}

interface IncomingBody {
  email?: string;
  items?: IncomingItem[];
  notes?: string;
}

function shortRef(): string {
  // DC-<8 hex chars> — short enough to type in support conversations,
  // random enough to not collide within a lifetime of orders.
  return "DC-" + randomBytes(4).toString("hex").toUpperCase();
}

function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Accept any http/https URL or an @handle. Length + charset check —
// full URL parsing on user input is a rabbit hole, this is enough
// gatekeeping without rejecting legitimate variants.
function validTargetUrl(v: string): boolean {
  const t = v.trim();
  if (t.length < 3 || t.length > 500) return false;
  if (t.startsWith("@")) return /^@[A-Za-z0-9._-]{1,64}$/.test(t);
  return /^https?:\/\//i.test(t);
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const body = raw as IncomingBody;

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !validEmail(email)) {
    return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ ok: false, error: "Cart is empty" }, { status: 400 });
  }
  if (body.items.length > MAX_ITEMS) {
    return NextResponse.json({ ok: false, error: `Too many items (max ${MAX_ITEMS})` }, { status: 400 });
  }

  // Re-price the order server-side. The client-side prices are display
  // only — we NEVER trust them. If the client's cart has been tampered
  // with (e.g. edited retail rates in JS), our server-computed total
  // is what we ask them to pay.
  let totalUsd = 0;
  const priced: {
    serviceId: string;
    name: string;
    qty: number;
    targetUrl: string;
    priceUsd: number;
  }[] = [];

  for (const item of body.items) {
    const svc = getServiceById(item.serviceId);
    if (!svc || !svc.isActive) {
      return NextResponse.json(
        { ok: false, error: `Unknown or inactive service: ${item.serviceId}` },
        { status: 400 },
      );
    }
    const qty = Math.floor(Number(item.qty));
    if (!Number.isFinite(qty) || qty < svc.qty.min || qty > svc.qty.max) {
      return NextResponse.json(
        { ok: false, error: `Invalid quantity for ${svc.name}. Must be ${svc.qty.min}-${svc.qty.max}` },
        { status: 400 },
      );
    }
    const targetUrl = (item.targetUrl ?? "").trim();
    if (!validTargetUrl(targetUrl)) {
      return NextResponse.json(
        { ok: false, error: `Invalid target URL/handle for ${svc.name}` },
        { status: 400 },
      );
    }
    const priceUsd = computePrice(svc, qty);
    totalUsd += priceUsd;
    priced.push({ serviceId: svc.id, name: svc.name, qty, targetUrl, priceUsd });
  }

  totalUsd = Math.round(totalUsd * 100) / 100;
  if (totalUsd < MIN_ORDER_USD) {
    return NextResponse.json(
      { ok: false, error: `Minimum order is $${MIN_ORDER_USD.toFixed(2)}` },
      { status: 400 },
    );
  }
  if (totalUsd > MAX_ORDER_USD) {
    return NextResponse.json(
      { ok: false, error: `Orders over $${MAX_ORDER_USD} need manual review — email support.` },
      { status: 400 },
    );
  }

  // USDT ≈ USD for pricing purposes; assume 1:1 until we support other
  // stablecoins with different pegs. We ask them to pay exactly the USD
  // amount in USDT.
  const totalUsdt = totalUsd;

  const walletAddress = process.env.SERVICES_USDT_WALLET_BEP20 ?? DEFAULT_WALLET;
  const orderRef = shortRef();

  // Wrap the DB call so we return an ACTIONABLE error to the client and
  // log it too. The generic "Could not create order" was hiding the
  // real cause (usually: migration 0008 hasn't been applied yet →
  // Postgres 42P01 "relation service_orders does not exist").
  let supa;
  try {
    supa = supabaseService();
  } catch (e) {
    console.error("[services/order] supabase env misconfigured:", e);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Server misconfigured — Supabase env vars missing on the deploy. Contact support.",
      },
      { status: 500 },
    );
  }

  const { error } = await supa.from("service_orders").insert({
    order_ref: orderRef,
    email,
    items: priced,
    notes: body.notes ?? null,
    total_usd: totalUsd,
    total_usdt: totalUsdt,
    status: "awaiting_payment",
    wallet_address: walletAddress,
    network: "bep20",
    token: "USDT",
  });
  if (error) {
    console.error(
      "[services/order] insert failed:",
      error.code,
      error.message,
      error.details,
    );
    // Postgres 42P01 = "undefined_table" → the migration hasn't run.
    // Surface a very specific message so the operator can act instantly.
    if (error.code === "42P01") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Orders table isn't set up yet — the operator needs to run migration 0008_service_orders.sql on Supabase. Try again in a few minutes.",
        },
        { status: 500 },
      );
    }
    // Everything else: pass the DB message through. It's our own DB —
    // nothing sensitive exposed, and it makes production debugging
    // one-shot instead of a Railway-logs round trip.
    return NextResponse.json(
      { ok: false, error: `Order create failed: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    orderRef,
    walletAddress,
    network: "bep20",
    token: "USDT",
    amountUsdt: totalUsdt,
    totalUsd,
    items: priced,
  });
}
