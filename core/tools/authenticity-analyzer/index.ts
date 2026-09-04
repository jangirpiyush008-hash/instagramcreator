// Authenticity Analyzer — flagship tool. Takes an Instagram handle
// (or profile URL, which is normalized to a handle by the executor)
// and returns a multi-signal Decode Score plus five orthogonal
// sub-scores: audience, engagement, reach, paid-content, fraud.
// v2 also emits a Final Verdict (the one-line partner/don't-partner
// call) and a Brand Deal Fit recommendation (which collab structure
// suits this creator, plus a rough INR rate benchmark).
//
// This is the SocialTool run() glue only. All heuristics live in the
// sibling modules (scoring / comment-quality / paid-signals / ad-
// library / burst-detection / language-analysis / profile-signals /
// verdict / brand-fit) so nothing gets buried inside a React view.
//
// Cache policy: 5-minute per-tool TTL (300 s). The default 48h cache
// was returning the same verdict on every scan (users saw "same result,
// no credit drained"). Fully skipping the cache instead burned Ensemble-
// data quota on every double-click and pushed us into upstream rate-
// limits. 5 min splits the difference: rapid repeat-scans of the same
// handle debounce for free (no provider burn, no credit charge), but
// any real re-visit after 5 min triggers a fresh scan + real credit.
// The read path caps max age at 5 min too, so pre-change 48h rows
// don't leak stale results.

import type { SocialTool } from "../types";
import type { CommentItem, Post } from "@/core/data/adapter";
import { analyzeCommentQuality } from "./comment-quality";
import { analyzePaidSignals } from "./paid-signals";
import { probeAdLibrary } from "./ad-library";
import { computeAnalysis } from "./scoring";
import { analyzeCommentBursts } from "./burst-detection";
import { analyzeCommentLanguage } from "./language-analysis";
import { analyzeProfileSignals } from "./profile-signals";
import { computeVerdict } from "./verdict";
import { computeBrandFit } from "./brand-fit";
import { enrichCommentAudience } from "@/core/data/audience-enrichment";
import { RESERVED_HANDLE_PATHS } from "@/core/utils/handle";
import { HandleNotFoundError } from "@/core/utils/errors";

const RECENT_POST_COUNT = 24;              // was 12 — bigger baseline for outlier detection
const COMMENT_SAMPLE_SIZE = 120;
// Cut from 15 → 8. Each sampled profile is an extra Ensembledata call —
// 15 was pushing scan cost to ~18 provider calls and burning quota. 8 is
// still statistically usable (fake-follower uses the same signal at 15
// but this tool has 6 other corroborating signals to lean on).
const AUDIENCE_ENRICHMENT_SAMPLE = 8;

export const authenticityAnalyzer: SocialTool = {
  id: "authenticity-analyzer",
  name: "Authenticity Analyzer",
  intentLabel: "Real, fake, or paid? Decode the reach.",
  blurb:
    "Multi-signal analysis of a creator's authenticity — audience quality, engagement authenticity, organic reach strength, paid content, and fraud risk. Ships a Final Verdict + Brand Deal Fit call at the top. High reach beyond the follower base is treated as a positive signal, never as fake evidence.",
  platforms: ["instagram"],
  phase: 0,
  cacheTtlSeconds: 300,   // 5-minute debounce — see file header
  seo: {
    slug: "authenticity-analyzer",
    title: "Instagram Authenticity Analyzer — Real, Fake, or Paid Reach",
    description:
      "Decode any Instagram creator: audience authenticity, engagement quality, organic reach strength, paid-content detection, fraud risk, plus a final verdict and brand-deal fit — with explanations for every score.",
  },
  async run({ platform, handle, data }) {
    if (platform !== "instagram") {
      throw new Error("Authenticity Analyzer currently supports Instagram only");
    }

    // Defense in depth: reserved platform paths (e.g. "reel", "p", "tv")
    // strip out of a reel/post URL and look like a handle. If one slips
    // past client-side validation, reject BEFORE we hit the provider —
    // otherwise we burn a call on a user that doesn't exist and surface
    // as a misleading "rate-limited" via the chain circuit-breaker.
    // Client-side validation already gives the user the helpful "paste a
    // profile URL" message; this server-side guard is just belt-and-
    // suspenders so a direct API call can't burn quota either.
    if (RESERVED_HANDLE_PATHS.has(handle.toLowerCase())) {
      throw new HandleNotFoundError(handle, platform);
    }

    // ── 1. Fan-out fetches ──────────────────────────────────────────
    // Profile + recent posts share Ensembledata's detailed-info cache
    // internally (single upstream call). Comments is a separate call.
    // Ad Library probe runs in parallel and never throws.
    const [profile, posts, commentsResult, adLibrary] = await Promise.all([
      data.getProfile(platform, handle),
      data.getRecentPosts(platform, handle, RECENT_POST_COUNT),
      data
        .getRecentComments(platform, handle, COMMENT_SAMPLE_SIZE)
        .catch(() => ({ post: null as Post | null, comments: [] as CommentItem[] })),
      probeAdLibrary(handle).catch(() => null),
    ]);

    // ── 2. Per-post paid-signal extraction ──────────────────────────
    const paidSignalsPerPost = posts.map((p) =>
      analyzePaidSignals(p.caption ?? "", detectPaidPartnershipFlag(p)),
    );

    // ── 3. Comment-quality aggregate ────────────────────────────────
    const commentQuality = analyzeCommentQuality(commentsResult.comments);

    // ── 4. v2 depth signals — all defensive, never throw ────────────
    const burst = safelyRun(() => analyzeCommentBursts(commentsResult.comments), null);
    const captionForLanguage = commentsResult.post?.caption ?? null;
    const language = safelyRun(
      () => analyzeCommentLanguage(commentsResult.comments, captionForLanguage),
      null,
    );
    const profileSignals = safelyRun(() => analyzeProfileSignals(profile), null);

    // Audience enrichment — sample commenter profiles for bio+avatar
    // completeness. Cheap; skips face analysis. Fails silently — a
    // provider blip on this call shouldn't kill the whole scan.
    let audienceCompletenessPct: number | null = null;
    let audienceSampleSize = 0;
    if (commentsResult.comments.length > 0) {
      try {
        const aud = await enrichCommentAudience(platform, data, commentsResult.comments, {
          maxProfiles: AUDIENCE_ENRICHMENT_SAMPLE,
          runFaceAnalysis: false,
        });
        audienceCompletenessPct = aud.profileCompletenessPct;
        audienceSampleSize = aud.profilesFetched;
      } catch (e) {
        console.warn(
          "[authenticity-analyzer] audience enrichment failed:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // ── 5. Scoring — pure function, no more fetches ─────────────────
    const analysis = computeAnalysis({
      profile,
      posts,
      commentQuality,
      paidSignalsPerPost,
      adLibrary,
      burst,
      language,
      profileSignals,
      audienceCompletenessPct,
      audienceSampleSize,
    });

    // ── 6. Final Verdict + Brand Deal Fit ───────────────────────────
    // Both derived from the completed analysis. Kept OUT of the
    // scoring engine so users can see the raw scores unaltered.
    const emptyProfileSignals =
      profileSignals ?? {
        isBusinessAccount: false,
        businessCategory: null,
        bioCommercialHits: [],
        bioBrandOfficialHit: false,
        commercialIntentScore: 0,
        reasons: [],
      };
    const verdict = computeVerdict(analysis, emptyProfileSignals);
    const brandFit = computeBrandFit(profile, analysis, emptyProfileSignals);

    // ── 7. Package as ToolResult ────────────────────────────────────
    return {
      toolId: "authenticity-analyzer",
      platform,
      handle: profile.handle,
      free: {
        // Header
        decodeScore: analysis.decodeScore,
        decodeLabel: analysis.decodeLabel,
        followers: analysis.followers,
        postsAnalyzed: analysis.postsAnalyzed,
        commentsAnalyzed: analysis.commentsAnalyzed,
        verified: profile.verified,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,

        // v2 headline outputs — the two decisions a brand actually cares about
        verdict,
        brandFit,

        // Five sub-scores
        audience: analysis.audience,
        engagement: analysis.engagement,
        reach: analysis.reach,
        paid: analysis.paid,
        fraud: analysis.fraud,

        // Data-source transparency for the Ad Library probe
        adLibraryStatus: adLibrary
          ? {
              available: adLibrary.available,
              hasActiveAds: adLibrary.hasActiveAds,
              confidence: adLibrary.confidence,
              method: adLibrary.method,
              note: adLibrary.note ?? null,
            }
          : {
              available: false,
              hasActiveAds: null,
              confidence: "unknown",
              method: "probe-skipped",
              note: "Ad Library probe skipped",
            },

        // v2 depth-signal telemetry — surfaced so users can see WHY
        burstAnalysis: burst
          ? {
              available: burst.available,
              windowMinutes: burst.windowMinutes,
              peakConcentrationPct: burst.peakConcentrationPct,
              score: burst.score,
              flag: burst.flag,
            }
          : null,
        languageAnalysis: language
          ? {
              available: language.available,
              captionScript: language.captionScript,
              dominantCommentScript: language.dominantCommentScript,
              dominantSharePct: language.dominantSharePct,
              mismatch: language.mismatch,
              score: language.score,
              flag: language.flag,
            }
          : null,
        profileSignals: profileSignals
          ? {
              isBusinessAccount: profileSignals.isBusinessAccount,
              businessCategory: profileSignals.businessCategory,
              bioCommercialHits: profileSignals.bioCommercialHits,
              bioBrandOfficialHit: profileSignals.bioBrandOfficialHit,
              commercialIntentScore: profileSignals.commercialIntentScore,
              reasons: profileSignals.reasons,
            }
          : null,
        audienceEnrichment: {
          completenessPct: audienceCompletenessPct,
          sampleSize: audienceSampleSize,
        },

        // Sampled paid-signal detail
        paidSignalSamples: paidSignalsPerPost
          .map((p, i) => ({
            postIndex: i,
            postUrl: posts[i]?.permalink ?? null,
            score: p.score,
            discountCodes: p.discountCodeSamples,
            affiliateUrls: p.affiliateUrlSamples,
            brandTagCount: p.brandTagCount,
            sponsoredHashtags: p.sponsoredHashtags,
            promoCtas: p.promoCtaSamples,
            reasons: p.reasons,
          }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6),

        // Comment-quality breakdown for the UI
        commentQuality: {
          totalComments: commentQuality.totalComments,
          genericPct: commentQuality.genericPct,
          emojiOnlyPct: commentQuality.emojiOnlyPct,
          repetitivePct: commentQuality.repetitivePct,
          botNamePct: commentQuality.botNamePct,
          avgLength: commentQuality.avgLength,
          score: commentQuality.score,
        },

        caveats: analysis.caveats,
        methodology: analysis.methodology,
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};

// Small helper: run a synchronous side-effect-free heuristic that we don't
// want to blow up the whole tool if it throws. All the v2 depth signals
// are best-effort — a bug in one shouldn't kill the four other signals.
function safelyRun<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.warn(
      "[authenticity-analyzer] depth-signal failed, continuing:",
      e instanceof Error ? e.message : e,
    );
    return fallback;
  }
}

// Instagram's public data returns paid-partnership signal in a few
// shapes depending on the endpoint. Ensembledata's normalized Post
// doesn't currently carry it — this helper stays defensive so if the
// adapter starts surfacing it we pick it up without a code change.
function detectPaidPartnershipFlag(post: Post): boolean {
  const anyPost = post as unknown as {
    isPaidPartnership?: boolean;
    is_paid_partnership?: boolean;
    productType?: string;
  };
  if (anyPost.isPaidPartnership === true) return true;
  if (anyPost.is_paid_partnership === true) return true;
  if (anyPost.productType && anyPost.productType === "branded_content") return true;
  return false;
}
