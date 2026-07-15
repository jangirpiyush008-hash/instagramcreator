import crypto from "node:crypto";
import { PRICING } from "../constants";
import { CONSUMER_TIERS, API_STARTER_TIER, type ConsumerTier } from "../billing/tiers";
import { PaymentError } from "../utils/errors";
import type { Plan } from "../types";
import type { CheckoutSession, PaymentProvider, VerifiedWebhookEvent } from "./provider";

const RZP_API = "https://api.razorpay.com/v1";

function basicAuthHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new PaymentError("Razorpay keys not configured");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

interface RzpOrderResp {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

interface RzpSubResp {
  id: string;
  status: string;
  short_url?: string;
}

interface RzpPaymentLinkResp {
  id: string;
  short_url: string;
  status: string;
}

// Create a Razorpay Payment Link — a hosted, share-able page for a
// single one-time payment. Used for wallet top-ups: user picks a pack
// OR enters a custom amount, we create a link with the right amount,
// redirect them to short_url, they pay, Razorpay fires payment.captured
// which the webhook route uses to credit the wallet (idempotent by
// payment_id).
//
// `credits` is ALWAYS embedded in notes — the webhook reads it and
// grants that many credits. Server is the single source of truth for
// the credit count (packs have fixed amounts; custom recharges compute
// via creditsFromRupees). Never trust the client to specify credits.
//
// Docs: https://razorpay.com/docs/api/payments/payment-links/
export async function createRazorpayPaymentLink(args: {
  userId: string;
  amountMinor: number;    // paise (INR)
  credits: number;        // credits to grant on success — server-computed
  currency?: string;      // defaults 'INR'
  description: string;
  // Wallet-topup source label. Format: 'topup:<packId>' for packs,
  // 'topup:custom' for manual amounts. Embedded in notes so the webhook
  // can label the wallet_credits row with provenance.
  source: string;
  customerEmail?: string;
  customerName?: string;
  callbackUrl: string;    // where Razorpay redirects after payment
}): Promise<{ url: string; linkId: string }> {
  const res = await fetch(`${RZP_API}/payment_links`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: args.amountMinor,
      currency: args.currency ?? "INR",
      accept_partial: false,
      description: args.description,
      customer: {
        name: args.customerName,
        email: args.customerEmail,
      },
      notify: { sms: false, email: !!args.customerEmail },
      reminder_enable: false,
      // Notes flow through to the webhook — used to map payment.captured
      // events back to the right user + credit count. Razorpay stringifies
      // number values, so the webhook parses `credits` as an int.
      notes: {
        userId: args.userId,
        kind: "wallet-topup",
        source: args.source,
        credits: String(args.credits),
      },
      callback_url: args.callbackUrl,
      callback_method: "get",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PaymentError(`Razorpay payment_link failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const link = (await res.json()) as RzpPaymentLinkResp;
  return { url: link.short_url, linkId: link.id };
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;

  async createCheckout(args: {
    userId: string;
    plan: Plan;
    scanKey?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession> {
    const { userId, plan, scanKey, successUrl } = args;

    if (plan === "one_time") {
      const amount = PRICING.IN.oneTime;
      const res = await fetch(`${RZP_API}/orders`, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency: "INR",
          receipt: `u_${userId.slice(0, 8)}_${Date.now()}`,
          notes: { userId, scanKey: scanKey ?? "", kind: "one_time" },
        }),
      });
      if (!res.ok) throw new PaymentError(`Razorpay order failed: ${res.status}`);
      const order = (await res.json()) as RzpOrderResp;
      // Hosted-checkout link: pass order id + return URL via the standalone checkout page in /web.
      // We return our own URL — the Next.js page builds the checkout JS form server-side.
      const url = `${successUrl}?provider=razorpay&order=${order.id}&plan=${plan}`;
      return { url, provider: this.name, reference: order.id };
    }

    // Subscription plans — map plan token → Razorpay plan id.
    // Consumer tiers (starter / pro / scale) look up their env var from
    // CONSUMER_TIERS; legacy monthly / annual fall back to the original vars.
    const planId = resolveRazorpayPlanId(plan);
    if (!planId) {
      throw new PaymentError(
        `Razorpay plan id missing for '${plan}'. Set the env var and restart.`,
      );
    }

    const res = await fetch(`${RZP_API}/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: planId,
        // 12 monthly renewals by default, then the customer resubs.
        // Legacy "annual" (yearly plan) only bills once, so total_count=1.
        total_count: plan === "annual" ? 1 : 12,
        notes: { userId, kind: "subscription", plan },
      }),
    });
    if (!res.ok) throw new PaymentError(`Razorpay subscription failed: ${res.status}`);
    const sub = (await res.json()) as RzpSubResp;
    return {
      url: sub.short_url ?? `${successUrl}?provider=razorpay&sub=${sub.id}&plan=${plan}`,
      provider: this.name,
      reference: sub.id,
    };
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<VerifiedWebhookEvent> {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new PaymentError("Razorpay webhook secret not configured");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    // timingSafeEqual throws on different-length buffers. Reject clearly
    // when the caller sent no signature (unsigned test requests, missing
    // header, etc.) instead of leaking Node's raw error string.
    if (signature.length !== expected.length) {
      throw new PaymentError("Razorpay webhook signature missing or malformed");
    }
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new PaymentError("Razorpay webhook signature mismatch");
    }

    const evt = JSON.parse(rawBody) as {
      event: string;
      payload: {
        payment?: { entity?: { id: string; notes?: Record<string, string>; amount: number } };
        subscription?: { entity?: { id: string; status: string; notes?: Record<string, string>; current_end?: number } };
      };
    };

    if (evt.event === "payment.captured" || evt.event === "order.paid") {
      const p = evt.payload.payment?.entity;
      const notes = p?.notes ?? {};
      // notes.credits comes back as a string (Razorpay stringifies numeric
      // notes). Parse to int; downstream uses NaN-safety.
      const creditsRaw = notes.credits;
      const credits = creditsRaw ? Number.parseInt(creditsRaw, 10) : undefined;
      return {
        type: "payment.success",
        userId: notes.userId ?? "",
        plan: notes.kind === "one_time" ? "one_time" : undefined,
        scanKey: notes.scanKey || undefined,
        data: {
          paymentId: p?.id,
          amount: p?.amount,
          // Wallet-topup context. `source` is the ledger label
          // (e.g. 'topup:topup-50' or 'topup:custom'), `credits` is the
          // server-computed grant amount.
          kind: notes.kind,
          source: notes.source,
          credits: Number.isFinite(credits) ? credits : undefined,
        },
      };
    }

    if (evt.event === "subscription.activated" || evt.event === "subscription.charged") {
      const s = evt.payload.subscription?.entity;
      const notes = s?.notes ?? {};
      return {
        type: "subscription.active",
        userId: notes.userId ?? "",
        plan: (notes.plan as Plan | undefined) ?? "monthly",
        data: {
          subId: s?.id,
          current_period_end: s?.current_end
            ? new Date(s.current_end * 1000).toISOString()
            : null,
        },
      };
    }

    if (evt.event === "subscription.cancelled" || evt.event === "subscription.halted") {
      const s = evt.payload.subscription?.entity;
      const notes = s?.notes ?? {};
      return {
        type: "subscription.canceled",
        userId: notes.userId ?? "",
        data: { subId: s?.id },
      };
    }

    return {
      type: "payment.success",
      userId: "",
      data: { ignored: evt.event },
    };
  }
}

// Resolves the Razorpay plan_id for a given Plan token, reading from env.
// Plan tokens now encode BOTH the tier and the billing cycle:
//   starter               → starter monthly (default cycle)
//   starter:annual        → starter annual
//   pro:monthly / pro:annual — same pattern
//   monthly / annual      → legacy generic plans (kept for backward-compat)
// Env-var lookup goes through the tier's razorpayPlanMonthlyEnv /
// razorpayPlanAnnualEnv fields — set the env in Railway to rotate keys
// without a code deploy.
function resolveRazorpayPlanId(plan: Plan): string | undefined {
  // Legacy generic plans
  if (plan === "monthly") return process.env.RAZORPAY_PLAN_MONTHLY;
  if (plan === "annual") return process.env.RAZORPAY_PLAN_ANNUAL;

  // Parse `tier[:cycle]`. Default cycle is monthly.
  const [tierId, cycleRaw] = plan.split(":") as [string, string | undefined];
  const cycle: "monthly" | "annual" = cycleRaw === "annual" ? "annual" : "monthly";

  // Developer API subscription lives in a separate constant since it's
  // a different product line (API access vs web-app scans).
  if (tierId === "api-starter") {
    const envName =
      cycle === "annual"
        ? API_STARTER_TIER.razorpayPlanAnnualEnv
        : API_STARTER_TIER.razorpayPlanMonthlyEnv;
    return envName ? process.env[envName] : undefined;
  }

  const tier = CONSUMER_TIERS[tierId] as ConsumerTier | undefined;
  if (!tier) return undefined;
  const envName =
    cycle === "annual" ? tier.razorpayPlanAnnualEnv : tier.razorpayPlanMonthlyEnv;
  return envName ? process.env[envName] : undefined;
}

// Helper for the client-side Razorpay checkout button.
export function verifyRazorpaySignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const body = `${args.orderId}|${args.paymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(args.signature));
  } catch {
    return false;
  }
}
