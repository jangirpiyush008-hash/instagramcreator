// Brand Deal Fit — recommends the collab structure a brand should use
// with this creator. Not a rate card (rates vary too much by niche +
// geo + campaign type to auto-quote), but a STRUCTURE call: fixed fee,
// fixed + commission, barter + commission, barter only, or don't
// partner. Also gives an INR range as a rough India-market benchmark
// so the reader has an anchor, marked clearly as an estimate.
//
// Structure logic:
//   • Micro/nano creators (< 10K) with real audience → barter works
//     because their goodwill + real engagement is worth the product
//     alone; add commission to align incentives.
//   • Mid/macro creators (10K–500K) with real engagement → fixed +
//     commission is the sweet spot; performance upside for them,
//     accountability for the brand.
//   • Large creators (500K+) → fixed fee is standard; commission is
//     nice-to-have but their booking rate carries the deal.
//   • Any fraud-elevated creator → performance-only (barter + commission)
//     so the brand pays for conversions, not vanity metrics.
//   • Any fraud-high creator → don't partner.

import type { Profile } from "@/core/data/adapter";
import type { DecodeAnalysis } from "./scoring";
import type { ProfileSignal } from "./profile-signals";

export type CollabStructure =
  | "Fixed-fee sponsored posts"
  | "Fixed fee + performance commission"
  | "Barter + performance commission (affiliate)"
  | "Barter only (gifted product)"
  | "First-party — no influencer collab needed"
  | "Not recommended";

export interface BrandFit {
  structure: CollabStructure;
  tone: "positive" | "neutral" | "warning" | "danger";
  headline: string;
  reasoning: string;
  estimatedRateInrRange: string | null;    // e.g. "₹25K – ₹1L / post"
  creatorTier: "nano" | "micro" | "mid" | "macro" | "mega" | "unknown";
  cautionNotes: string[];
}

type Tier = BrandFit["creatorTier"];

function creatorTier(followers: number): Tier {
  if (followers < 1_000) return "unknown";
  if (followers < 10_000) return "nano";
  if (followers < 100_000) return "micro";
  if (followers < 500_000) return "mid";
  if (followers < 1_000_000) return "macro";
  return "mega";
}

// India-market Instagram INR benchmarks. Deliberately conservative
// ranges — real rates vary wildly by niche (finance / tech / beauty
// command 2–4× lifestyle) and by whether the campaign is a single
// post vs a reel vs a story bundle. This is a starting anchor.
function benchmarkInr(tier: Tier, erBoost: boolean): string | null {
  const table: Record<Tier, [number, number] | null> = {
    unknown: null,
    nano: [1_000, 5_000],
    micro: [5_000, 25_000],
    mid: [25_000, 100_000],
    macro: [100_000, 300_000],
    mega: [300_000, 1_000_000],
  };
  const range = table[tier];
  if (!range) return null;
  const [lo, hi] = range;
  const mult = erBoost ? 1.5 : 1;
  return `₹${fmtInr(lo * mult)} – ₹${fmtInr(hi * mult)} / post (India benchmark, single reel)`;
}

function fmtInr(n: number): string {
  if (n >= 100_000) return `${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString("en-IN");
}

export function computeBrandFit(
  profile: Profile,
  analysis: DecodeAnalysis,
  profileSignals: ProfileSignal,
): BrandFit {
  const followers = profile.followers ?? 0;
  const tier = creatorTier(followers);
  const { audience, engagement, fraud } = analysis;

  // Rough ER lookup from posts already scored by the engagement module.
  // We use it as a multiplier hint for benchmarks — high ER = premium.
  const erBoost = audience.score >= 80 && engagement.score >= 70;

  const cautionNotes: string[] = [];

  // 1) Brand-owned account — not a collab target
  if (profileSignals.bioBrandOfficialHit) {
    return {
      structure: "First-party — no influencer collab needed",
      tone: "neutral",
      headline: "This is a brand's own account, not an influencer.",
      reasoning:
        "First-party accounts run their own content. If you're doing brand-to-brand co-marketing, treat rates like a media buy — not an influencer fee. If you're building an influencer program, look elsewhere.",
      estimatedRateInrRange: null,
      creatorTier: tier,
      cautionNotes: [],
    };
  }

  // 2) Hard walk-away — high fraud
  if (fraud.risk === "High") {
    return {
      structure: "Not recommended",
      tone: "danger",
      headline: "Do not partner — the numbers can't be trusted.",
      reasoning:
        "Multiple fraud signals mean you'd be paying for engagement volume that likely won't convert to real audience action. No collab structure fixes this — walk away.",
      estimatedRateInrRange: null,
      creatorTier: tier,
      cautionNotes: [
        "If you must partner anyway, use PURE performance (barter + commission on verified conversions only) — never pay a fixed fee against these metrics.",
      ],
    };
  }

  // 3) Insufficient audience / follower data
  if (tier === "unknown") {
    return {
      structure: "Barter only (gifted product)",
      tone: "neutral",
      headline: "Too small to justify cash — start with product only.",
      reasoning:
        "Follower count is very small. Start with a gifted product to see if their content quality earns real attention. Move to cash only if they produce results.",
      estimatedRateInrRange: null,
      creatorTier: tier,
      cautionNotes: [
        "At this size, benchmarks are unreliable — negotiate on outcomes, not audience size.",
      ],
    };
  }

  // 4) Elevated fraud → shift to performance-only regardless of size
  if (fraud.risk === "Elevated") {
    cautionNotes.push(
      "Fraud risk is elevated — even if you partner, avoid fixed fees. Pay against verified conversions.",
    );
    return {
      structure: "Barter + performance commission (affiliate)",
      tone: "warning",
      headline: "Pay for outcomes only — audience quality signals are mixed.",
      reasoning:
        "Send product + a trackable affiliate link and pay commission on actual conversions. This caps your downside if the audience metrics don't hold up.",
      estimatedRateInrRange: null,
      creatorTier: tier,
      cautionNotes,
    };
  }

  // 5) Standard fit logic by tier + engagement quality
  if (audience.score < 55 || engagement.score < 55) {
    cautionNotes.push(
      "Audience or engagement quality is below the healthy band — commission-based structures protect you from over-paying.",
    );
  }

  switch (tier) {
    case "nano": {
      const wantsCollabs = profileSignals.bioCommercialHits.length > 0;
      return {
        structure: wantsCollabs
          ? "Barter + performance commission (affiliate)"
          : "Barter only (gifted product)",
        tone: "positive",
        headline: wantsCollabs
          ? "Product + affiliate commission — they're already open to deals."
          : "Product only — small but authentic audience, low downside.",
        reasoning: wantsCollabs
          ? "Their bio signals openness to collabs. Nano tier is best-value when paid via product + performance upside — you get authenticity without a fixed-fee outlay."
          : "Nano creators with real audiences respond well to gifted product. If they organically post about it and drive interest, upgrade to a paid collab later.",
        estimatedRateInrRange: benchmarkInr(tier, erBoost),
        creatorTier: tier,
        cautionNotes,
      };
    }
    case "micro": {
      return {
        structure: "Barter + performance commission (affiliate)",
        tone: "positive",
        headline: "Product + commission is the sweet spot at this tier.",
        reasoning:
          "Micro creators (10–100K) drive the best engagement-per-rupee in India. Barter + affiliate commission aligns incentives without inflated fixed fees. Upgrade to fixed fee only after 2–3 successful campaigns together.",
        estimatedRateInrRange: benchmarkInr(tier, erBoost),
        creatorTier: tier,
        cautionNotes,
      };
    }
    case "mid": {
      return {
        structure: "Fixed fee + performance commission",
        tone: "positive",
        headline: "Fixed fee + commission — professional tier, expect market rates.",
        reasoning:
          "Mid-tier creators (100K–500K) treat brand deals as revenue. Fixed fee anchors the deliverable; commission keeps them motivated to drive real conversions. Negotiate exclusivity if the category matters to you.",
        estimatedRateInrRange: benchmarkInr(tier, erBoost),
        creatorTier: tier,
        cautionNotes,
      };
    }
    case "macro": {
      return {
        structure: "Fixed-fee sponsored posts",
        tone: "positive",
        headline: "Fixed fee — brand-safety and reach are what you're buying.",
        reasoning:
          "Macro creators (500K–1M) command fixed rates because their booking rate carries the deal. Commission is nice-to-have but shouldn't be a deal-breaker. Focus negotiations on usage rights, whitelisting, and exclusivity windows.",
        estimatedRateInrRange: benchmarkInr(tier, erBoost),
        creatorTier: tier,
        cautionNotes,
      };
    }
    case "mega": {
      return {
        structure: "Fixed-fee sponsored posts",
        tone: "positive",
        headline: "Fixed fee — premium tier, brief carefully.",
        reasoning:
          "Mega creators (1M+) command premium rates and typically work through management. Fixed fees only — commission conversations at this level rarely close. Invest in a strong creative brief and locked usage rights.",
        estimatedRateInrRange: benchmarkInr(tier, erBoost),
        creatorTier: tier,
        cautionNotes,
      };
    }
  }
}
