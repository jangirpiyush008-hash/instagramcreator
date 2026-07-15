export const PRICING = {
  IN: {
    monthly: 29900,   // ₹299.00 in paise
    annual: 299000,   // ₹2990.00 in paise
    oneTime: 19900,   // ₹199.00 in paise
    currency: "INR" as const,
    symbol: "₹",
  },
  GLOBAL: {
    monthly: 999,     // $9.99 in cents
    annual: 9900,     // $99.00 in cents
    oneTime: 600,     // $6.00 in cents
    currency: "USD" as const,
    symbol: "$",
  },
} as const;

// Legacy — kept as a fallback for code paths that still import it, but
// authoritative limits now live in core/billing/tiers.ts (CONSUMER_TIERS,
// ANON_LIMITS). New code should read from there, not this constant.
export const PLAN_LIMITS = {
  anon: 5,
  free: 20,
  subscriber: 150,
} as const;

export const CACHE_TTL_HOURS = 48;

export const REGION_MAP_IN_COUNTRIES = new Set(["IN"]);

export const BLURRED_PLACEHOLDER = "••••••" as const;
