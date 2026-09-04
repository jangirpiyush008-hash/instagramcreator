// Authenticity scoring engine. Pure logic — no data fetching, no side
// effects. Takes normalized signals in, returns the five sub-scores and
// the overall Decode Score out. Kept separate from the tool run() and
// the React view so the weights can be tuned in one place.
//
// Spec rules baked in:
//   1. HIGH reach relative to followers is NEVER treated as fake by
//      itself. Reach and authenticity are orthogonal dimensions —
//      Instagram distributes reels beyond the follower base as a
//      normal product behavior. Only ENGAGEMENT quality on that reach
//      is evidence.
//   2. Paid content is separated from fake engagement — disclosed
//      sponsored content is neutral for authenticity.
//   3. Never fabricate a signal from missing data — every field carries
//      a "source" tag (verified/calculated/inferred/unknown) so the UI
//      can show "Insufficient data" instead of a made-up score.

import type { Post, Profile } from "@/core/data/adapter";
import type { CommentQualitySignal } from "./comment-quality";
import type { AdLibraryProbe } from "./ad-library";
import type { PaidSignalResult } from "./paid-signals";
import { classifyPaid } from "./paid-signals";
import type { BurstSignal } from "./burst-detection";
import type { LanguageSignal } from "./language-analysis";
import type { ProfileSignal } from "./profile-signals";

// ── Weights — surface so we can retune in one place ───────────────────
export const WEIGHTS = {
  decodeScore: {
    audience: 0.35,
    engagement: 0.35,
    reach: 0.30,
  },
  // Fraud penalty applied AFTER the weighted base score, before clamp.
  fraudPenalty: {
    Low: 0,
    Moderate: -5,
    Elevated: -15,
    High: -30,
  } as const,
} as const;

// ── Data-source label — surfaced in the UI so users see which score
//    is directly verified vs statistically inferred vs calculated from
//    public numbers. Never lie about the source.
export type DataSource = "verified" | "calculated" | "inferred" | "unknown";

export interface SubScore {
  score: number;               // 0-100
  label: string;               // "Strong" / "Moderate" / "Weak" / "Insufficient data"
  source: DataSource;
  confidencePct: number;       // 0-100
  reasons: string[];
}

export type FraudRisk = "Low" | "Moderate" | "Elevated" | "High" | "Insufficient data";

export interface FraudScore {
  risk: FraudRisk;
  confidencePct: number;
  reasons: string[];
  source: DataSource;
}

export type PaidClassification = "Verified Paid" | "Likely Paid" | "Likely Organic" | "Unknown";

export interface PaidScore {
  classification: PaidClassification;
  aggregatedScore: number;     // 0-100 across analyzed posts
  confidencePct: number;
  reasons: string[];
  paidPostCount: number;       // how many of the analyzed posts look paid
  totalPostsAnalyzed: number;
  source: DataSource;
}

export interface DecodeAnalysis {
  decodeScore: number;         // 0-100 overall
  decodeLabel: string;
  audience: SubScore;
  engagement: SubScore;
  reach: SubScore;
  paid: PaidScore;
  fraud: FraudScore;
  postsAnalyzed: number;
  commentsAnalyzed: number;
  followers: number;
  handle: string;
  methodology: string;
  caveats: string[];
}

export interface ScoringInputs {
  profile: Profile;
  posts: Post[];                           // most-recent posts (chronological or reverse — doesn't matter for stats)
  commentQuality: CommentQualitySignal;
  paidSignalsPerPost: PaidSignalResult[];  // parallel to posts (paidSignalsPerPost[i] is signals for posts[i])
  adLibrary: AdLibraryProbe | null;

  // v2 depth signals — all optional so the scoring engine still works
  // with a partial input set (unit tests, degraded fetches).
  burst?: BurstSignal | null;
  language?: LanguageSignal | null;
  profileSignals?: ProfileSignal | null;
  audienceCompletenessPct?: number | null;  // 0-100 — bio+avatar completeness across sampled commenters
  audienceSampleSize?: number;              // how many commenter profiles were sampled
}

// ── Helpers ───────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function labelForScore(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Moderate";
  if (score >= 35) return "Weak";
  return "Very weak";
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// ── Sub-score: AUDIENCE AUTHENTICITY ──────────────────────────────────
// "How healthy do the account's audience signals look — engagement rate,
// follow-back ratio, activity, verification, commenter profile completeness."
// NOT reach.
function scoreAudience(inputs: ScoringInputs): SubScore {
  const { profile, posts, audienceCompletenessPct, audienceSampleSize } = inputs;
  const followers = profile.followers ?? 0;
  const following = profile.following ?? 0;

  if (posts.length === 0) {
    return {
      score: 50,
      label: "Insufficient data",
      source: "unknown",
      confidencePct: 20,
      reasons: ["Account has no recent posts — audience signals cannot be verified"],
    };
  }

  const totals = posts.reduce(
    (a, p) => ({
      likes: a.likes + p.likes,
      comments: a.comments + p.comments,
    }),
    { likes: 0, comments: 0 },
  );
  const avgEngagement = (totals.likes + totals.comments) / posts.length;
  const erPct = followers > 0 ? (avgEngagement / followers) * 100 : 0;

  let score = 100;
  const reasons: string[] = [];

  // ER band. Deliberately generous — we're scoring AUDIENCE quality,
  // not virality, so a normal-ish ER on a normal-ish account should
  // hold near the ceiling.
  if (erPct >= 2.0) {
    reasons.push(`Engagement rate ${erPct.toFixed(2)}% is healthy for an account of this size`);
  } else if (erPct >= 0.8) {
    score -= 8;
    reasons.push(`Engagement rate ${erPct.toFixed(2)}% is slightly below the healthy 2%+ band`);
  } else if (erPct >= 0.3) {
    score -= 22;
    reasons.push(`Engagement rate ${erPct.toFixed(2)}% is low — some audience dilution likely`);
  } else if (followers >= 5000) {
    score -= 40;
    reasons.push(
      `Engagement rate ${erPct.toFixed(2)}% is very low for ${followers.toLocaleString()} followers — strong audience-quality flag`,
    );
  }

  // Follow-back patterns only meaningful on accounts >10K. Small
  // accounts naturally follow lots of people. Never touch reach or
  // views here — this is purely about the FOLLOWER GRAPH shape.
  if (followers > 10_000 && following > 0 && following / followers > 0.6) {
    score -= 12;
    reasons.push(
      `Following ${following.toLocaleString()} against ${followers.toLocaleString()} followers — growth-hack follow pattern`,
    );
  }
  if (followers > 10_000 && following === 0) {
    score -= 6;
    reasons.push("Follows nobody at scale — sometimes indicates a brand shell account");
  }

  // Verification at scale — not a hard-fail, just a supporting signal.
  if (followers >= 1_000_000 && !profile.verified) {
    score -= 4;
    reasons.push("Unverified at 1M+ scale — real creators typically get verified");
  } else if (profile.verified) {
    reasons.push("Verified account — supporting authenticity signal");
  }

  // Commenter profile-completeness — bio + custom avatar rate across a
  // sample of recent commenters. Real audiences sit at 60-90%; bot-heavy
  // audiences fall below 30% because the accounts are throwaway shells.
  if (audienceCompletenessPct !== null && audienceCompletenessPct !== undefined && (audienceSampleSize ?? 0) >= 5) {
    if (audienceCompletenessPct < 25) {
      score -= 20;
      reasons.push(
        `Only ${audienceCompletenessPct.toFixed(0)}% of ${audienceSampleSize} sampled commenters have both a bio and a custom avatar — bot-heavy audience`,
      );
    } else if (audienceCompletenessPct < 45) {
      score -= 8;
      reasons.push(
        `${audienceCompletenessPct.toFixed(0)}% of ${audienceSampleSize} sampled commenters have bio+avatar — below the healthy 60%+ band`,
      );
    } else if (audienceCompletenessPct >= 65) {
      reasons.push(
        `${audienceCompletenessPct.toFixed(0)}% of sampled commenters have populated profiles — healthy audience shape`,
      );
    }
  }

  score = clamp(score, 20, 100);

  return {
    score: Number(score.toFixed(1)),
    label: labelForScore(score),
    source: "calculated",
    confidencePct: posts.length >= 8 ? 82 : 65,
    reasons,
  };
}

// ── Sub-score: ENGAGEMENT QUALITY ─────────────────────────────────────
// How genuine the engagement (comments, like/comment ratio, comment
// substance) looks. This is the module where a bought-engagement pattern
// gets caught even when the raw ER looks normal.
function scoreEngagement(inputs: ScoringInputs): SubScore {
  const { posts, commentQuality, burst, language } = inputs;
  const reasons: string[] = [];

  if (posts.length === 0 || commentQuality.totalComments === 0) {
    return {
      score: 50,
      label: "Insufficient data",
      source: "unknown",
      confidencePct: 25,
      reasons: ["No comments available to analyze engagement quality"],
    };
  }

  // Start from the comment-quality score — that's the strongest signal.
  let score = commentQuality.score;
  reasons.push(...commentQuality.flags);

  // Cross-check: like/comment ratio anomaly. On IG, comments run ~1–5%
  // of likes on organic content. Ratios far above (comment-farm pump)
  // or far below (like-farm pump with no matching comment velocity)
  // are both suspicious.
  const totalLikes = posts.reduce((a, p) => a + p.likes, 0);
  const totalComments = posts.reduce((a, p) => a + p.comments, 0);
  if (totalLikes >= 200) {
    const cToLPct = (totalComments / totalLikes) * 100;
    if (cToLPct < 0.15 && totalLikes > 2000) {
      score -= 10;
      reasons.push(
        `Comments are only ${cToLPct.toFixed(2)}% of likes — very shallow engagement for the like volume`,
      );
    } else if (cToLPct > 25 && totalLikes > 2000) {
      score -= 8;
      reasons.push(
        `Comments are ${cToLPct.toFixed(0)}% of likes — unusually high (comment-pod pattern)`,
      );
    }
  }

  // Views-to-likes cross-check, only when at least some posts have
  // views (reels/videos). Bought view services pump views without
  // proportional likes — a healthy reel has likes/views around 3–10%.
  const postsWithViews = posts.filter((p) => typeof p.views === "number" && p.views > 100);
  if (postsWithViews.length >= 3) {
    const totalV = postsWithViews.reduce((a, p) => a + (p.views ?? 0), 0);
    const totalL = postsWithViews.reduce((a, p) => a + p.likes, 0);
    const likeRate = totalV > 0 ? (totalL / totalV) * 100 : 0;
    if (likeRate < 0.5 && totalV > 20_000) {
      score -= 15;
      reasons.push(
        `Only ${likeRate.toFixed(2)}% of viewers liked — well below the 3–10% healthy band. Views may be pumped.`,
      );
    } else if (likeRate >= 2.5) {
      // Reward the healthy case — nudge up.
      score = Math.min(100, score + 3);
    }
  }

  // v2: burst-timing signal. Bought comments arrive in tight bursts.
  if (burst?.available) {
    if (burst.score < 50) {
      score -= 15;
      if (burst.flag) reasons.push(burst.flag);
    } else if (burst.score < 70) {
      score -= 6;
      if (burst.flag) reasons.push(burst.flag);
    }
  }

  // v2: language-mismatch signal. Farm accounts leak away from the
  // creator's audience language when they buy cheap generic comments.
  if (language?.available && language.mismatch) {
    if (language.score < 60) {
      score -= 12;
      if (language.flag) reasons.push(language.flag);
    } else {
      score -= 5;
      if (language.flag) reasons.push(language.flag);
    }
  }

  score = clamp(score, 5, 100);

  return {
    score: Number(score.toFixed(1)),
    label: labelForScore(score),
    source: "inferred",
    confidencePct: commentQuality.totalComments >= 30 ? 78 : 55,
    reasons,
  };
}

// ── Sub-score: ORGANIC REACH STRENGTH ─────────────────────────────────
// How effectively content reaches BEYOND the follower base. This is a
// POSITIVE dimension: higher reach → higher score. The spec is emphatic
// that this alone is never evidence of fake activity.
function scoreReach(inputs: ScoringInputs): SubScore {
  const { profile, posts } = inputs;
  const followers = profile.followers ?? 0;

  const postsWithViews = posts.filter((p) => typeof p.views === "number" && p.views > 0);
  if (postsWithViews.length === 0) {
    return {
      score: 50,
      label: "Insufficient data",
      source: "unknown",
      confidencePct: 20,
      reasons: [
        "No video/reel content in recent posts — reach cannot be measured (image posts don't expose view count on Instagram)",
      ],
    };
  }

  if (followers < 100) {
    return {
      score: 50,
      label: "Insufficient data",
      source: "unknown",
      confidencePct: 30,
      reasons: ["Follower count too small to compute a meaningful reach ratio"],
    };
  }

  const views = postsWithViews.map((p) => p.views!);
  const medianViews = median(views);
  const maxViews = Math.max(...views);
  const viewsPerFollower = medianViews / followers;
  const maxViewsPerFollower = maxViews / followers;
  const reasons: string[] = [];

  // Reach scoring band. Anything at 1x+ of follower count is at least
  // reaching the base. 3x+ is genuinely strong distribution. 10x+ means
  // the algorithm is actively pushing this content.
  let score = 50;
  if (viewsPerFollower >= 5) {
    score = 95;
    reasons.push(
      `Median reel reaches ${viewsPerFollower.toFixed(1)}x the follower count — Instagram is distributing this content strongly beyond the base audience`,
    );
  } else if (viewsPerFollower >= 2) {
    score = 82;
    reasons.push(
      `Median reel reaches ${viewsPerFollower.toFixed(1)}x the follower count — healthy distribution beyond the base audience`,
    );
  } else if (viewsPerFollower >= 1) {
    score = 68;
    reasons.push(
      `Median reel reaches ${viewsPerFollower.toFixed(1)}x the follower count — reaching the full base plus some spillover`,
    );
  } else if (viewsPerFollower >= 0.4) {
    score = 52;
    reasons.push(
      `Median reel reaches ${(viewsPerFollower * 100).toFixed(0)}% of followers — modest reach, mostly within the base`,
    );
  } else {
    score = 32;
    reasons.push(
      `Median reel reaches only ${(viewsPerFollower * 100).toFixed(0)}% of followers — the algorithm isn't distributing this content widely`,
    );
  }

  if (maxViewsPerFollower >= 20 && maxViewsPerFollower > viewsPerFollower * 5) {
    reasons.push(
      `Top post hit ${maxViewsPerFollower.toFixed(0)}x follower count — a strong viral outlier (this is a good sign, not a red flag)`,
    );
  }

  return {
    score,
    label: labelForScore(score),
    source: "calculated",
    confidencePct: postsWithViews.length >= 5 ? 85 : 60,
    reasons,
  };
}

// ── Sub-score: PAID CONTENT PROBABILITY ───────────────────────────────
// Not a "quality" score — a descriptor. Never affects Decode Score
// directly. Disclosed sponsored content is neutral / mildly positive
// (transparency). Undisclosed high-signal content is what raises FRAUD
// risk elsewhere, not this score.
function scorePaid(inputs: ScoringInputs): PaidScore {
  const { paidSignalsPerPost, adLibrary, profileSignals } = inputs;
  const total = paidSignalsPerPost.length;

  if (total === 0) {
    return {
      classification: "Unknown",
      aggregatedScore: 0,
      confidencePct: 0,
      reasons: ["No posts available to analyze for paid signals"],
      paidPostCount: 0,
      totalPostsAnalyzed: 0,
      source: "unknown",
    };
  }

  const hasVerifiedFlag = paidSignalsPerPost.some((p) =>
    p.reasons.some((r) => r.includes("Branded Content")),
  );
  const hasCaptionData = paidSignalsPerPost.some((p) => p.reasons.length > 0);

  const scores = paidSignalsPerPost.map((p) => p.score);
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / total;
  const paidPostCount = scores.filter((s) => s >= 55).length;

  const reasons: string[] = [];
  const topReasons = new Set<string>();
  for (const p of paidSignalsPerPost) {
    for (const r of p.reasons) topReasons.add(r);
  }
  for (const r of Array.from(topReasons).slice(0, 6)) reasons.push(r);

  let boostBonus = 0;
  if (adLibrary?.available && adLibrary.hasActiveAds) {
    boostBonus = adLibrary.confidence === "verified" ? 15 : 6;
    reasons.push(
      adLibrary.confidence === "verified"
        ? "Meta Ad Library: account currently runs active paid campaigns (verified)"
        : "Meta Ad Library: possible active ads (hinted — needs manual confirmation)",
    );
  } else if (adLibrary?.available && adLibrary.hasActiveAds === false) {
    reasons.push("Meta Ad Library: no active Meta-served ads for this account");
  }

  // v2: bio + business-category commercial-intent baseline. Doesn't flag any
  // specific post — just lifts the prior a bit when the profile shape is
  // clearly commercial (bio: "DM for collabs", category: retail).
  let profileBaselineBonus = 0;
  if (profileSignals && profileSignals.commercialIntentScore >= 40) {
    profileBaselineBonus = Math.min(15, Math.round(profileSignals.commercialIntentScore / 8));
    if (profileSignals.reasons.length > 0) {
      reasons.push(`Profile shape: ${profileSignals.reasons[0]}`);
    }
  }

  const aggregated = Math.max(maxScore, avgScore * 1.2) + boostBonus + profileBaselineBonus;

  let source: DataSource = "inferred";
  if (hasVerifiedFlag || adLibrary?.confidence === "verified") source = "verified";
  else if (hasCaptionData) source = "inferred";
  else source = "unknown";

  const classification = classifyPaid(aggregated, hasVerifiedFlag, hasCaptionData);

  let confidencePct = 30;
  if (classification === "Verified Paid") confidencePct = 92;
  else if (classification === "Likely Paid") confidencePct = 68;
  else if (classification === "Likely Organic" && total >= 5) confidencePct = 72;
  else confidencePct = 45;

  return {
    classification,
    aggregatedScore: Number(Math.min(100, aggregated).toFixed(1)),
    confidencePct,
    reasons,
    paidPostCount,
    totalPostsAnalyzed: total,
    source,
  };
}

// ── Sub-score: FRAUD / SUSPICION RISK ─────────────────────────────────
// Composite risk score. HIGH reach alone is never fraud (spec rule).
// Fraud fires only when engagement quality is poor OR when audience
// signals contradict engagement signals.
function scoreFraud(
  inputs: ScoringInputs,
  audience: SubScore,
  engagement: SubScore,
): FraudScore {
  const { profile, posts, commentQuality, burst, language, audienceCompletenessPct, audienceSampleSize } = inputs;
  const followers = profile.followers ?? 0;

  if (posts.length === 0) {
    return {
      risk: "Insufficient data",
      confidencePct: 15,
      reasons: ["No recent posts to evaluate for fraud signals"],
      source: "unknown",
    };
  }

  const reasons: string[] = [];
  // Composite "badness" starts at 0 and accumulates.
  let badness = 0;

  // Strong signals
  if (commentQuality.totalComments >= 20) {
    if (commentQuality.repetitivePct >= 30) {
      badness += 30;
      reasons.push(`Comment-farm pattern: ${commentQuality.repetitivePct.toFixed(0)}% duplicate comments`);
    }
    if (commentQuality.botNamePct >= 25) {
      badness += 20;
      reasons.push(`${commentQuality.botNamePct.toFixed(0)}% of commenters have bot-shaped usernames`);
    }
  }

  // Big account + very low ER = bought audience
  if (followers >= 50_000 && audience.score <= 45) {
    badness += 20;
    reasons.push("Large account with very low engagement rate — bought or inflated followers likely");
  }

  // Cross-check: engagement quality contradicts raw engagement volume.
  // e.g. thousands of likes but nearly-empty comments AND bot usernames.
  if (engagement.score <= 40) {
    badness += 15;
    reasons.push("Engagement quality signals are consistently poor across sampled posts");
  }

  // Cross-check: views/likes divergence on video content
  const postsWithViews = posts.filter((p) => typeof p.views === "number" && (p.views ?? 0) > 20_000);
  if (postsWithViews.length >= 3) {
    const totalV = postsWithViews.reduce((a, p) => a + (p.views ?? 0), 0);
    const totalL = postsWithViews.reduce((a, p) => a + p.likes, 0);
    const likeRate = totalV > 0 ? (totalL / totalV) * 100 : 0;
    if (likeRate < 0.3) {
      badness += 15;
      reasons.push(
        `Only ${likeRate.toFixed(2)}% of viewers liked across recent reels — pumped-view pattern`,
      );
    }
  }

  // v2: burst pattern. A tight comment burst on a scan with otherwise
  // healthy numbers is corroborating evidence — small nudge.
  if (burst?.available && burst.score < 50 && burst.flag) {
    badness += 12;
    reasons.push(burst.flag);
  }

  // v2: language mismatch — strong corroborating signal when severe.
  if (language?.available && language.mismatch && language.score < 55 && language.flag) {
    badness += 10;
    reasons.push(language.flag);
  }

  // v2: very low commenter profile completeness on a big account = bot
  // farm audience.
  if (
    audienceCompletenessPct !== null &&
    audienceCompletenessPct !== undefined &&
    (audienceSampleSize ?? 0) >= 8 &&
    audienceCompletenessPct < 25 &&
    followers >= 20_000
  ) {
    badness += 15;
    reasons.push(
      `Only ${audienceCompletenessPct.toFixed(0)}% of sampled commenters have populated profiles — bot-farm audience shape`,
    );
  }

  let risk: FraudRisk;
  if (badness >= 55) risk = "High";
  else if (badness >= 30) risk = "Elevated";
  else if (badness >= 12) risk = "Moderate";
  else risk = "Low";

  if (reasons.length === 0) {
    reasons.push("No suspicious patterns detected across audience or engagement signals");
  }

  return {
    risk,
    confidencePct: commentQuality.totalComments >= 20 && posts.length >= 6 ? 78 : 55,
    reasons,
    source: "inferred",
  };
}

// ── Top-level score assembly ──────────────────────────────────────────
export function computeAnalysis(inputs: ScoringInputs): DecodeAnalysis {
  const audience = scoreAudience(inputs);
  const engagement = scoreEngagement(inputs);
  const reach = scoreReach(inputs);
  const paid = scorePaid(inputs);
  const fraud = scoreFraud(inputs, audience, engagement);

  // Decode Score: weighted average of the three quality dimensions,
  // then fraud penalty. Paid probability does NOT enter the formula —
  // being sponsored is not a defect.
  const base =
    audience.score * WEIGHTS.decodeScore.audience +
    engagement.score * WEIGHTS.decodeScore.engagement +
    reach.score * WEIGHTS.decodeScore.reach;

  const fraudDelta =
    fraud.risk === "Insufficient data"
      ? 0
      : WEIGHTS.fraudPenalty[fraud.risk as keyof typeof WEIGHTS.fraudPenalty];

  const decodeScore = Number(clamp(base + fraudDelta, 5, 100).toFixed(1));

  const caveats: string[] = [];
  if (inputs.commentQuality.totalComments < 20) {
    caveats.push(
      "Comment sample is small — engagement-quality confidence is reduced. Analyzing more posts would sharpen it.",
    );
  }
  if (inputs.posts.length < 6) {
    caveats.push(
      "Only a few recent posts were available — historical baseline is thin, so outlier detection is limited.",
    );
  }
  if (!inputs.adLibrary?.available) {
    caveats.push(
      "Meta Ad Library check returned insufficient data — paid distribution (boost) status not verified from Meta directly. Caption-level paid signals still applied.",
    );
  }
  if (inputs.profile.followers < 500) {
    caveats.push(
      "Follower count is very low — most ratio-based signals need more data to be meaningful.",
    );
  }

  const methodology = [
    "Decode Score is a weighted composite of Audience Authenticity (35%), Engagement Quality (35%), and Organic Reach Strength (30%), with a fraud-risk penalty applied last.",
    "High reach relative to follower count is treated as a POSITIVE reach signal — never as fake evidence.",
    "Paid content is a descriptor, not a defect: disclosed sponsored content does not reduce Decode Score.",
    "Every score field carries a data-source tag (verified / calculated / inferred). Fields marked 'Insufficient data' are honest — no score is fabricated from missing signals.",
  ].join(" ");

  return {
    decodeScore,
    decodeLabel: labelForScore(decodeScore),
    audience,
    engagement,
    reach,
    paid,
    fraud,
    postsAnalyzed: inputs.posts.length,
    commentsAnalyzed: inputs.commentQuality.totalComments,
    followers: inputs.profile.followers ?? 0,
    handle: inputs.profile.handle,
    methodology,
    caveats,
  };
}
