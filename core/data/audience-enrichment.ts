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
//   • Prefer INLINE commenter data (avatar, full name) that the comment
//     API returns for free. Only call getProfile as a fallback when we
//     need the bio (which comment responses don't include).
//   • Individual profile fetches share the CachedAdapter's 48h cache, so
//     re-scans of an active handle mostly hit cache.
//   • Face analysis only runs when we have a usable avatar URL AND the
//     analyzer is configured (env FACE_ANALYZER=aws with AWS creds).

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
  // Diagnostic counters exposed on every response — cheap to compute
  // and invaluable for debugging "why is bio/face returning 0?" without
  // needing Railway log access.
  diagnostics?: {
    profilesWithBio: number;         // # commenters we retrieved a bio for
    profilesWithAvatar: number;      // # commenters we got an avatarUrl for
    bioTried: number;                // # bios we ran through parseBio
    bioSignalFound: number;          // # where parseBio returned a gender
    faceTried: number;               // # times we called analyzer.analyze()
    faceDetected: number;            // # where Rekognition found a face
    faceGenderClassified: number;    // # where we accepted the gender (>0.6)
    sampleAvatarUrl?: string;        // first non-null avatarUrl (for URL debugging)
    sampleBio?: string;              // first non-null bio, truncated to 120 chars
  };
}

interface EnrichmentOptions {
  maxProfiles?: number;        // default 25
  runFaceAnalysis?: boolean;   // default true (no-op if analyzer is 'mock')
}

// Internal per-person record.
interface Enrichee {
  username: string;
  fullName?: string;
  avatarUrl?: string;
  bio?: string;
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

  // Dedupe by username, seed with the inline metadata that the comment
  // response already provided.
  const seen = new Map<string, Enrichee>();
  for (const c of comments) {
    const u = c.username?.trim().toLowerCase();
    if (!u || seen.has(u)) continue;
    seen.set(u, {
      username: c.username,
      fullName: c.fullName,
      avatarUrl: c.avatarUrl,
    });
    if (seen.size >= maxProfiles) break;
  }
  const enrichees = Array.from(seen.values());

  // Fetch commenter info — prefer the LOOSE getCommenterInfo path when
  // the adapter implements it. That path skips the strict wrong-account
  // guard AND the PrivateAccountError throw, both of which are correct
  // for the main scan target but drop 60%+ of commenters when applied to
  // enrichment. Falls back to getProfile for adapters that haven't
  // implemented the loose method yet.
  await Promise.all(
    enrichees.map(async (e) => {
      if (data.getCommenterInfo) {
        try {
          const info = await data.getCommenterInfo(platform, e.username);
          if (info.bio) e.bio = info.bio;
          if (!e.avatarUrl && info.avatarUrl) e.avatarUrl = info.avatarUrl;
          if (!e.fullName && info.fullName) e.fullName = info.fullName;
        } catch (err) {
          if (process.env.DEBUG_ENRICHMENT === "1") {
            console.warn(
              `[enrichment] getCommenterInfo failed for ${e.username}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
        return;
      }
      // Legacy fallback for adapters without loose lookup.
      try {
        const p = await data.getProfile(platform, e.username);
        e.bio = p.bio;
        if (!e.avatarUrl) e.avatarUrl = p.avatarUrl;
        if (!e.fullName) e.fullName = p.displayName;
      } catch (err) {
        if (process.env.DEBUG_ENRICHMENT === "1") {
          console.warn(
            `[enrichment] getProfile failed for ${e.username}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }),
  );

  const counts = {
    male: 0, female: 0, nonbinary: 0, unknown: 0,
    bio: 0, face: 0, name: 0,
    with_bio: 0, with_avatar: 0,
    // Diagnostic counters — exposed on the API response so we don't
    // need Railway log access to debug why a signal is returning zero.
    bioTried: 0, bioSignalFound: 0,
    faceTried: 0, faceDetected: 0, faceGenderClassified: 0,
  };
  const brackets = { "18-24": 0, "25-34": 0, "35-44": 0, "45+": 0, unknown: 0 };
  let sampleAvatarUrl: string | undefined;
  let sampleBio: string | undefined;

  for (const e of enrichees) {
    if (e.bio) {
      counts.with_bio += 1;
      if (!sampleBio) sampleBio = e.bio.slice(0, 120);
    }
    if (e.avatarUrl) {
      counts.with_avatar += 1;
      if (!sampleAvatarUrl) sampleAvatarUrl = e.avatarUrl;
    }

    let assignedGender: "male" | "female" | "nonbinary" | null = null;
    let assignedBracket: "18-24" | "25-34" | "35-44" | "45+" | null = null;

    // 1. Bio — strongest signal (self-declared). Only available when the
    //    getProfile / getCommenterInfo call returned a bio.
    if (e.bio) {
      counts.bioTried += 1;
      const bio: BioSignals = parseBio(e.bio);
      if (bio.inferredGender && bio.genderConfidence !== "low") {
        assignedGender = bio.inferredGender;
        counts.bio += 1;
        counts.bioSignalFound += 1;
      }
      if (bio.inferredAgeBracket) assignedBracket = bio.inferredAgeBracket;
    }

    // 2. Face — mid-strength, only when bio missed AND we have an avatar
    //    AND an analyzer is configured.
    if ((!assignedGender || !assignedBracket) && runFace && e.avatarUrl) {
      counts.faceTried += 1;
      try {
        const face = await analyzer.analyze(e.avatarUrl);
        if (face.faceCount > 0) counts.faceDetected += 1;
        // Rekognition typically returns 0.7-0.95 for clear faces; 0.6 is
        // our floor. Below that, treat as unresolved rather than guess.
        if (!assignedGender && face.gender && face.genderConfidence > 0.6) {
          assignedGender = face.gender;
          counts.face += 1;
          counts.faceGenderClassified += 1;
        }
        if (!assignedBracket && face.ageBracket) {
          assignedBracket = face.ageBracket;
        }
      } catch {
        // face analysis is best-effort — never propagate an error.
      }
    }

    // 3. Name dictionary — weakest. Prefer the full name (real human name)
    //    when available; fall back to parsing the username.
    if (!assignedGender) {
      const firstName =
        extractFirstName(e.fullName) ??
        extractFirstName(e.username?.replace(/[._\-]/g, " "));
      if (firstName) {
        const { classified } = classifyNamesLocal([firstName]);
        const c = classified[0];
        if (c && c.gender && c.probability >= 0.85) {
          assignedGender = c.gender;
          counts.name += 1;
        }
      }
    }

    if (assignedGender === "male") counts.male += 1;
    else if (assignedGender === "female") counts.female += 1;
    else if (assignedGender === "nonbinary") counts.nonbinary += 1;
    else counts.unknown += 1;

    if (assignedBracket) brackets[assignedBracket] += 1;
    else brackets.unknown += 1;
  }

  const total = enrichees.length || 1;
  const genderKnown = counts.male + counts.female + counts.nonbinary;
  const pct = (n: number) => Number(((n / total) * 100).toFixed(1));

  const knownPct = (genderKnown / total) * 100;
  let confidence: "high" | "medium" | "low" =
    knownPct >= 50 ? "high" : knownPct >= 25 ? "medium" : "low";
  if (total < 10) confidence = confidence === "high" ? "medium" : "low";

  return {
    sampleSize: total,
    // "profilesFetched" now means "how many people we had EITHER inline
    // data OR a resolved profile for" — with the inline-first path this
    // is normally equal to sampleSize.
    profilesFetched: enrichees.filter((e) => e.avatarUrl || e.fullName || e.bio).length,
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
    diagnostics: {
      profilesWithBio: counts.with_bio,
      profilesWithAvatar: counts.with_avatar,
      bioTried: counts.bioTried,
      bioSignalFound: counts.bioSignalFound,
      faceTried: counts.faceTried,
      faceDetected: counts.faceDetected,
      faceGenderClassified: counts.faceGenderClassified,
      sampleAvatarUrl,
      sampleBio,
    },
  };
}
