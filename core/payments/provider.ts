import type { PaymentProviderName, Plan, Region } from "../types";

export interface CheckoutSession {
  url: string;
  provider: PaymentProviderName;
  reference: string; // order id / checkout id from provider
}

export interface VerifiedWebhookEvent {
  type:
    | "subscription.active"
    | "subscription.canceled"
    | "subscription.past_due"
    | "payment.success";
  userId: string;        // resolved from event metadata
  plan?: Plan;
  scanKey?: string;      // for one-time unlocks
  data: Record<string, unknown>;
}

export interface PaymentProvider {
  name: PaymentProviderName;
  createCheckout(args: {
    userId: string;
    plan: Plan;
    scanKey?: string;
    region: Region;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession>;
  verifyWebhook(rawBody: string, signature: string): Promise<VerifiedWebhookEvent>;
}
