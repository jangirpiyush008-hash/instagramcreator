// Authenticity Analyzer — flagship tool. Takes an Instagram handle
// (or profile URL, which is normalized to a handle by the executor)
// and returns a multi-signal Decode Score plus five orthogonal
// sub-scores: audience, engagement, reach, paid-content, fraud.
//
// This is the SocialTool run() glue only. All logic lives in the
// sibling modules (scoring / comment-quality / paid-signals / ad-
// library) so the weights and heuristics stay unit-testable and
// tunable in one place.
//
// MVP scope note: analyzes the profile + last 12 posts + top-post
// comments. Post/reel-URL specific analysis (paste ONE reel URL, get
// scores just for THAT reel) needs a getMediaByShortcode adapter
// method that doesn't exist yet — that's the v2 slot.

import type { SocialTool } from "../types";
import type { CommentItem, Post } from "@/core/data/adapter";
import { analyzeCommentQuality } from "./comment-quality";
import { analyzePaidSignals } from "./paid-signals";
import { probeAdLibrary } from "./ad-library";
import { computeAnalysis } from "./scoring";

const RECENT_POST_COUNT = 12;
const COMMENT_SAMPLE_SIZE = 100;

export const authenticityAnalyzer: SocialTool = {
  id: "authenticity-analyzer",
  name: "Authenticity Analyzer",
  intentLabel: "Real, fake, or paid? Decode the reach.",
  blurb:
    "Multi-signal analysis of a creator's authenticity — audience quality, engagement authenticity, organic reach strength, paid content, and fraud risk. High reach beyond the follower base is treated as a positive signal, never as fake evidence.",
  platforms: ["instagram"],
  phase: 0,
  seo: {
    slug: "authenticity-analyzer",
    title: "Instagram Authenticity Analyzer — Real, Fake, or Paid Reach",
    description:
      "Decode any Instagram creator: audience authenticity, engagement quality, organic reach strength, paid-content detection, and fraud risk — with explanations for every score.",
  },
  async run({ platform, handle, data }) {
    if (platform !== "instagram") {
      throw new Error("Authenticity Analyzer currently supports Instagram only");
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
    // Runs on every post's caption. Cheap — pure regex work — so we
    // process all fetched posts, not just a few.
    const paidSignalsPerPost = posts.map((p) =>
      analyzePaidSignals(p.caption ?? "", detectPaidPartnershipFlag(p)),
    );

    // ── 3. Comment-quality aggregate ────────────────────────────────
    const commentQuality = analyzeCommentQuality(commentsResult.comments);

    // ── 4. Scoring — pure function, no more fetches ─────────────────
    const analysis = computeAnalysis({
      profile,
      posts,
      commentQuality,
      paidSignalsPerPost,
      adLibrary,
    });

    // ── 5. Package as ToolResult ────────────────────────────────────
    // Everything in `free` — this tool is a premium experience whose
    // value is the score explanation itself. Gating individual reasons
    // behind a blur would gut the utility. Paywall on scan quota,
    // not on the payload.
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

        // Five sub-scores
        audience: analysis.audience,
        engagement: analysis.engagement,
        reach: analysis.reach,
        paid: analysis.paid,
        fraud: analysis.fraud,

        // Data-source transparency
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

        // Sampled paid-signal detail for the UI to show WHY a post
        // was flagged. Keep just the ones with score > 0.
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
