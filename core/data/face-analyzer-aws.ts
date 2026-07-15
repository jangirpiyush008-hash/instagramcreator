// AWS Rekognition adapter. Split into its own file so `node:crypto` (needed
// for the SigV4 signer) stays out of the client bundle — the parent
// face-analyzer.ts only loads this module via dynamic import when the
// FACE_ANALYZER=aws env var is set.
//
// Kept intentionally minimal — one DetectFaces call per image, no state,
// no image storage, no face database.

// Bare-name import (not "node:crypto") so the webpack fallback in
// next.config.mjs can stub it out for browser bundles. The `node:` URI
// scheme bypasses fallback resolution — using "crypto" resolves the same
// module at runtime but plays nice with webpack's client-bundle rules.
import crypto from "crypto";
import type { FaceAnalyzer, FaceResult } from "./face-analyzer";

interface RekognitionResp {
  FaceDetails?: Array<{
    AgeRange?: { Low: number; High: number };
    Gender?: { Value: "Male" | "Female"; Confidence: number };
  }>;
}

export class AwsRekognitionFaceAnalyzer implements FaceAnalyzer {
  readonly name = "aws";

  async analyze(imageUrl: string): Promise<FaceResult> {
    let bytes: Buffer;
    try {
      // Match the referer/UA to the source CDN so hotlink-protected
      // origins (Instagram, TikTok) don't 403. YouTube's yt3 CDN doesn't
      // check referer but the extra header is harmless.
      const headers = imageHeadersFor(imageUrl);
      const r = await fetch(imageUrl, { headers });
      if (!r.ok) {
        if (process.env.DEBUG_ENRICHMENT === "1") {
          console.warn(`[face] avatar fetch failed ${r.status} for ${imageUrl.slice(0, 80)}`);
        }
        return unknown();
      }
      const ab = await r.arrayBuffer();
      bytes = Buffer.from(ab);
      if (bytes.length > 4_500_000) return unknown();
    } catch (e) {
      if (process.env.DEBUG_ENRICHMENT === "1") {
        console.warn("[face] avatar fetch threw:", e instanceof Error ? e.message : e);
      }
      return unknown();
    }

    const region = process.env.AWS_REGION || "us-east-1";
    const service = "rekognition";
    const host = `${service}.${region}.amazonaws.com`;
    const target = "RekognitionService.DetectFaces";
    // Rekognition DetectFaces attribute groups:
    //   DEFAULT → BoundingBox, Confidence, Landmarks, Pose, Quality
    //   ALL     → adds Gender, AgeRange, Emotions, Smile, Eyeglasses, etc.
    // We need Gender + AgeRange. Requesting ALL is the smallest set that
    // includes both — Rekognition doesn't let us cherry-pick individual
    // attributes without ALL. Cost is the same either way ($0.001/image).
    const body = JSON.stringify({
      Image: { Bytes: bytes.toString("base64") },
      Attributes: ["ALL"],
    });

    const headers = sigV4Headers({ method: "POST", host, region, service, target, body });

    let resp: Response;
    try {
      resp = await fetch(`https://${host}/`, { method: "POST", headers, body });
    } catch {
      return unknown();
    }
    if (!resp.ok) return unknown();

    const json = (await resp.json()) as RekognitionResp;
    const face = json.FaceDetails?.[0];
    if (!face) return unknown();

    const gender: "male" | "female" | null =
      face.Gender?.Value === "Male" ? "male" : face.Gender?.Value === "Female" ? "female" : null;
    const conf = face.Gender ? face.Gender.Confidence / 100 : 0;
    const low = face.AgeRange?.Low ?? null;
    const high = face.AgeRange?.High ?? null;
    const mid = low !== null && high !== null ? Math.round((low + high) / 2) : null;

    return {
      gender,
      genderConfidence: conf,
      ageLow: low,
      ageHigh: high,
      ageBracket: mid !== null ? bracketFor(mid) : null,
      faceCount: json.FaceDetails?.length ?? 0,
      provider: "aws",
    };
  }
}

// Instagram + TikTok CDNs return 403 to server-side requests without a
// matching referer. YouTube's yt3 CDN is public and doesn't check.
// Match the referer to the origin so hotlink-protected images resolve.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function imageHeadersFor(url: string): Record<string, string> {
  const host = safeHost(url);
  if (!host) return { "user-agent": UA };
  if (host.includes("cdninstagram.com") || host.includes("fbcdn.net")) {
    return {
      "user-agent": UA,
      referer: "https://www.instagram.com/",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    };
  }
  if (host.includes("tiktokcdn") || host.includes("bytecdn")) {
    return {
      "user-agent": UA,
      referer: "https://www.tiktok.com/",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    };
  }
  return { "user-agent": UA };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function unknown(): FaceResult {
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

function bracketFor(age: number): "18-24" | "25-34" | "35-44" | "45+" | null {
  if (age < 18 || age > 90) return null;
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  return "45+";
}

// Hand-rolled AWS SigV4 signer for the one DetectFaces call. Avoids
// pulling the full aws-sdk dependency (~5MB) into our build.
function sigV4Headers(args: {
  method: string;
  host: string;
  region: string;
  service: string;
  target: string;
  body: string;
}): Record<string, string> {
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

  const canonicalRequest = [method, "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

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
