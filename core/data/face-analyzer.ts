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
// Enable AWS Rekognition by setting these env vars:
//   FACE_ANALYZER=aws
//   AWS_REGION=ap-south-1
//   AWS_ACCESS_KEY_ID=...
//   AWS_SECRET_ACCESS_KEY=...
// Cost: ~$0.001 per image. Cached 48h per URL so re-scans of active
// accounts pay near-zero.

import crypto from "node:crypto";

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

// ── AWS Rekognition adapter (opt-in via env) ────────────────────────────
// Uses raw fetch + SigV4 auth so we don't add the aws-sdk dependency
// (~5MB) to the build. Only DetectFaces is called; no image data is
// stored, no collection is created, no identification happens.

interface RekognitionResp {
  FaceDetails?: Array<{
    AgeRange?: { Low: number; High: number };
    Gender?: { Value: "Male" | "Female"; Confidence: number };
  }>;
}

export class AwsRekognitionFaceAnalyzer implements FaceAnalyzer {
  readonly name = "aws";

  async analyze(imageUrl: string): Promise<FaceResult> {
    // Rekognition wants raw image bytes. Fetch the profile pic and pass
    // it inline; skip if the CDN blocks us or the image is missing.
    let bytes: Buffer;
    try {
      const r = await fetch(imageUrl, {
        // Hotlink some CDNs block without a UA. Use a plain browser UA.
        headers: { "user-agent": "Mozilla/5.0 (compatible; DecodeCreator/1.0)" },
      });
      if (!r.ok) return this.unknown();
      const ab = await r.arrayBuffer();
      bytes = Buffer.from(ab);
      // Rekognition caps at 5MB per image; profile pics are far under that
      // but sanity-check anyway.
      if (bytes.length > 4_500_000) return this.unknown();
    } catch {
      return this.unknown();
    }

    const region = process.env.AWS_REGION || "us-east-1";
    const service = "rekognition";
    const host = `${service}.${region}.amazonaws.com`;
    const target = "RekognitionService.DetectFaces";
    const body = JSON.stringify({
      Image: { Bytes: bytes.toString("base64") },
      Attributes: ["DEFAULT"], // returns Gender + AgeRange
    });

    const headers = await sigV4Headers({
      method: "POST",
      host,
      region,
      service,
      target,
      body,
    });

    let resp: Response;
    try {
      resp = await fetch(`https://${host}/`, { method: "POST", headers, body });
    } catch {
      return this.unknown();
    }
    if (!resp.ok) {
      // Rekognition returns 4xx for image-too-small / invalid image / etc.
      // Treat as unknown rather than throw — we don't want one bad avatar
      // to break the whole audience-enrichment pass.
      return this.unknown();
    }
    const json = (await resp.json()) as RekognitionResp;
    const face = json.FaceDetails?.[0];
    if (!face) return this.unknown();

    const gender: "male" | "female" | null =
      face.Gender?.Value === "Male" ? "male" : face.Gender?.Value === "Female" ? "female" : null;
    const conf = face.Gender ? face.Gender.Confidence / 100 : 0;
    const low = face.AgeRange?.Low ?? null;
    const high = face.AgeRange?.High ?? null;
    const mid = low !== null && high !== null ? Math.round((low + high) / 2) : null;
    const bracket = mid !== null ? ageBracket(mid) : null;

    return {
      gender,
      genderConfidence: conf,
      ageLow: low,
      ageHigh: high,
      ageBracket: bracket,
      faceCount: json.FaceDetails?.length ?? 0,
      provider: "aws",
    };
  }

  private unknown(): FaceResult {
    return {
      gender: null,
      genderConfidence: 0,
      ageLow: null,
      ageHigh: null,
      ageBracket: null,
      faceCount: 0,
      provider: "aws",
    };
  }
}

// ── Factory ─────────────────────────────────────────────────────────────
let cached: FaceAnalyzer | null = null;
export function getFaceAnalyzer(): FaceAnalyzer {
  if (cached) return cached;
  const kind = process.env.FACE_ANALYZER;
  if (kind === "aws" && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    cached = new AwsRekognitionFaceAnalyzer();
  } else {
    cached = new MockFaceAnalyzer();
  }
  return cached;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function ageBracket(age: number): "18-24" | "25-34" | "35-44" | "45+" | null {
  if (age < 18 || age > 90) return null;
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  return "45+";
}

// Minimal AWS SigV4 signer for the one Rekognition call we make.
// Ported from the AWS docs; kept in this file to avoid pulling in the
// full aws-sdk package.
async function sigV4Headers(args: {
  method: string;
  host: string;
  region: string;
  service: string;
  target: string;
  body: string;
}): Promise<Record<string, string>> {
  const { method, host, region, service, target, body } = args;
  const accessKey = process.env.AWS_ACCESS_KEY_ID!;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY!;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .replace(/T/, "T");
  const shortDate = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash("sha256").update(body).digest("hex");

  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n` +
    (sessionToken ? `x-amz-security-token:${sessionToken}\n` : "");
  const signedHeaders =
    "content-type;host;x-amz-date;x-amz-target" + (sessionToken ? ";x-amz-security-token" : "");

  const canonicalRequest = [
    method,
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${shortDate}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.1",
    "x-amz-date": amzDate,
    "x-amz-target": target,
    authorization,
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;
  return headers;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}
