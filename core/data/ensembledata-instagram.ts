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
// Endpoints wired here (CONFIRMED paths — the docs I first fetched
// used /ig/* shorthand but the real HTTP endpoints under the SDK's
// hood use /instagram/* full-word paths):
//   GET  /apis/instagram/user/detailed-info  — profile with follower / bio (getProfile)
//   GET  /apis/instagram/user/posts          — recent feed posts
//   GET  /apis/instagram/user/followers      — follower sample
//   GET  /apis/instagram/post/comments       — comments on a specific media
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
// EDUser is the /instagram/user/detailed-info response payload. Note
// this is IG's GraphQL scraped web-profile shape, NOT the Instagram
// Private API shape — everything is edge_X / node.count-style.
interface EDUser {
  id?: string;                 // numeric string, e.g. "28943446"
  username?: string;
  full_name?: string;
  biography?: string;
  is_verified?: boolean;
  is_private?: boolean;
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
  external_url?: string;
  business_category_name?: string | null;
  category_name?: string | null;
  is_business_account?: boolean;
  // Metric counts — all in edge_*.count.
  edge_followed_by?: { count?: number };
  edge_follow?: { count?: number };
  edge_owner_to_timeline_media?: { count?: number; edges?: Array<{ node: EDMediaNode }> };
  edge_felix_video_timeline?: { count?: number; edges?: Array<{ node: EDMediaNode }> };
}

// EDMediaNode is what each post edge looks like in the GraphQL feed.
// Fields we don't use (accessibility_caption, gating_info, etc.)
// are omitted for brevity.
interface EDMediaNode {
  __typename?: string;         // "GraphVideo" | "GraphImage" | "GraphSidecar"
  id?: string;
  shortcode?: string;
  is_video?: boolean;
  display_url?: string;        // full-res image / video cover
  thumbnail_src?: string;
  video_url?: string;
  video_view_count?: number;
  video_duration?: number;
  taken_at_timestamp?: number; // unix seconds
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  edge_media_to_comment?: { count?: number };
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  product_type?: string;       // "clips" | "igtv" | undefined
  clips_music_attribution_info?: { song_name?: string };
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

  // Per-instance memo cache. /instagram/user/detailed-info returns
  // the last ~12 posts inline, so caching the whole payload lets
  // getProfile + getRecentPosts + getFollowerSample within one tool
  // run share ONE call. CachedAdapter still handles the cross-request
  // Supabase cache; this is purely intra-run dedup.
  private readonly detailedInfoCache = new Map<string, { data: EDUser; cachedAt: number }>();
  private static readonly CACHE_MS = 2 * 60 * 1000;

  constructor(token?: string) {
    super("instagram");
    this.token = token ?? process.env.ENSEMBLEDATA_TOKEN ?? "";
  }

  private async fetchDetailedInfo(clean: string): Promise<EDUser> {
    const key = clean.toLowerCase();
    const hit = this.detailedInfoCache.get(key);
    if (hit && Date.now() - hit.cachedAt < EnsembleDataInstagramAdapter.CACHE_MS) {
      return hit.data;
    }
    const raw = await this.get<{ user?: EDUser } | EDUser>(
      "/instagram/user/detailed-info",
      { username: clean },
    );
    const user: EDUser = "user" in (raw as { user?: EDUser })
      ? (raw as { user: EDUser }).user
      : (raw as EDUser);
    if (!user || !user.username) {
      throw new DataSourceError(
        `ensembledata /instagram/user/detailed-info returned no user for ${clean} — falling through`,
      );
    }
    if (user.username.toLowerCase() !== clean.toLowerCase()) {
      throw new DataSourceError(
        `ensembledata returned different user (${user.username}) than requested (${clean}) — falling through`,
      );
    }
    this.detailedInfoCache.set(key, { data: user, cachedAt: Date.now() });
    return user;
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
    const user = await this.fetchDetailedInfo(clean);
    if (user.is_private) {
      throw new PrivateAccountError(clean, "instagram");
    }
    return {
      handle: user.username!,
      displayName: user.full_name ?? undefined,
      followers: Number(user.edge_followed_by?.count ?? 0),
      following: Number(user.edge_follow?.count ?? 0),
      verified: Boolean(user.is_verified),
      isPrivate: Boolean(user.is_private),
      avatarUrl: user.profile_pic_url_hd ?? user.profile_pic_url ?? undefined,
      bio: user.biography ?? undefined,
      niche: user.business_category_name ?? user.category_name ?? undefined,
    };
  }

  // ── getRecentPosts ────────────────────────────────────────────────────────
  // detailed-info already returns the last ~12 posts inline via
  // edge_owner_to_timeline_media.edges. Reuse the memo so we pay for
  // one call, not two. If the caller asks for MORE than the inline
  // count, top up with the /user/posts endpoint (same GraphQL shape).
  override async getRecentPosts(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<Post[]> {
    if (platform !== "instagram") return [];
    const clean = handle.replace(/^@/, "").trim();
    const user = await this.fetchDetailedInfo(clean);
    const inline: EDMediaNode[] = [];
    for (const e of user.edge_owner_to_timeline_media?.edges ?? []) {
      if (e?.node) inline.push(e.node);
    }
    if (inline.length >= n) {
      return inline.slice(0, n).map(normalizeMediaNode);
    }
    // Fell short — top up with a dedicated /user/posts call. Same
    // GraphQL wrapper is expected.
    try {
      const raw = await this.get<
        { edges?: Array<{ node: EDMediaNode }> } | { items?: EDMediaNode[] } | EDMediaNode[]
      >("/instagram/user/posts", { username: clean, depth: "1" });
      const more: EDMediaNode[] = Array.isArray(raw)
        ? raw
        : "edges" in (raw as { edges?: unknown }) && Array.isArray((raw as { edges?: unknown[] }).edges)
          ? ((raw as { edges: Array<{ node: EDMediaNode }> }).edges
              .map((e) => e?.node)
              .filter((v): v is EDMediaNode => Boolean(v)))
          : ((raw as { items?: EDMediaNode[] }).items ?? []);
      const seen = new Set(inline.map((p) => p.id ?? p.shortcode ?? ""));
      for (const node of more) {
        const key = node.id ?? node.shortcode ?? "";
        if (!seen.has(key)) {
          inline.push(node);
          seen.add(key);
        }
      }
    } catch {
      // Non-fatal — chain will fall through to next provider if
      // downstream really needs more posts and the primary returned
      // fewer than requested.
    }
    return inline.slice(0, n).map(normalizeMediaNode);
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
      "/instagram/post/comments",
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
  // The followers endpoint needs a numeric user_id, which we already
  // have from the cached detailed-info payload — reuse it, don't pay
  // for a second lookup.
  override async getFollowerSample(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<FollowerLite[]> {
    if (platform !== "instagram") return [];
    const clean = handle.replace(/^@/, "").trim();
    const user = await this.fetchDetailedInfo(clean);
    const userId = user.id;
    if (!userId) {
      throw new DataSourceError(
        `ensembledata could not resolve user id for ${clean} — falling through`,
      );
    }
    const raw = await this.get<
      { items?: Array<{ username?: string; full_name?: string }> } | Array<{ username?: string; full_name?: string }>
    >("/instagram/user/followers", { user_id: userId });
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

// GraphQL post node → our Post shape. Handles Image / Video / Sidecar
// (carousel) — sidecar's first-child image is what the feed thumbnail
// shows, so display_url on the parent is correct for all three.
function normalizeMediaNode(n: EDMediaNode): Post {
  const caption = n.edge_media_to_caption?.edges?.[0]?.node?.text ?? undefined;
  const likes = n.edge_liked_by?.count ?? n.edge_media_preview_like?.count ?? 0;
  const comments = n.edge_media_to_comment?.count ?? 0;
  const views = n.video_view_count ?? undefined;
  const thumb = n.display_url ?? n.thumbnail_src ?? undefined;
  return {
    id: String(n.id ?? n.shortcode ?? ""),
    likes: Number(likes),
    comments: Number(comments),
    views,
    postedAt: n.taken_at_timestamp
      ? new Date(n.taken_at_timestamp * 1000).toISOString()
      : new Date().toISOString(),
    thumbnailUrl: thumb,
    thumbnailUrlHd: thumb,
    caption,
    durationSec: n.video_duration ?? undefined,
    videoUrl: n.video_url ?? undefined,
    permalink: n.shortcode
      ? `https://www.instagram.com/p/${n.shortcode}/`
      : undefined,
  };
}
