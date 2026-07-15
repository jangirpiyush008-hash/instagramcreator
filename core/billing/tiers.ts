// Consumer subscription tiers. Prices in paise (INR) — Razorpay-native.
// Also carries USD displays for international callers. Update this file
// when pricing changes; nothing else in the codebase hardcodes numbers.

export interface ConsumerTier {
  id: "free" | "starter" | "pro" | "scale";
  name: string;
  priceInrPaise: number;      // 0 for free
  priceInrDisplay: string;    // "₹599" — for UI
  priceUsdDisplay: string;    // "$7"  — for UI
  scansPerMonth: number;
  fullReport: boolean;        // can run /v1/scan?tool=full-report
  watermarkFree: boolean;
  toolIds: readonly string[] | "all"; // 'all' = every tool in registry
  blurb: string;
  highlights: readonly string[];
  ctaLabel: string;
  razorpayPlanEnv?: string;   // env var name that holds the Razorpay plan id
}

export const CONSUMER_TIERS: Record<string, ConsumerTier> = {
  free: {
    id: "free",
    name: "Free",
    priceInrPaise: 0,
    priceInrDisplay: "₹0",
    priceUsdDisplay: "$0",
    scansPerMonth: 20,
    fullReport: false,
    watermarkFree: false,
    // Free-plan users get the two "hook" tools that most people try first.
    // Everything else prompts them to upgrade.
    toolIds: ["engagement-rate", "username-checker", "thumbnail-downloader", "banned-hashtag"],
    blurb: "Try DecodeCreator with 20 scans a month across 4 tools. No card required.",
    highlights: ["20 scans / month", "4 core tools", "All 3 platforms"],
    ctaLabel: "Sign up free",
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceInrPaise: 59900,       // ₹599
    priceInrDisplay: "₹599",
    priceUsdDisplay: "$7",
    scansPerMonth: 150,
    fullReport: false,
    watermarkFree: true,
    toolIds: "all",
    blurb: "For serious creators managing their own accounts and small brand collaborations.",
    highlights: ["150 scans / month", "All 12 tools", "Watermark-free exports", "Email support"],
    ctaLabel: "Start on Starter",
    razorpayPlanEnv: "RAZORPAY_PLAN_STARTER",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInrPaise: 149900,      // ₹1,499
    priceInrDisplay: "₹1,499",
    priceUsdDisplay: "$18",
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
    razorpayPlanEnv: "RAZORPAY_PLAN_PRO",
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceInrPaise: 399900,      // ₹3,999
    priceInrDisplay: "₹3,999",
    priceUsdDisplay: "$48",
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
    razorpayPlanEnv: "RAZORPAY_PLAN_SCALE",
  },
} as const;

// Anonymous (not-signed-in) hard limits. Kept separate from CONSUMER_TIERS
// because these aren't a purchasable tier — they're the pre-signup teaser.
export const ANON_LIMITS = {
  scansPerDay: 5,          // per IP-hash per UTC day
  toolIds: ["engagement-rate", "username-checker"] as const,
} as const;

export function tierById(id: string | null | undefined): ConsumerTier {
  if (!id) return CONSUMER_TIERS.free!;
  return CONSUMER_TIERS[id] ?? CONSUMER_TIERS.free!;
}

// Does this tier permit running the given tool?
export function tierAllowsTool(tier: ConsumerTier, toolId: string): boolean {
  if (tier.toolIds === "all") return true;
  return tier.toolIds.includes(toolId);
}
