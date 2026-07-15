import { NextResponse } from "next/server";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { checkAndIncrementUsage } from "@/core/billing/rate-limit";
import { hashIp, getClientIp } from "@/core/utils/hash";
import { RateLimitError } from "@/core/utils/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allowlist of upstream hosts we are willing to redirect / stream from.
// Blocks a compromised or malicious upstream from turning this endpoint
// into an open redirector (e.g. handing us back a URL that points at an
// internal metadata service, a phishing page, etc.). YouTube's CDN uses
// a small, well-known set of hostnames.
const ALLOWED_MEDIA_HOSTS = [
  /\.googlevideo\.com$/i,
  /\.youtube\.com$/i,
  /\.ytimg\.com$/i,
  /^googlevideo\.com$/i,
  /^youtube\.com$/i,
];

function isMediaHostAllowed(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    return ALLOWED_MEDIA_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

// YouTube MP4 downloader — fetches a fresh download URL on-demand from a
// configurable RapidAPI provider, then either redirects the browser to it
// or streams it back through us (if ?stream=1).
//
// LEGAL NOTE: Downloading YouTube content programmatically violates
// YouTube's Terms of Service. This route is here because the operator
// (Piyush) explicitly requested it, understanding the risk to payment
// gateways and Google's TOS. The UI surfaces a "third-party service"
// disclaimer. If Razorpay / LemonSqueezy flag this, disable by unsetting
// YT_DOWNLOAD_HOST.
//
// Env:
//   RAPIDAPI_KEY        — shared with IG/TikTok
//   YT_DOWNLOAD_HOST    — RapidAPI provider host (e.g. "youtube-media-downloader.p.rapidapi.com")
//   YT_DOWNLOAD_PATH    — optional endpoint path (default varies per provider)
//
// Response-shape parsing tries a handful of common providers so a schema
// drift doesn't break us silently — same defensive pattern as the tikwm
// posts parser.

interface DownloadCandidate {
  url: string;
  quality?: string;
  ext?: string;
  itag?: number | string;
}

interface RawProviderResponse {
  // Provider-A (youtube-media-downloader / yt-api):
  videos?: { items?: { url?: string; extension?: string; quality?: string; itag?: number }[] };
  formats?: { url?: string; qualityLabel?: string; mimeType?: string }[];
  // Provider-B (ytstream-download-youtube-videos):
  download_url?: string;
  medias?: { url?: string; quality?: string; extension?: string }[];
  // Provider-C (fallback):
  link?: string;
  links?: Record<string, { url?: string; quality?: string; ext?: string }>;
  // Provider-D (savefrom-style):
  url?: string[] | string;
}

function extractCandidates(raw: RawProviderResponse): DownloadCandidate[] {
  const out: DownloadCandidate[] = [];
  if (raw.videos?.items) {
    for (const v of raw.videos.items) {
      if (v.url) out.push({ url: v.url, quality: v.quality, ext: v.extension, itag: v.itag });
    }
  }
  if (raw.formats) {
    for (const f of raw.formats) {
      if (f.url && f.mimeType?.includes("mp4")) {
        out.push({ url: f.url, quality: f.qualityLabel, ext: "mp4" });
      }
    }
  }
  if (raw.medias) {
    for (const m of raw.medias) {
      if (m.url) out.push({ url: m.url, quality: m.quality, ext: m.extension });
    }
  }
  if (raw.download_url) out.push({ url: raw.download_url });
  if (raw.link) out.push({ url: raw.link });
  if (raw.links) {
    for (const k of Object.keys(raw.links)) {
      const l = raw.links[k];
      if (l?.url) out.push({ url: l.url, quality: l.quality, ext: l.ext });
    }
  }
  if (typeof raw.url === "string") out.push({ url: raw.url });
  if (Array.isArray(raw.url)) for (const u of raw.url) out.push({ url: u });
  // Only keep MP4-ish (or missing ext) candidates so we don't ship an m3u8/mpd
  // to a browser that expects a save-as file.
  return out.filter((c) => !c.ext || /mp4/i.test(c.ext));
}

function pickBest(candidates: DownloadCandidate[]): DownloadCandidate | null {
  if (candidates.length === 0) return null;
  // Prefer explicit quality labels (720/1080), else pick first.
  const withQuality = candidates.filter((c) => c.quality);
  if (withQuality.length > 0) {
    const ranked = withQuality
      .map((c) => ({ c, q: Number(String(c.quality).replace(/[^\d]/g, "")) || 0 }))
      .sort((a, b) => b.q - a.q);
    return ranked[0]!.c;
  }
  return candidates[0]!;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  const stream = searchParams.get("stream") === "1";

  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ ok: false, error: "invalid videoId" }, { status: 400 });
  }

  // Auth + rate limit: this hits a paid RapidAPI provider on every call,
  // and without a gate an unauthenticated caller could burn our quota
  // (and racket up costs) in a loop. Route it through the same usage
  // meter we use for scans, keyed under the pseudo-tool id "yt-download".
  const user = await getCurrentUser();
  const supa = supabaseService();
  const anonKey = user ? null : await hashIp(getClientIp(req.headers));
  try {
    await checkAndIncrementUsage({
      supabaseService: supa,
      userId: user?.id ?? null,
      anonKey,
      toolId: "yt-download",
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      const rl = e as RateLimitError & { requiresAuth?: boolean; needsUpgrade?: boolean };
      if (rl.requiresAuth) {
        return NextResponse.json(
          { ok: false, error: "Sign in to download videos.", code: "auth_required" },
          { status: 401 },
        );
      }
      if (rl.needsUpgrade) {
        return NextResponse.json(
          { ok: false, error: "Upgrade your plan to use this tool.", code: "upgrade_required" },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { ok: false, error: "Rate limit reached. Try again later.", code: "rate_limited" },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Auth check failed. Try again.", code: "auth_error" },
      { status: 500 },
    );
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  const host = process.env.YT_DOWNLOAD_HOST;
  const path = process.env.YT_DOWNLOAD_PATH ?? `/v2/video/details?videoId=${videoId}`;
  if (!apiKey || !host) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "YouTube downloader is not configured. Set RAPIDAPI_KEY and YT_DOWNLOAD_HOST env vars.",
      },
      { status: 501 },
    );
  }

  const providerUrl = `https://${host}${path.includes(videoId) ? path : `${path}${path.includes("?") ? "&" : "?"}videoId=${videoId}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(providerUrl, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": host,
        accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429 || res.status === 403) {
      return NextResponse.json(
        { ok: false, error: "provider quota exhausted, try again later" },
        { status: 503 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `provider returned ${res.status}` },
        { status: 502 },
      );
    }
    const raw = (await res.json()) as RawProviderResponse;
    const candidates = extractCandidates(raw);
    const pick = pickBest(candidates);
    if (!pick) {
      console.warn(
        "[yt-download] no MP4 in response. keys=[",
        Object.keys(raw).join(","),
        "]",
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "Provider didn't return a downloadable MP4 for this video. It may be age-restricted, region-locked, or the provider's schema changed.",
        },
        { status: 502 },
      );
    }

    // Host allowlist: refuse to touch anything not on Google/YouTube CDN.
    // Guards against a compromised or drifting upstream handing us back a
    // URL that points at an internal service, another domain, etc.
    if (!isMediaHostAllowed(pick.url)) {
      console.warn("[yt-download] blocked non-allowlisted host from provider:", pick.url.slice(0, 200));
      return NextResponse.json(
        { ok: false, error: "Provider returned a download URL from an unexpected host." },
        { status: 502 },
      );
    }

    // Stream through us so the browser sees our domain (nicer for the "Save
    // As" prompt) and CDN referer checks don't reject a hotlinked click.
    if (stream) {
      const media = await fetch(pick.url, {
        headers: { "user-agent": "Mozilla/5.0 DecodeCreator-YT-Download" },
        cache: "no-store",
      });
      if (!media.ok || !media.body) {
        return NextResponse.json(
          { ok: false, error: `media fetch failed with ${media.status}` },
          { status: 502 },
        );
      }
      const filename = `youtube-${videoId}.mp4`;
      return new Response(media.body, {
        status: 200,
        headers: {
          "content-type": media.headers.get("content-type") ?? "video/mp4",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
        },
      });
    }

    // Default: 302 to the direct URL. Fastest, cheapest for us.
    return NextResponse.redirect(pick.url, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
