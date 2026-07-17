// Instagram data via EnsembleData (https://ensembledata.com).
//
// Why: pay-per-request (no monthly minimum), covers IG + TikTok + YouTube
// from one endpoint namespace, and works out of the box with just a token.
// Positioned as the CHEAPEST provider in the chain — tried first, falls
// through to HikerAPI / RapidAPI on any failure.
//
// Auth: single `token` query param on every request. Base URL is
// https://ensembledata.com/apis/ig/*. Response is uniformly wrapped as
// `{ data: <payload>, units_charged: N }` — we unwrap `data` before parsing.
//
// Endpoints wired here:
//   GET  /apis/ig/user/info      — profile lookup by username
//   GET  /apis/ig/user/posts     — recent feed posts
//   GET  /apis/ig/user/reels     — reels (used to enrich getRecentPosts)
//   GET  /apis/ig/post/comments  — comments on a specific media
//
// Errors bubble up as HandleNotFoundError / PrivateAccountError /
// ProviderRateLimitError / DataSourceError so the ChainAdapter can
// fail over to the next provider without leaking mock data.

import type { Platform } from "../types";
import type {
  CommentItem,
  DataAdapter,
  DemographicSplit,
  EarningsEstimate,
  FollowerAudit,
  FollowerLite,
  HashtagStatus,
  LiveCount,
  Post,
  Profile,
  ReachSignals,
  UnfollowerDelta,
  UsernameAvailability,
} from "./adapter";
import { MockProvider } from "./mock-provider";
import {
  DataSourceError,
  HandleNotFoundError,
  PrivateAccountError,
  ProviderRateLimitError,
} from "../utils/errors";

const BASE = "https://ensembledata.com/apis";
const TIMEOUT_MS = 12_000;

// Ensembledata responses vary between endpoints. The user/info endpoint
// returns a single `data` object; user/posts + comments return
// `data: { items?, nextCursor? }` OR `data: [...]` directly, depending
// on the endpoint. We handle both shapes defensively.
interface EDUser {
  username?: string;
  full_name?: string;
  biography?: string;
  pk?: number | string;
  id?: string;
  follower_count?: number;
  following_count?: number;
  is_verified?: boolean;
  is_private?: boolean;
  media_count?: number;
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
  hd_profile_pic_url_info?: { url?: string };
  external_url?: string;
  category?: string;
  is_business?: boolean;
}

interface EDMedia {
  pk?: number | string;
  id?: string;
  code?: string;
  media_type?: number;
  like_count?: number;
  comment_count?: number;
  play_count?: number;
  view_count?: number;
  taken_at?: number;
  caption?: { text?: string } | string;
  caption_text?: string;
  thumbnail_url?: string;
  image_versions2?: { candidates?: { url?: string }[] };
  video_url?: string;
  video_versions?: { url?: string }[];
  video_duration?: number;
}

interface EDComment {
  pk?: number | string;
  id?: string;
  user?: {
    username?: string;
    full_name?: string;
    profile_pic_url?: string;
  };
  text?: string;
  created_at?: number;
  created_at_utc?: number;
}

export class EnsembleDataInstagramAdapter extends MockProvider implements DataAdapter {
  private readonly token: string;

  constructor(token?: string) {
    super("instagram");
    this.token = token ?? process.env.ENSEMBLEDATA_TOKEN ?? "";
  }

  // Low-level HTTP wrapper. All errors normalized to our error taxonomy
  // so the ChainAdapter can classify and route them.
  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.token) {
      throw new DataSourceError("ENSEMBLEDATA_TOKEN is not configured");
    }
    const qs = new URLSearchParams({ ...params, token: this.token }).toString();
    const url = `${BASE}${path}?${qs}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 402) {
        // Insufficient units — treat as rate limit so the chain skips ahead
        // and the breaker trips after 3 straight 402s.
        throw new ProviderRateLimitError("ensembledata", path);
      }
      if (res.status === 429) {
        throw new ProviderRateLimitError("ensembledata", path);
      }
      // 404 from Ensembledata is ambiguous — it can mean "endpoint
      // path wrong / auth wrong / user genuinely missing." Because
      // we can't distinguish, treat as a provider-side failure so
      // the chain falls through to Hiker/RapidAPI (which CAN
      // authoritatively answer "does this user exist"). Genuine
      // "user not found" is detected downstream via empty payload,
      // and only thrown as HandleNotFoundError after all providers
      // have been consulted.
      if (res.status === 404) {
        throw new DataSourceError(
          `ensembledata GET ${path} returned 404 — probably a broken endpoint path or auth issue, falling through`,
        );
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new DataSourceError(
          `ensembledata GET ${path} returned ${res.status}: ${body.slice(0, 200)}`,
        );
      }
      const json = (await res.json()) as { data?: unknown; units_charged?: number };
      // Every endpoint wraps its payload as { data: ..., units_charged: N }.
      // Some legacy endpoints return the payload flat — accept both.
      return (json.data !== undefined ? json.data : json) as T;
    } catch (e) {
      if (e instanceof ProviderRateLimitError) throw e;
      if (e instanceof HandleNotFoundError) throw e;
      if (e instanceof PrivateAccountError) throw e;
      if (e instanceof DataSourceError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new DataSourceError(`ensembledata timeout after ${TIMEOUT_MS / 1000}s`);
      }
      throw new DataSourceError("ensembledata fetch error", e);
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── getProfile ────────────────────────────────────────────────────────────
  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    if (platform !== "instagram") {
      throw new DataSourceError(`ensembledata-instagram doesn't serve ${platform}`);
    }
    const clean = handle.replace(/^@/, "").trim();
    const raw = await this.get<{ user?: EDUser } | EDUser>("/ig/user/info", {
      username: clean,
    });
    // Endpoint sometimes returns { user: {...} }, sometimes { ...user }.
    const user: EDUser = "user" in (raw as { user?: EDUser })
      ? (raw as { user: EDUser }).user
      : (raw as EDUser);
    // Any "user missing" signal from Ensembledata is treated as
    // provider-side failure (DataSourceError), not authoritative
    // HandleNotFoundError. Reason: we don't yet know Ensembledata's
    // exact endpoint contract for "user genuinely doesn't exist",
    // so the safe move is to fall through to Hiker / RapidAPI which
    // CAN authoritatively answer.
    if (!user || !user.username) {
      throw new DataSourceError(
        `ensembledata /ig/user/info returned no user for ${clean} — falling through`,
      );
    }
    // Reject provider fuzzy-match: if the returned username doesn't match
    // what we asked for, also fall through.
    if (user.username.toLowerCase() !== clean.toLowerCase()) {
      throw new DataSourceError(
        `ensembledata returned different user (${user.username}) than requested (${clean}) — falling through`,
      );
    }
    if (user.is_private) {
      throw new PrivateAccountError(clean, "instagram");
    }
    return {
      handle: user.username,
      displayName: user.full_name ?? undefined,
      followers: Number(user.follower_count ?? 0),
      following: Number(user.following_count ?? 0),
      verified: Boolean(user.is_verified),
      isPrivate: Boolean(user.is_private),
      avatarUrl:
        user.hd_profile_pic_url_info?.url ??
        user.profile_pic_url_hd ??
        user.profile_pic_url ??
        undefined,
      bio: user.biography ?? undefined,
      niche: user.category ?? undefined,
    };
  }

  // ── getRecentPosts ────────────────────────────────────────────────────────
  override async getRecentPosts(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<Post[]> {
    if (platform !== "instagram") return [];
    const clean = handle.replace(/^@/, "").trim();
    const raw = await this.get<{ items?: EDMedia[] } | EDMedia[]>(
      "/ig/user/posts",
      { username: clean, depth: "1" },
    );
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return items.slice(0, n).map((m) => normalizeMedia(m));
  }

  // ── getRecentComments ─────────────────────────────────────────────────────
  override async getRecentComments(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<{ post: Post; comments: CommentItem[] }> {
    if (platform !== "instagram") return super.getRecentComments(platform, handle, n);
    const posts = await this.getRecentPosts(platform, handle, 3);
    if (posts.length === 0) return super.getRecentComments(platform, handle, n);
    const target = posts[0]!;
    const raw = await this.get<{ items?: EDComment[] } | EDComment[]>(
      "/ig/post/comments",
      { post_id: target.id, depth: "1" },
    );
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    const comments: CommentItem[] = items.slice(0, n).map((c, i) => ({
      id: String(c.pk ?? c.id ?? i),
      username: c.user?.username ?? "unknown",
      text: c.text ?? "",
      postedAt: c.created_at_utc
        ? new Date(c.created_at_utc * 1000).toISOString()
        : c.created_at
          ? new Date(c.created_at * 1000).toISOString()
          : new Date().toISOString(),
      fullName: c.user?.full_name ?? undefined,
      avatarUrl: c.user?.profile_pic_url ?? undefined,
    }));
    return { post: target, comments };
  }

  // ── getFollowerSample ─────────────────────────────────────────────────────
  // Ensembledata's followers endpoint requires a user_id (numeric pk),
  // not a username. We resolve via a preliminary getProfile.info call.
  override async getFollowerSample(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<FollowerLite[]> {
    if (platform !== "instagram") return [];
    const clean = handle.replace(/^@/, "").trim();
    const info = await this.get<{ user?: EDUser } | EDUser>("/ig/user/info", {
      username: clean,
    });
    const user: EDUser = "user" in (info as { user?: EDUser })
      ? (info as { user: EDUser }).user
      : (info as EDUser);
    const userId = String(user?.pk ?? user?.id ?? "");
    if (!userId) throw new HandleNotFoundError(clean, "instagram");
    const raw = await this.get<{ items?: Array<{ username?: string; full_name?: string }> } | Array<{ username?: string; full_name?: string }>>(
      "/ig/user/followers",
      { user_id: userId },
    );
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return items.slice(0, n).map((f) => ({
      username: f.username ?? "",
      fullName: f.full_name ?? undefined,
    }));
  }

  // ── isHandleAvailable ─────────────────────────────────────────────────────
  // Delegate to getProfile so we share its "trust behavior": if
  // Ensembledata can't confidently answer, we throw DataSourceError
  // and let the chain ask Hiker/RapidAPI. Never returns "available:
  // true" from a suspect Ensembledata response.
  override async isHandleAvailable(
    platform: Platform,
    handle: string,
  ): Promise<UsernameAvailability> {
    if (platform !== "instagram") return super.isHandleAvailable(platform, handle);
    try {
      const profile = await this.getProfile(platform, handle);
      return {
        platform: "instagram",
        available: false,
        takenBy: {
          followers: profile.followers,
          lastActiveAgo: "recently",
        },
      };
    } catch (e) {
      if (e instanceof HandleNotFoundError) {
        return { platform: "instagram", available: true };
      }
      throw e;
    }
  }

  // ── getThumbnail ──────────────────────────────────────────────────────────
  override async getThumbnail(
    platform: Platform,
    handle: string,
  ): Promise<{ post: Post; resolutions: { label: string; url: string; locked: boolean }[] }> {
    if (platform !== "instagram") return super.getThumbnail(platform, handle);
    const posts = await this.getRecentPosts(platform, handle, 1);
    if (posts.length === 0) return super.getThumbnail(platform, handle);
    const post = posts[0]!;
    const url = post.thumbnailUrlHd ?? post.thumbnailUrl ?? "";
    return {
      post,
      resolutions: [
        { label: "SD", url, locked: false },
        { label: "HD", url: post.thumbnailUrlHd ?? url, locked: false },
      ],
    };
  }

  // ── Phase 2/3 methods — no cheap Ensembledata endpoint, delegate to
  //     Mock so the chain moves to the next provider on demand ────────────
  override async getDemographics(platform: Platform, handle: string): Promise<DemographicSplit> {
    // No first-party demographics endpoint yet. Throw so chain falls through.
    throw new DataSourceError("ensembledata: getDemographics not implemented");
  }

  override async getReachSignals(platform: Platform, handle: string): Promise<ReachSignals> {
    throw new DataSourceError("ensembledata: getReachSignals not implemented");
  }

  override async getFollowerAudit(platform: Platform, handle: string, sample: number): Promise<FollowerAudit> {
    throw new DataSourceError("ensembledata: getFollowerAudit not implemented");
  }

  override async getUnfollowerDelta(platform: Platform, handle: string): Promise<UnfollowerDelta> {
    throw new DataSourceError("ensembledata: getUnfollowerDelta not implemented");
  }

  override async getLiveCount(platform: Platform, handle: string): Promise<LiveCount> {
    throw new DataSourceError("ensembledata: getLiveCount not implemented");
  }

  override async getHashtagStatus(platform: Platform, hashtag: string): Promise<HashtagStatus> {
    throw new DataSourceError("ensembledata: getHashtagStatus not implemented");
  }

  override async estimateEarnings(platform: Platform, profile: Profile, posts: Post[]): Promise<EarningsEstimate> {
    // Earnings is a pure calc over profile + posts — MockProvider's
    // implementation is fine. Delegate rather than throw.
    return super.estimateEarnings(platform, profile, posts);
  }
}

function normalizeMedia(m: EDMedia): Post {
  const caption =
    typeof m.caption === "string"
      ? m.caption
      : (m.caption?.text ?? m.caption_text ?? undefined);
  const thumb =
    m.image_versions2?.candidates?.[0]?.url ??
    m.thumbnail_url ??
    undefined;
  const thumbHd = m.image_versions2?.candidates?.[0]?.url ?? thumb;
  const videoUrl = m.video_versions?.[0]?.url ?? m.video_url ?? undefined;
  return {
    id: String(m.pk ?? m.id ?? m.code ?? ""),
    likes: Number(m.like_count ?? 0),
    comments: Number(m.comment_count ?? 0),
    views: m.play_count ?? m.view_count ?? undefined,
    postedAt: m.taken_at
      ? new Date(m.taken_at * 1000).toISOString()
      : new Date().toISOString(),
    thumbnailUrl: thumb,
    thumbnailUrlHd: thumbHd,
    caption,
    durationSec: m.video_duration ?? undefined,
    videoUrl,
    permalink: m.code ? `https://www.instagram.com/p/${m.code}/` : undefined,
  };
}
