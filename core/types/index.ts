export type Platform = "instagram" | "youtube" | "tiktok";

export type Region = "IN" | "GLOBAL";

export type Plan = "monthly" | "annual" | "one_time";

export type SubscriptionStatus = "active" | "canceled" | "past_due";

export type PaymentProviderName = "razorpay" | "lemonsqueezy";

export interface UserProfile {
  id: string;
  email: string | null;
  region: Region;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  provider: PaymentProviderName;
  provider_sub_id: string | null;
  provider_customer_id: string | null;
  plan: "monthly" | "annual";
  status: SubscriptionStatus;
  current_period_end: string | null;
}

export interface UnlockRow {
  id: string;
  user_id: string;
  scan_key: string;
  provider: PaymentProviderName;
  provider_payment_id: string | null;
  amount_minor: number;
  currency: "INR" | "USD";
}
