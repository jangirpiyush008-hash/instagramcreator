import type { SocialTool } from "../types";
import { enrichCommentAudience } from "@/core/data/audience-enrichment";
import { getFaceAnalyzer } from "@/core/data/face-analyzer";
import { adapterFor } from "@/core/data/router";

// Audience gender + age split from public commenter profiles.
//
// Pipeline (per commenter, orchestrated in core/data/audience-enrichment):
//   1. Bio parse   — pronouns / gendered self-descriptors / age hints. Strongest.
//   2. Face API    — profile-picture demographic estimate. Opt-in via env.
//   3. Name dict   — first-name → gender heuristic. Weakest, always-on fallback.
//
// AGGREGATE ONLY. Individual results never leak out — the view renders
// audience percentages + age brackets + confidence, never per-person data.
//
// Honesty guarantee: if the sample fails or too few profiles are usable,
// we return insufficientData:true and null percentages — no fake splits.

const SAMPLE_TARGET_COMMENTS = 500;   // fetch this many recent comments to dedupe from
const ENRICHMENT_CAP = 25;            // then enrich at most this many unique profiles
const MIN_KNOWN = 4;                  // publish once we've resolved this many genders
                                      // (small samples get a "low" confidence label rather than
                                      // being hidden — HikerAPI's comment endpoint returns 50
                                      // per post which typically dedupes to 10-15 unique users)

export const genderSplit: SocialTool = {
  id: "gender-split",
  name: "Audience Gender & Age",
  intentLabel: "Who is this creator's audience?",
  blurb:
    "Estimate audience gender split and age brackets from public commenter profiles. Bio pronouns, self-descriptors, and (when configured) profile-picture inference.",
  platforms: ["instagram", "tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "audience-demographics",
    title: "Audience Gender & Age Split — Instagram, TikTok & YouTube",
    description:
      "Estimate any public account's audience gender split and age brackets from public profile data.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);
    const isYouTube = platform === "youtube";

    // Sample recent commenters. YT: falls through commentThreads API.
    // IG/TT: uses recent-post comments.
    let comments: { username: string; text: string; postedAt: string; id: string }[] = [];
    try {
      const res = await data.getRecentComments(platform, handle, SAMPLE_TARGET_COMMENTS);
      comments = res.comments ?? [];
    } catch (e) {
      console.warn("[gender-split] comment fetch failed:", e instanceof Error ? e.message : e);
    }

    if (comments.length === 0) {
      const faceAnalyzer = (await getFaceAnalyzer()).name;
      return {
        toolId: "gender-split",
        platform,
        handle,
        free: {
          followers: profile.followers,
          insufficientData: true,
          reason:
            "Couldn't fetch any recent commenters for this account. Comments may be disabled, or there are no recent posts.",
          malePct: null,
          femalePct: null,
          commentsFetched: 0,
          faceAnalyzer,
          methodology: METHODOLOGY,
          caveat: isYouTube ? YT_CAVEAT : undefined,
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

    // Reuse the same adapter the caller passed in (already CachedAdapter-wrapped
    // via executeScan). Falls back to a fresh adapter on the rare direct call.
    const adapterForEnrichment = data ?? adapterFor(platform);

    const audience = await enrichCommentAudience(
      platform,
      adapterForEnrichment,
      comments,
      { maxProfiles: ENRICHMENT_CAP },
    );

    const known = audience.malePct + audience.femalePct + audience.nonbinaryPct;
    if (known < (MIN_KNOWN / audience.sampleSize) * 100) {
      return {
        toolId: "gender-split",
        platform,
        handle,
        free: {
          followers: profile.followers,
          insufficientData: true,
          reason: `Sampled ${audience.sampleSize} commenter profiles but only resolved ${Math.round(
            (known / 100) * audience.sampleSize,
          )} genders — not enough to publish a reliable split. Comments fetched: ${comments.length}.`,
          malePct: null,
          femalePct: null,
          nonbinaryPct: null,
          ageBrackets: null,
          confidence: null,
          sampleSize: audience.sampleSize,
          profilesFetched: audience.profilesFetched,
          commentsFetched: comments.length,
          signalsUsed: audience.signalsUsed,
          faceAnalyzer: audience.faceAnalyzer,
          methodology: METHODOLOGY,
          caveat: isYouTube ? YT_CAVEAT : undefined,
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      toolId: "gender-split",
      platform,
      handle,
      free: {
        followers: profile.followers,
        insufficientData: false,
        malePct: audience.malePct,
        femalePct: audience.femalePct,
        nonbinaryPct: audience.nonbinaryPct,
        unknownPct: audience.unknownPct,
        ageBrackets: audience.ageBrackets,
        sampleSize: audience.sampleSize,
        profilesFetched: audience.profilesFetched,
        confidence: audience.confidence,
        signalsUsed: audience.signalsUsed,
        faceAnalyzer: audience.faceAnalyzer,
        profileCompletenessPct: audience.profileCompletenessPct,
        source: "commenters",
        diagnostics: audience.diagnostics,
        methodology: METHODOLOGY,
        caveat: isYouTube ? YT_CAVEAT : undefined,
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};

const METHODOLOGY =
  "We sample recent commenters, fetch each one's public profile, then combine three signals: (1) bio-text pronouns and self-descriptors (strongest — self-declared), (2) profile-picture demographic estimate when a face API is configured (aggregate only, never per-person), and (3) first-name dictionary lookup. Results are aggregate percentages — we never expose per-individual demographics. Sample capped at 25 profiles per scan to keep provider costs reasonable; cached 48h so re-scans of the same handle are near-zero cost.";

const YT_CAVEAT =
  "⚠️ Tentative on YouTube — YouTube Data API does NOT expose subscriber lists (only channel owners see demographics in Studio). We sample from recent commenters, which skews slightly toward the more engaged / opinionated slice of your audience. Treat as directional, not exact.";
