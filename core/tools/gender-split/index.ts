import type { SocialTool } from "../types";
import { classifyNamesLocal, extractFirstName } from "@/core/data/name-gender";
import type { FollowerLite } from "@/core/data/adapter";

// Real audience-gender estimate. Samples ~100 followers (public API), extracts
// their first names, classifies each against a curated in-repo dictionary of
// Indian + Western first names, aggregates.
//
// No external API — the dictionary lives at core/data/name-gender.ts and is
// extended by hand as we see missing names in real scans. Zero cost per call,
// zero rate limits, zero external dependencies.
//
// Fallback path: some accounts have their follower list blocked (private
// accounts, or providers that just don't expose it). In that case we fall
// back to sampling recent commenters — engaged-user bias but real signal.
//
// Honesty guarantee: if BOTH paths fail (or classify too few names), the
// tool returns null percentages and a "insufficient data" state — no fake
// splits shown as real. Bug we already fought once, never again.

const SAMPLE_TARGET = 100;
const MIN_CONFIDENT = 20; // don't publish a split from fewer than this many classifiable names

export const genderSplit: SocialTool = {
  id: "gender-split",
  name: "Audience Gender Split",
  intentLabel: "What's the male / female split?",
  blurb:
    "Estimate audience gender by classifying the first names of a follower sample. Free names-only, no biometric analysis.",
  platforms: ["instagram", "tiktok"],
  phase: 0,
  seo: {
    slug: "audience-demographics",
    title: "Audience Gender Split — Instagram & TikTok",
    description:
      "Estimate any public account's audience gender from public follower names.",
  },
  async run({ platform, handle, data }) {
    const profile = await data.getProfile(platform, handle);

    // 1) Try the follower list first — best sample.
    let source: "followers" | "commenters" | "none" = "none";
    let sample: FollowerLite[] = [];
    try {
      sample = await data.getFollowerSample(platform, handle, SAMPLE_TARGET);
      if (sample.length > 0) source = "followers";
    } catch (e) {
      console.warn("[gender-split] getFollowerSample failed:", e instanceof Error ? e.message : e);
    }

    // 2) Fallback to commenters if followers unavailable.
    if (sample.length === 0) {
      try {
        const commentsResult = await data.getRecentComments(platform, handle, SAMPLE_TARGET);
        sample = commentsResult.comments.map((c) => ({
          username: c.username,
          fullName: undefined, // comments don't include full name — we'll parse username as best-effort
        }));
        if (sample.length > 0) source = "commenters";
      } catch (e) {
        console.warn("[gender-split] getRecentComments fallback failed:", e instanceof Error ? e.message : e);
      }
    }

    if (sample.length === 0) {
      return {
        toolId: "gender-split",
        platform,
        handle,
        free: {
          followers: profile.followers,
          insufficientData: true,
          reason: "Couldn't fetch a follower or commenter sample for this account. The account may be private, hidden, or too new.",
          malePct: null,
          femalePct: null,
          unknownPct: null,
          source,
          methodology:
            "We classify audience gender by extracting first names from a public follower sample and looking each name up against our curated in-repo dictionary of Indian and Western first names. Never biometric, never a face scan, never an external API call.",
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

    // Extract first names. Prefer the `fullName` field when the API returned
    // it (IG usually does), otherwise try parsing the username as a fallback.
    const firstNames: string[] = [];
    for (const s of sample) {
      const fromFull = extractFirstName(s.fullName);
      const fromUser = extractFirstName(s.username?.replace(/[._\-]/g, " "));
      const name = fromFull ?? fromUser;
      if (name) firstNames.push(name);
    }

    const classifiableCount = firstNames.length;
    if (classifiableCount < MIN_CONFIDENT) {
      return {
        toolId: "gender-split",
        platform,
        handle,
        free: {
          followers: profile.followers,
          insufficientData: true,
          reason: `Only ${classifiableCount} classifiable first name${classifiableCount === 1 ? "" : "s"} out of ${sample.length} sampled — not enough to publish a reliable split.`,
          malePct: null,
          femalePct: null,
          unknownPct: null,
          sampleSize: sample.length,
          classifiableCount,
          source,
          methodology:
            "We classify audience gender by extracting first names from a public follower sample and looking each name up against our curated in-repo dictionary of Indian and Western first names. Never biometric, never a face scan, never an external API call.",
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

    const { aggregate, classified } = classifyNamesLocal(firstNames);
    const totalKnown = aggregate.male + aggregate.female;
    const malePct = totalKnown > 0 ? Number(((aggregate.male / totalKnown) * 100).toFixed(1)) : 0;
    const femalePct = totalKnown > 0 ? Number(((aggregate.female / totalKnown) * 100).toFixed(1)) : 0;
    const unknownPct = firstNames.length > 0
      ? Number(((aggregate.unknown / firstNames.length) * 100).toFixed(1))
      : 0;

    // Confidence label — a function of how many names we successfully classified
    // AND how well we sampled the audience overall.
    const confidence =
      totalKnown >= 60
        ? "High"
        : totalKnown >= 30
        ? "Medium"
        : "Low";

    return {
      toolId: "gender-split",
      platform,
      handle,
      free: {
        followers: profile.followers,
        insufficientData: false,
        malePct,
        femalePct,
        unknownPct,
        sampleSize: sample.length,
        classifiableCount,
        confidentClassifications: totalKnown,
        source,
        confidence,
        methodology:
          "We classify audience gender by extracting first names from a public follower sample and looking each name up against our curated in-repo dictionary of Indian and Western first names. Zero external API calls, zero biometric analysis. Names we don't recognise are counted as 'unclassified' (never guessed) and excluded from the M/F percentages. Binary M/F only — non-binary/trans audiences are not distinguished.",
        topClassifiedNames: classified
          .filter((c) => c.probability >= 0.85)
          .slice(0, 8)
          .map((c) => ({
            name: c.name,
            gender: c.gender,
            probability: c.probability,
          })),
      },
      locked: {},
      generatedAt: new Date().toISOString(),
    };
  },
};
