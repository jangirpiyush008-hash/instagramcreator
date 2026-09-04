// Final Verdict — the single-line answer a brand wants: is this account
// worth partnering with, or should we walk away? Distills the five sub-
// scores + paid classification + fraud risk into ONE of a small set of
// clear verdicts. The UI shows this prominently at the top of the
// report so the reader doesn't have to interpret five numbers.
//
// Design rule from spec: "Never overclaim." We only emit a strong verdict
// when the signals actually support it. A "Suspicious" verdict requires
// multiple corroborating signals, not one bad number. Otherwise we degrade
// to "Analyze further" — honest ambiguity is better than a wrong call.

import type { DecodeAnalysis } from "./scoring";
import type { ProfileSignal } from "./profile-signals";

export type VerdictLabel =
  | "Real & Organic"
  | "Real + Sponsored (disclosed)"
  | "Real + Boosted (Meta ads active)"
  | "Bought Engagement"
  | "Suspicious — do not partner"
  | "Brand-owned first-party account"
  | "Business / retail account"
  | "Insufficient data — analyze further";

export interface Verdict {
  label: VerdictLabel;
  tone: "positive" | "neutral" | "warning" | "danger";
  summary: string;               // one-line human explanation
  supportingScores: string[];    // 2-3 lines quoting the specific scores that led here
}

export function computeVerdict(
  analysis: DecodeAnalysis,
  profileSignals: ProfileSignal,
): Verdict {
  const { audience, engagement, reach, paid, fraud, decodeScore } = analysis;

  // Insufficient data — bail early if the core signals aren't there
  const insufficientCount = [
    audience.label,
    engagement.label,
    reach.label,
  ].filter((l) => l === "Insufficient data").length;
  if (insufficientCount >= 2) {
    return {
      label: "Insufficient data — analyze further",
      tone: "neutral",
      summary:
        "Not enough posts, comments, or metrics to reach a confident verdict. Try again after this account has posted more, or try a different account.",
      supportingScores: [
        `${insufficientCount} of the 3 quality scores lack data`,
        `${analysis.postsAnalyzed} posts analyzed, ${analysis.commentsAnalyzed} comments sampled`,
      ],
    };
  }

  // Brand-owned account — first-party product content, not influencer collab
  if (profileSignals.bioBrandOfficialHit) {
    return {
      label: "Brand-owned first-party account",
      tone: "neutral",
      summary:
        "This account presents itself as an official brand-owned page. Product content here is first-party, not influencer sponsorship. Skip this if you're looking for an influencer partner.",
      supportingScores: [
        "Bio contains brand-official identifiers (Official / ™ / ®)",
        `Decode Score ${decodeScore.toFixed(0)} — quality is orthogonal to whether this fits an influencer program`,
      ],
    };
  }

  // High fraud → walk away
  if (fraud.risk === "High") {
    return {
      label: "Suspicious — do not partner",
      tone: "danger",
      summary:
        "Multiple corroborating fraud signals — the audience or engagement volume can't be trusted at face value. High risk of paying for reach that doesn't convert.",
      supportingScores: [
        `Fraud Risk: High (${fraud.confidencePct.toFixed(0)}% confidence)`,
        `Engagement Quality: ${engagement.label} (${engagement.score.toFixed(0)}/100)`,
        `Audience Authenticity: ${audience.label} (${audience.score.toFixed(0)}/100)`,
      ],
    };
  }

  // Elevated fraud + poor engagement quality → likely bought engagement
  if (fraud.risk === "Elevated" && engagement.score <= 60) {
    return {
      label: "Bought Engagement",
      tone: "warning",
      summary:
        "The engagement volume looks real but the QUALITY (comment substance, ratios, timing) suggests a chunk of it was purchased. Real reach may be lower than headline numbers.",
      supportingScores: [
        `Fraud Risk: Elevated (${fraud.confidencePct.toFixed(0)}% confidence)`,
        `Engagement Quality: ${engagement.label} (${engagement.score.toFixed(0)}/100)`,
        fraud.reasons[0] ?? "Multiple engagement-quality signals below baseline",
      ],
    };
  }

  // Commercial / business account (not brand-owned but direct commerce)
  if (profileSignals.commercialIntentScore >= 40 && !profileSignals.bioBrandOfficialHit) {
    // If it's a business account with good quality → still viable, note the shape
    if (fraud.risk === "Low" && audience.score >= 55) {
      return {
        label: "Business / retail account",
        tone: "neutral",
        summary:
          "Commercial-vertical business account with authentic audience signals. Fits well as a distribution partner or for co-marketing — treat rates like a media buy, not creator collab.",
        supportingScores: [
          `Bio + category indicate direct-commerce (${profileSignals.commercialIntentScore}/100 commercial intent)`,
          `Audience Authenticity: ${audience.label} (${audience.score.toFixed(0)}/100)`,
          `Fraud Risk: ${fraud.risk}`,
        ],
      };
    }
  }

  // Real + Boosted — Meta Ad Library confirms active ads
  const hasActiveMetaAds = paid.reasons.some((r) =>
    r.toLowerCase().includes("meta ad library") && r.toLowerCase().includes("active"),
  );
  if (hasActiveMetaAds && fraud.risk !== "Elevated" && audience.score >= 55) {
    return {
      label: "Real + Boosted (Meta ads active)",
      tone: "positive",
      summary:
        "Authentic account that ALSO runs paid Meta ads. Some of the visible reach is boosted — factor this in when you compare against creators who reach organically only.",
      supportingScores: [
        "Meta Ad Library shows active paid campaigns",
        `Audience Authenticity: ${audience.label} (${audience.score.toFixed(0)}/100)`,
        `Fraud Risk: ${fraud.risk}`,
      ],
    };
  }

  // Real + Sponsored (disclosed) — has paid partnerships but everything else clean
  if (
    (paid.classification === "Verified Paid" || paid.classification === "Likely Paid") &&
    fraud.risk === "Low" &&
    audience.score >= 55
  ) {
    return {
      label: "Real + Sponsored (disclosed)",
      tone: "positive",
      summary:
        "Legitimate creator with a healthy audience who does brand deals. Disclosed sponsorship is a positive quality signal — they know how to run paid partnerships professionally.",
      supportingScores: [
        `Paid Content: ${paid.classification} (${paid.confidencePct.toFixed(0)}% confidence)`,
        `Audience Authenticity: ${audience.label} (${audience.score.toFixed(0)}/100)`,
        `${paid.paidPostCount} of ${paid.totalPostsAnalyzed} recent posts are paid — a natural cadence`,
      ],
    };
  }

  // Real & Organic — the ideal case
  if (fraud.risk === "Low" && audience.score >= 55 && engagement.score >= 55) {
    return {
      label: "Real & Organic",
      tone: "positive",
      summary:
        "Authentic creator, real audience, real engagement, no paid distribution signals. Safe to partner — expect earned attention, not bought reach.",
      supportingScores: [
        `Decode Score ${decodeScore.toFixed(0)}/100 — ${analysis.decodeLabel}`,
        `Audience: ${audience.label} · Engagement: ${engagement.label} · Reach: ${reach.label}`,
        `Fraud Risk: Low`,
      ],
    };
  }

  // Moderate / mixed — honest ambiguity
  return {
    label: "Insufficient data — analyze further",
    tone: "neutral",
    summary:
      "Signals are mixed. The account isn't clearly suspicious, but nothing pushes it cleanly into a verdict category either. Look at the individual scores and decide manually.",
    supportingScores: [
      `Decode Score ${decodeScore.toFixed(0)}/100 — ${analysis.decodeLabel}`,
      `Fraud Risk: ${fraud.risk}`,
      `Paid Content: ${paid.classification}`,
    ],
  };
}
