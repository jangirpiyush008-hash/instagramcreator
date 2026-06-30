import crypto from "node:crypto";
import { PaymentError } from "../utils/errors";
import type { Plan } from "../types";
import type { CheckoutSession, PaymentProvider, VerifiedWebhookEvent } from "./provider";

const LS_API = "https://api.lemonsqueezy.com/v1";

function authHeader(): string {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new PaymentError("LemonSqueezy API key not configured");
  return `Bearer ${key}`;
}

function variantFor(plan: Plan): string {
  const id =
    plan === "monthly"
      ? process.env.LEMONSQUEEZY_VARIANT_MONTHLY
      : plan === "annual"
      ? process.env.LEMONSQUEEZY_VARIANT_ANNUAL
      : process.env.LEMONSQUEEZY_VARIANT_ONE_TIME;
  if (!id) throw new PaymentError(`LemonSqueezy variant id missing for ${plan}`);
  return id;
}

export class LemonSqueezyProvider implements PaymentProvider {
  readonly name = "lemonsqueezy" as const;

  async createCheckout(args: {
    userId: string;
    plan: Plan;
    scanKey?: string;
    successUrl: string;
  }): Promise<CheckoutSession> {
    const { userId, plan, scanKey, successUrl } = args;
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) throw new PaymentError("LemonSqueezy store id missing");

    const body = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: undefined,
            custom: { userId, scanKey: scanKey ?? "", plan },
          },
          product_options: { redirect_url: successUrl },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantFor(plan) } },
        },
      },
    };

    const res = await fetch(`${LS_API}/checkouts`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new PaymentError(`LemonSqueezy checkout failed: ${res.status} ${txt}`);
    }
    const j = (await res.json()) as {
      data: { id: string; attributes: { url: string } };
    };
    return {
      url: j.data.attributes.url,
      provider: this.name,
      reference: j.data.id,
    };
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<VerifiedWebhookEvent> {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) throw new PaymentError("LemonSqueezy webhook secret not configured");
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new PaymentError("LemonSqueezy webhook signature mismatch");
    }

    const evt = JSON.parse(rawBody) as {
      meta?: {
        event_name?: string;
        custom_data?: { userId?: string; scanKey?: string; plan?: Plan };
      };
      data?: {
        id: string;
        attributes?: {
          status?: string;
          renews_at?: string;
          ends_at?: string;
          user_email?: string;
        };
      };
    };

    const custom = evt.meta?.custom_data ?? {};
    const userId = custom.userId ?? "";
    const evtName = evt.meta?.event_name ?? "";
    const a = evt.data?.attributes ?? {};

    if (evtName === "subscription_created" || evtName === "subscription_resumed") {
      return {
        type: "subscription.active",
        userId,
        plan: custom.plan ?? "monthly",
        data: { subId: evt.data?.id, current_period_end: a.renews_at },
      };
    }
    if (evtName === "subscription_cancelled" || evtName === "subscription_expired") {
      return {
        type: "subscription.canceled",
        userId,
        data: { subId: evt.data?.id, ends_at: a.ends_at },
      };
    }
    if (evtName === "subscription_payment_failed") {
      return { type: "subscription.past_due", userId, data: { subId: evt.data?.id } };
    }
    if (evtName === "order_created") {
      return {
        type: "payment.success",
        userId,
        plan: "one_time",
        scanKey: custom.scanKey,
        data: { orderId: evt.data?.id },
      };
    }

    return { type: "payment.success", userId: "", data: { ignored: evtName } };
  }
}
