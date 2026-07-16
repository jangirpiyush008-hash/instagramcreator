import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseService } from "@/core/database/supabase";
import {
  getEffectiveServiceById,
  loadOverridesMap,
  freeTrialQuantityFor,
} from "@/core/services/overrides";
import { normalizeHandle } from "@/core/services/handle";
import { getClientIp, hashIp } from "@/core/utils/hash";
import { regionFromHeaders } from "@/core/utils/region";
import { SERVICES } from "@/core/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/services/trial  { serviceId, email, targetUrl, notes? }
//
// Grants ONE free trial per person, EVER, across all services and
// platforms. Person = identified by any of:
//   - IP address (hashed)
//   - Email
//   - Target handle (normalized — same handle on IG/TT/YT still counts)
//
// The DB has UNIQUE indexes on each of those three fields on
// service_trials, so we let the DB do the final anti-abuse enforcement
// even if two concurrent requests race past our pre-check.

interface Body {
  serviceId?: string;
  email?: string;
  targetUrl?: string;
  notes?: string;
}

function orderRef(): string {
  return "TR-" + randomBytes(4).toString("hex").toUpperCase();
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const body = raw as Body;

  const serviceId = (body.serviceId ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const targetUrl = (body.targetUrl ?? "").trim();

  // Basic input validation before we do any DB work.
  const svcStatic = SERVICES.find((s) => s.id === serviceId);
  if (!svcStatic) {
    return NextResponse.json({ ok: false, error: "Unknown service" }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
  }
  if (!targetUrl || targetUrl.length < 3) {
    return NextResponse.json({ ok: false, error: "Enter a valid target URL / handle" }, { status: 400 });
  }
  const handleNorm = normalizeHandle(targetUrl);
  if (!handleNorm) {
    return NextResponse.json(
      { ok: false, error: "Couldn't extract a handle from that URL. Include the profile / video / post URL." },
      { status: 400 },
    );
  }

  const supa = supabaseService();

  // Resolve effective service (with any admin override applied).
  const svc = await getEffectiveServiceById(supa, serviceId);
  if (!svc || !svc.isActive) {
    return NextResponse.json({ ok: false, error: "Service is not currently active" }, { status: 400 });
  }

  // Determine the trial quantity (admin can override per service via
  // the free_trial_quantity column; falls back to 50).
  const overridesMap = await loadOverridesMap(supa);
  const trialQty = freeTrialQuantityFor(svc, overridesMap.get(serviceId));
  if (trialQty <= 0) {
    return NextResponse.json({ ok: false, error: "Trials disabled for this service" }, { status: 400 });
  }

  // Hash the caller's IP for the abuse-key lookup + storage.
  const rawIp = getClientIp(req.headers);
  const ipHash = await hashIp(rawIp);
  const region = regionFromHeaders(req.headers);

  // Anti-abuse pre-check: does ANY of {ip, email, handle} already
  // have a trial row? If yes, block with a specific reason so support
  // can help legit edge cases (multiple people sharing office IP,
  // etc.) without exposing that we saw a match on a specific field.
  const [ipHit, emailHit, handleHit] = await Promise.all([
    supa.from("service_trials").select("id").eq("ip_hash", ipHash).limit(1).maybeSingle(),
    supa.from("service_trials").select("id").eq("email", email).limit(1).maybeSingle(),
    supa
      .from("service_trials")
      .select("id")
      .eq("target_handle_normalized", handleNorm)
      .limit(1)
      .maybeSingle(),
  ]);
  if (ipHit.data || emailHit.data || handleHit.data) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A free trial has already been claimed for this person. Only one free trial per person, ever. Need more? Any paid quantity from $0.10 gets you started.",
      },
      { status: 400 },
    );
  }

  // Create the order (status='paid', total=0) so this trial flows
  // through the same fulfilment pipeline as a paid order. Admin sees
  // it in Growth orders with TR- prefix so they can distinguish
  // trial orders at a glance.
  const ref = orderRef();
  const priceUsd = 0; // trial
  const { data: order, error: orderErr } = await supa
    .from("service_orders")
    .insert({
      order_ref: ref,
      email,
      items: [
        {
          serviceId: svc.id,
          name: svc.name,
          qty: trialQty,
          targetUrl,
          priceUsd,
        },
      ],
      notes: body.notes ?? "Free trial claim",
      total_usd: priceUsd,
      total_usdt: priceUsd,
      status: "paid",                       // no payment step for trials
      wallet_address: "TRIAL",              // sentinel — not a real wallet
      network: "trial",
      token: "TRIAL",
      tx_verified_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    console.error("[trial] order insert failed:", orderErr?.code, orderErr?.message);
    return NextResponse.json(
      { ok: false, error: `Trial create failed: ${orderErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // Insert the trial claim row. UNIQUE indexes on ip_hash / email /
  // handle mean this insert LOSES the race if a concurrent request
  // beats us — Postgres 23505 unique-violation is the specific error.
  const { error: trialErr } = await supa.from("service_trials").insert({
    order_id: order.id,
    service_id: svc.id,
    target_url: targetUrl,
    target_handle_normalized: handleNorm,
    target_platform: svc.platform,
    ip_hash: ipHash,
    ip_country: region,
    email,
    quantity: trialQty,
    notes: body.notes ?? null,
  });
  if (trialErr) {
    if (trialErr.code === "23505") {
      // Rollback the order we just created — trial lost the race.
      await supa.from("service_orders").delete().eq("id", order.id);
      return NextResponse.json(
        { ok: false, error: "A trial has already been claimed. Only one per person." },
        { status: 400 },
      );
    }
    console.error("[trial] insert failed:", trialErr.code, trialErr.message);
    await supa.from("service_orders").delete().eq("id", order.id);
    return NextResponse.json(
      { ok: false, error: `Trial insert failed: ${trialErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    orderRef: ref,
    serviceName: svc.name,
    quantity: trialQty,
    targetUrl,
    email,
  });
}
