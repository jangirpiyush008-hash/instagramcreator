// Face-based demographic inference from public profile pictures.
//
// AGGREGATE ONLY. This module returns per-image estimates, but the caller
// (core/data/audience-enrichment.ts) is responsible for aggregating them
// into audience percentages. We never expose per-individual results in
// tool output — only medians and distributions across the sample.
//
// Pluggable analyzer interface so we can swap providers (AWS Rekognition,
// DeepAI, Sightengine, self-hosted face-api.js) without touching callers.
// Default is MockFaceAnalyzer which returns "unknown" for every image —
// so the system works fine with zero external config; a signal simply
// isn't contributed until an analyzer is wired up.
//
// Bundling note: the AWS impl lives in face-analyzer-aws.ts and is
// LAZY-LOADED via dynamic import. That module imports `node:crypto` for
// the SigV4 signer, which webpack can't bundle for client chunks — the
// dynamic import keeps it out of the client bundle even though this file
// is transitively reachable from client components (via the tool
// registry → ScanResult).
//
// Enable AWS Rekognition by setting these env vars:
//   FACE_ANALYZER=aws
//   AWS_REGION=ap-south-1
//   AWS_ACCESS_KEY_ID=...
//   AWS_SECRET_ACCESS_KEY=...
// Cost: ~$0.001 per image. Cached 48h per URL so re-scans of active
// accounts pay near-zero.

export interface FaceResult {
  gender: "male" | "female" | null;
  genderConfidence: number;      // 0–1
  ageLow: number | null;
  ageHigh: number | null;
  ageBracket: "18-24" | "25-34" | "35-44" | "45+" | null;
  faceCount: number;             // 0 = no face detected
  provider: string;              // "mock" | "aws" | ...
}

export interface FaceAnalyzer {
  readonly name: string;
  analyze(imageUrl: string): Promise<FaceResult>;
}

// ── Mock (default when no env config) ───────────────────────────────────
export class MockFaceAnalyzer implements FaceAnalyzer {
  readonly name = "mock";
  async analyze(_imageUrl: string): Promise<FaceResult> {
    return {
      gender: null,
      genderConfidence: 0,
      ageLow: null,
      ageHigh: null,
      ageBracket: null,
      faceCount: 0,
      provider: "mock",
    };
  }
}

// ── Factory ─────────────────────────────────────────────────────────────
// Sync fast-path for the common case (no analyzer configured → mock).
// The AWS path is loaded via `getFaceAnalyzer()` (async, dynamic import)
// so `node:crypto` never lands in the client bundle.
let cached: FaceAnalyzer | null = null;

export async function getFaceAnalyzer(): Promise<FaceAnalyzer> {
  if (cached) return cached;
  const kind = process.env.FACE_ANALYZER;
  if (kind === "aws" && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    // Dynamic import — the aws module pulls in node:crypto which webpack
    // won't bundle into client chunks. Loading here (server-side only)
    // means client bundles never see it.
    const mod = await import("./face-analyzer-aws");
    cached = new mod.AwsRekognitionFaceAnalyzer();
  } else {
    cached = new MockFaceAnalyzer();
  }
  return cached;
}
