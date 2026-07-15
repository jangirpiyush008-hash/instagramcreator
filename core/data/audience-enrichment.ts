// Aggregate demographic enrichment from public commenter/follower profiles.
//
// Pipeline per person:
//   1. Try bio parse (strongest — self-declared pronouns / age)
//   2. Try face analysis if bio was inconclusive (mid-strength — visual estimate)
//   3. Fall back to first-name dictionary (weakest — cultural name lookup)
//
// Output is AGGREGATE ONLY. Callers get audience percentages and bracket
// distributions, never per-individual results. Tool views render only the
// aggregates + confidence + sample sizes.
//
// Cost control:
//   • Sample cap of 25 profiles per scan (configurable per tool).
//   • Individual profile fetches share the CachedAdapter's 48h cache, so
//     re-scans of an active handle mostly hit cache.
//   • Face analysis only runs when bio was inconclusive AND analyzer is
//     configured (env FACE_ANALYZER=aws with AWS creds).

import type { DataAdapter } from "./adapter";
import type { Platform } from "../types";
import type { CommentItem } from "./adapter";
import { parseBio, type BioSignals } from "./bio-parser";
import { getFaceAnalyzer } from "./face-analyzer";
import { classifyNamesLocal, extractFirstName } from "./name-gender";

export interface EnrichedAudience {
  sampleSize: number;
  profilesFetched: number;
  malePct: number;
  femalePct: number;
  nonbinaryPct: number;
  unknownPct: number;
  ageBrackets: {
    "18-24": number;
    "25-34": number;
    "35-44": number;
    "45+": number;
    unknown: number;
  };
  signalsUsed: {
    bio: number;         // count classified via bio
    face: number;        // count classified via face
    name: number;        // count classified via first-name dictionary
  };
  confidence: "high" | "medium" | "low";
  profileCompletenessPct: number; // 0-100 — % of sampled profiles with a bio + avatar
  faceAnalyzer: string;   // "mock" | "aws" | ...
}

interface EnrichmentOptions {
  maxProfiles?: number;        // default 25
  runFaceAnalysis?: boolean;   // default true (no-op if analyzer is 'mock')
}

// ────────────────────────────────────────────────────────────────────────

export async function enrichCommentAudience(
  platform: Platform,
  data: DataAdapter,
  comments: CommentItem[],
  opts: EnrichmentOptions = {},
): Promise<EnrichedAudience> {
  const maxProfiles = opts.maxProfiles ?? 25;
  const runFace = opts.runFaceAnalysis ?? true;
  // Async because face-analyzer.ts lazy-imports the AWS impl (keeps
  // node:crypto out of the client bundle). Mock path resolves instantly.
  const analyzer = await getFaceAnalyzer();

  // Dedupe by username — a user commenting 5 times still counts as one
  // audience member. Preserve first-seen order so the sample is
  // representative of the top-N most recent unique commenters.
  const seen = new Set<string>();
  const uniqueUsernames: string[] = [];
  for (const c of comments) {
    const u = c.username?.trim().toLowerCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    uniqueUsernames.push(c.username);
    if (uniqueUsernames.length >= maxProfiles) break;
  }

  // Fetch profiles in parallel. Each failure counts as "unknown" — we
  // never let one hidden/deleted account break the whole scan.
  const profiles = await Promise.all(
    uniqueUsernames.map(async (username) => {
      try {
        return { username, profile: await data.getProfile(platform, username) };
      } catch {
        return { username, profile: null };
      }
    }),
  );

  const counts = {
    male: 0, female: 0, nonbinary: 0, unknown: 0,
    bio: 0, face: 0, name: 0,
    with_bio: 0, with_avatar: 0,
  };
  const brackets = { "18-24": 0, "25-34": 0, "35-44": 0, "45+": 0, unknown: 0 };

  // Analyze each profile.
  for (const p of profiles) {
    if (!p.profile) {
      counts.unknown += 1;
      brackets.unknown += 1;
      continue;
    }
    if (p.profile.bio) counts.with_bio += 1;
    if (p.profile.avatarUrl) counts.with_avatar += 1;

    let assignedGender: "male" | "female" | "nonbinary" | null = null;
    let assignedBracket: "18-24" | "25-34" | "35-44" | "45+" | null = null;

    // 1. Bio — strongest signal (self-declared).
    const bio: BioSignals = parseBio(p.profile.bio);
    if (bio.inferredGender && bio.genderConfidence !== "low") {
      assignedGender = bio.inferredGender;
      counts.bio += 1;
    }
    if (bio.inferredAgeBracket) {
      assignedBracket = bio.inferredAgeBracket;
    }

    // 2. Face — mid-strength, only when bio missed.
    if ((!assignedGender || !assignedBracket) && runFace && p.profile.avatarUrl) {
      try {
        const face = await analyzer.analyze(p.profile.avatarUrl);
        if (!assignedGender && face.gender && face.genderConfidence > 0.85) {
          assignedGender = face.gender;
          counts.face += 1;
        }
        if (!assignedBracket && face.ageBracket) {
          assignedBracket = face.ageBracket;
        }
      } catch {
        // face analysis is best-effort — never propagate an error.
      }
    }

    // 3. Name dictionary — weakest, last resort for gender only.
    if (!assignedGender) {
      const firstName =
        extractFirstName(p.profile.displayName) ??
        extractFirstName(p.username?.replace(/[._\-]/g, " "));
      if (firstName) {
        const { classified } = classifyNamesLocal([firstName]);
        const c = classified[0];
        if (c && c.gender && c.probability >= 0.85) {
          assignedGender = c.gender;
          counts.name += 1;
        }
      }
    }

    // Tally into aggregates.
    if (assignedGender === "male") counts.male += 1;
    else if (assignedGender === "female") counts.female += 1;
    else if (assignedGender === "nonbinary") counts.nonbinary += 1;
    else counts.unknown += 1;

    if (assignedBracket) brackets[assignedBracket] += 1;
    else brackets.unknown += 1;
  }

  const total = profiles.length || 1;
  const genderKnown = counts.male + counts.female + counts.nonbinary;
  const pct = (n: number) => Number(((n / total) * 100).toFixed(1));

  // Confidence: high if >50% of sample gave any signal, medium if >25%,
  // low otherwise. Also cap at medium when the sample itself is <10.
  const knownPct = (genderKnown / total) * 100;
  let confidence: "high" | "medium" | "low" =
    knownPct >= 50 ? "high" : knownPct >= 25 ? "medium" : "low";
  if (total < 10) confidence = confidence === "high" ? "medium" : "low";

  return {
    sampleSize: total,
    profilesFetched: profiles.filter((p) => p.profile).length,
    malePct: pct(counts.male),
    femalePct: pct(counts.female),
    nonbinaryPct: pct(counts.nonbinary),
    unknownPct: pct(counts.unknown),
    ageBrackets: {
      "18-24": pct(brackets["18-24"]),
      "25-34": pct(brackets["25-34"]),
      "35-44": pct(brackets["35-44"]),
      "45+": pct(brackets["45+"]),
      unknown: pct(brackets.unknown),
    },
    signalsUsed: { bio: counts.bio, face: counts.face, name: counts.name },
    confidence,
    profileCompletenessPct: Number(((counts.with_bio + counts.with_avatar) / (2 * total) * 100).toFixed(1)),
    faceAnalyzer: analyzer.name,
  };
}
