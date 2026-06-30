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

export const PLAN_LIMITS = {
  anon: 3,         // 3 scans / day / IP hash
  free: 5,         // 5 scans / day / authed user
  subscriber: 100, // 100 scans / day / subscriber
} as const;

export const CACHE_TTL_HOURS = 48;

export const REGION_MAP_IN_COUNTRIES = new Set(["IN"]);

export const BLURRED_PLACEHOLDER = "••••••" as const;
