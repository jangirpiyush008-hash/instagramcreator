// Consumer subscription tiers. Prices in paise (INR) — Razorpay-native.
// USD displays are for international viewers; billing itself is always
// INR via the merchant's Razorpay account.
//
// Annual plans get a fixed 17% discount (12 months for the price of 10).
// Update ONE monthly number here and the annual math derives.

const ANNUAL_MULTIPLIER = 10; // Pay 10 months to get 12 → 17% off

export interface ConsumerTier {
  id: "free" | "starter" | "pro" | "scale";
  name: string;
  monthlyInrPaise: number;      // 0 for free
  monthlyInrDisplay: string;    // "₹599"
  monthlyUsdDisplay: string;    // "$7"
  annualInrPaise: number;       // derived: monthly * 10
  annualInrDisplay: string;
  annualUsdDisplay: string;
  scansPerMonth: number;
  fullReport: boolean;
  watermarkFree: boolean;
  toolIds: readonly string[] | "all";
  blurb: string;
  highlights: readonly string[];
  ctaLabel: string;
  razorpayPlanMonthlyEnv?: string; // env var → Razorpay plan_id (monthly)
  razorpayPlanAnnualEnv?: string;  // env var → Razorpay plan_id (annual)
}

function tier(
  base: Omit<
    ConsumerTier,
    | "annualInrPaise"
    | "annualInrDisplay"
    | "annualUsdDisplay"
    | "monthlyInrDisplay"
    | "monthlyUsdDisplay"
  > & {
    monthlyInrDisplay: string;
    monthlyUsdDisplay: string;
  },
): ConsumerTier {
  const annualInrPaise = base.monthlyInrPaise * ANNUAL_MULTIPLIER;
  return {
    ...base,
    annualInrPaise,
    // Derive display strings by stripping non-digits and multiplying.
    annualInrDisplay: formatInr(annualInrPaise),
    annualUsdDisplay: multiplyUsdDisplay(base.monthlyUsdDisplay, ANNUAL_MULTIPLIER),
  };
}

function formatInr(paise: number): string {
  const rupees = paise / 100;
  return "₹" + rupees.toLocaleString("en-IN");
}

function multiplyUsdDisplay(display: string, mult: number): string {
  const n = Number(display.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return display;
  return "$" + (n * mult).toLocaleString("en-US");
}

export const CONSUMER_TIERS: Record<string, ConsumerTier> = {
  free: tier({
    id: "free",
    name: "Free",
    monthlyInrPaise: 0,
    monthlyInrDisplay: "₹0",
    monthlyUsdDisplay: "$0",
    scansPerMonth: 20,
    fullReport: false,
    watermarkFree: false,
    toolIds: ["engagement-rate", "username-checker", "thumbnail-downloader", "banned-hashtag"],
    blurb: "Try DecodeCreator with 20 scans a month across 4 tools. No card required.",
    highlights: ["20 scans / month", "4 core tools", "All 3 platforms"],
    ctaLabel: "Sign up free",
  }),
  starter: tier({
    id: "starter",
    name: "Starter",
    monthlyInrPaise: 59900,
    monthlyInrDisplay: "₹599",
    monthlyUsdDisplay: "$7",
    scansPerMonth: 150,
    fullReport: false,
    watermarkFree: true,
    toolIds: "all",
    blurb: "For serious creators managing their own accounts and small brand collaborations.",
    highlights: ["150 scans / month", "All 12 tools", "Watermark-free exports", "Email support"],
    ctaLabel: "Start on Starter",
    razorpayPlanMonthlyEnv: "RAZORPAY_PLAN_STARTER_MONTHLY",
    razorpayPlanAnnualEnv: "RAZORPAY_PLAN_STARTER_ANNUAL",
  }),
  pro: tier({
    id: "pro",
    name: "Pro",
    monthlyInrPaise: 149900,
    monthlyInrDisplay: "₹1,499",
    monthlyUsdDisplay: "$18",
    scansPerMonth: 600,
    fullReport: true,
    watermarkFree: true,
    toolIds: "all",
    blurb: "For agencies and brand teams running campaigns and pitching creators.",
    highlights: [
      "600 scans / month",
      "All 12 tools",
      "Full-report bundle (all tools, one call)",
      "Priority support",
    ],
    ctaLabel: "Go Pro",
    razorpayPlanMonthlyEnv: "RAZORPAY_PLAN_PRO_MONTHLY",
    razorpayPlanAnnualEnv: "RAZORPAY_PLAN_PRO_ANNUAL",
  }),
  scale: tier({
    id: "scale",
    name: "Scale",
    monthlyInrPaise: 399900,
    monthlyInrDisplay: "₹3,999",
    monthlyUsdDisplay: "$48",
    scansPerMonth: 2500,
    fullReport: true,
    watermarkFree: true,
    toolIds: "all",
    blurb: "For power users, in-house creator-marketing teams, and small agencies.",
    highlights: [
      "2,500 scans / month",
      "All 12 tools",
      "Full-report bundle",
      "API preview credits (500/mo)",
      "Priority support with 24h SLA",
    ],
    ctaLabel: "Scale up",
    razorpayPlanMonthlyEnv: "RAZORPAY_PLAN_SCALE_MONTHLY",
    razorpayPlanAnnualEnv: "RAZORPAY_PLAN_SCALE_ANNUAL",
  }),
} as const;

// ── Developer API tier (single subscription — Starter) ─────────────────
// The old Pro/Scale API subscriptions are retired. Users beyond Starter
// buy WALLET CREDITS (see CREDIT_PACKS below) — pay only for what they use.

export interface ApiSubscriptionTier {
  id: "api-starter";
  name: string;
  monthlyInrPaise: number;
  monthlyInrDisplay: string;
  monthlyUsdDisplay: string;
  annualInrPaise: number;
  annualInrDisplay: string;
  annualUsdDisplay: string;
  creditsPerMonth: number;
  highlights: readonly string[];
  razorpayPlanMonthlyEnv: string;
  razorpayPlanAnnualEnv: string;
}

export const API_STARTER_TIER: ApiSubscriptionTier = (() => {
  const monthlyInrPaise = 249900; // ₹2,499
  const annualInrPaise = monthlyInrPaise * ANNUAL_MULTIPLIER;
  return {
    id: "api-starter",
    name: "API Starter",
    monthlyInrPaise,
    monthlyInrDisplay: "₹2,499",
    monthlyUsdDisplay: "$29",
    annualInrPaise,
    annualInrDisplay: formatInr(annualInrPaise),
    annualUsdDisplay: multiplyUsdDisplay("$29", ANNUAL_MULTIPLIER),
    creditsPerMonth: 3000,
    highlights: [
      "3,000 API credits per month",
      "Auto-renews monthly",
      "All 12 tools + full-report bundle",
      "Predictable monthly bill",
    ],
    razorpayPlanMonthlyEnv: "RAZORPAY_PLAN_API_STARTER_MONTHLY",
    razorpayPlanAnnualEnv: "RAZORPAY_PLAN_API_STARTER_ANNUAL",
  };
})();

// ── Wallet top-up packs (pay-as-you-go for beyond-Starter usage) ────────
// User picks a pack, Razorpay creates a ONE-TIME order (not subscription),
// on webhook we credit the wallet. Credits are valid 12 months from purchase.

export interface CreditPack {
  id: "topup-20" | "topup-50" | "topup-100" | "topup-500";
  amountInrPaise: number;
  amountInrDisplay: string;
  amountUsdDisplay: string;
  credits: number;
  perCreditUsdDisplay: string;
  discountLabel?: string;
  highlight?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "topup-20",
    amountInrPaise: 169900,      // ~$20
    amountInrDisplay: "₹1,699",
    amountUsdDisplay: "$20",
    credits: 4000,
    perCreditUsdDisplay: "$0.0050",
  },
  {
    id: "topup-50",
    amountInrPaise: 424900,      // ~$50
    amountInrDisplay: "₹4,249",
    amountUsdDisplay: "$50",
    credits: 12000,
    perCreditUsdDisplay: "$0.0042",
    discountLabel: "17% off",
  },
  {
    id: "topup-100",
    amountInrPaise: 849900,      // ~$100
    amountInrDisplay: "₹8,499",
    amountUsdDisplay: "$100",
    credits: 30000,
    perCreditUsdDisplay: "$0.0033",
    discountLabel: "33% off",
    highlight: true,
  },
  {
    id: "topup-500",
    amountInrPaise: 4249900,     // ~$500
    amountInrDisplay: "₹42,499",
    amountUsdDisplay: "$500",
    credits: 200000,
    perCreditUsdDisplay: "$0.0025",
    discountLabel: "50% off — bulk",
  },
];

export const CREDIT_PACK_BY_ID: Record<string, CreditPack> = Object.fromEntries(
  CREDIT_PACKS.map((p) => [p.id, p]),
);

// Wallet credits validity — enforced by the wallet-transaction ledger's
// expires_at column. Used by cron jobs and the wallet-balance query.
export const WALLET_CREDIT_VALIDITY_MONTHS = 12;

// Manual (custom-amount) recharge parameters. Used when a caller wants
// to pay a specific ₹ amount instead of picking a pre-set pack. Rate
// is deliberately baseline (no bulk discount) — bulk savings come from
// the packs so users have a real incentive to pick a pack for larger
// amounts.
export const WALLET_MIN_MANUAL_INR = 500;         // rupees
export const WALLET_MAX_MANUAL_INR = 100_000;     // rupees — sanity cap
export const WALLET_CREDITS_PER_RUPEE = 2.4;      // ₹0.42 per credit

export function creditsFromRupees(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees <= 0) return 0;
  return Math.floor(rupees * WALLET_CREDITS_PER_RUPEE);
}

// ── Anonymous limits (pre-signup) ───────────────────────────────────────
export const ANON_LIMITS = {
  scansPerDay: 5,
  toolIds: ["engagement-rate", "username-checker"] as const,
} as const;

// ── Tier lookup helpers ─────────────────────────────────────────────────
export function tierById(id: string | null | undefined): ConsumerTier {
  if (!id) return CONSUMER_TIERS.free!;
  return CONSUMER_TIERS[id] ?? CONSUMER_TIERS.free!;
}

export function tierAllowsTool(tier: ConsumerTier, toolId: string): boolean {
  if (tier.toolIds === "all") return true;
  return tier.toolIds.includes(toolId);
}
