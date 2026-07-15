export type Platform = "instagram" | "youtube" | "tiktok";

export type Region = "IN" | "GLOBAL";

// Plan / tier identifier passed to payment providers.
//   - Legacy: 'monthly' | 'annual' (single flat plan) and 'one_time' (single-report unlock)
//   - Consumer tier ids from core/billing/tiers.ts ('starter' | 'pro' | 'scale')
//   - Developer API subscription: 'api-starter'
//   - Any of the tier ids can carry a ':annual' suffix to indicate annual
//     billing cycle (e.g., 'starter:annual', 'pro:annual', 'api-starter:annual')
// Provider adapters branch on this string to route to the right
// Razorpay plan id / LemonSqueezy variant.
export type Plan =
  | "monthly"
  | "annual"
  | "one_time"
  | "starter"
  | "pro"
  | "scale"
  | "api-starter"
  | "starter:annual"
  | "pro:annual"
  | "scale:annual"
  | "api-starter:annual";

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
  // Legacy 'monthly' / 'annual' rows still exist; new subscriptions store
  // the tier id ('starter' | 'pro' | 'scale') directly so getUserTier() can
  // map the row to a ConsumerTier without a translation layer.
  plan: "monthly" | "annual" | "starter" | "pro" | "scale";
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
