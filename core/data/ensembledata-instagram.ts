// Instagram data via the OFFICIAL EnsembleData Node SDK.
// npm: https://www.npmjs.com/package/ensembledata
// gh:  https://github.com/EnsembleData/ensembledata-node
//
// Why the SDK instead of hand-rolled fetch: eliminates every possible
// source of "why is this 30ms fast-failing" bugs — User-Agent, URL
// construction, retries, token handling, all owned by EnsembleData's
// own team and tested against their own servers. Our job here is just
// to convert their response shape into our DataAdapter contract.
//
// Response shape (verified against a real /instagram/user/detailed-info
// call for @mkbhd): IG's GraphQL scraped web-profile format —
// edge_followed_by.count / edge_owner_to_timeline_media.edges / etc.
// This IS the same shape a browser's page-source scrape returns.

import { EDClient, EDError } from "ensembledata";
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

// GraphQL user shape returned by /instagram/user/detailed-info.
interface EDUser {
  id?: string;
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
  edge_followed_by?: { count?: number };
  edge_follow?: { count?: number };
  edge_owner_to_timeline_media?: {
    count?: number;
    edges?: Array<{ node: EDMediaNode }>;
  };
  edge_felix_video_timeline?: {
    count?: number;
    edges?: Array<{ node: EDMediaNode }>;
  };
}

interface EDMediaNode {
  __typename?: string;
  id?: string;
  shortcode?: string;
  is_video?: boolean;
  display_url?: string;
  thumbnail_src?: string;
  video_url?: string;
  video_view_count?: number;
  video_duration?: number;
  taken_at_timestamp?: number;
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  edge_media_to_comment?: { count?: number };
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  product_type?: string;
}

interface EDCommentNode {
  id?: string | number;
  pk?: string | number;
  text?: string;
  created_at?: number;
  created_at_utc?: number;
  owner?: {
    username?: string;
    full_name?: string;
    profile_pic_url?: string;
  };
  user?: {
    username?: string;
    full_name?: string;
    profile_pic_url?: string;
  };
}

// Client-timeout gauge — kept a touch above HikerAPI's for the same
// reason (12s upstream, +2s our headroom). SDK's own default is 60s
// which is far too long for our chain.
const SDK_TIMEOUT_SEC = 14;

export class EnsembleDataInstagramAdapter extends MockProvider implements DataAdapter {
  private readonly client: ReturnType<typeof EDClient> | null;

  // Per-instance memo. /instagram/user/detailed-info returns the last
  // ~12 posts inline, so within one tool run we share ONE call across
  // getProfile + getRecentPosts + getFollowerSample.
  private readonly detailedInfoCache = new Map<string, { data: EDUser; cachedAt: number }>();
  private static readonly CACHE_MS = 2 * 60 * 1000;

  constructor(token?: string) {
    super("instagram");
    // Strip wrapping quotes / whitespace that Railway sometimes preserves.
    const raw = (token ?? process.env.ENSEMBLEDATA_TOKEN ?? "").trim();
    const clean = raw.replace(/^["']|["']$/g, "");
    this.client = clean
      ? EDClient({ token: clean, timeout: SDK_TIMEOUT_SEC })
      : null;
  }

  // Convert every SDK error to our chain error taxonomy so the
  // ChainAdapter can classify and route them the same as other
  // providers.
  private mapError(e: unknown, method: string): Error {
    if (e instanceof EDError) {
      const status = e.statusCode;
      const detail = e.detail || "";
      if (status === 402) return new ProviderRateLimitError("ensembledata", method);
      if (status === 429) return new ProviderRateLimitError("ensembledata", method);
      // Any 4xx/5xx becomes a DataSourceError with the ACTUAL detail
      // Ensembledata returned, so /admin/providers shows the real reason.
      return new DataSourceError(
        `ensembledata ${method} → ${status}: ${detail.slice(0, 150)}`,
      );
    }
    if (e instanceof Error && e.name === "AbortError") {
      return new DataSourceError(`ensembledata ${method} timeout`);
    }
    return new DataSourceError(
      `ensembledata ${method} error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  private async fetchDetailedInfo(clean: string): Promise<EDUser> {
    if (!this.client) {
      throw new DataSourceError("ENSEMBLEDATA_TOKEN is not configured");
    }
    const key = clean.toLowerCase();
    const hit = this.detailedInfoCache.get(key);
    if (hit && Date.now() - hit.cachedAt < EnsembleDataInstagramAdapter.CACHE_MS) {
      return hit.data;
    }
    let res: { data: unknown };
    try {
      res = await this.client.instagram.userDetailedInfo({ username: clean });
    } catch (e) {
      throw this.mapError(e, "/instagram/user/detailed-info");
    }
    const user = res.data as EDUser | undefined;
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
    if (inline.length >= n || !this.client) {
      return inline.slice(0, n).map(normalizeMediaNode);
    }
    // Top up when caller asked for more posts than the inlined feed.
    const userId = user.id;
    if (!userId) return inline.slice(0, n).map(normalizeMediaNode);
    try {
      const res = await this.client.instagram.userPosts({ userId, depth: 1 });
      const rawMore = res.data as
        | { edges?: Array<{ node: EDMediaNode }> }
        | { items?: EDMediaNode[] }
        | EDMediaNode[];
      const more: EDMediaNode[] = Array.isArray(rawMore)
        ? rawMore
        : "edges" in (rawMore as { edges?: unknown }) && Array.isArray((rawMore as { edges?: unknown[] }).edges)
          ? ((rawMore as { edges: Array<{ node: EDMediaNode }> }).edges
              .map((e) => e?.node)
              .filter((v): v is EDMediaNode => Boolean(v)))
          : ((rawMore as { items?: EDMediaNode[] }).items ?? []);
      const seen = new Set(inline.map((p) => p.id ?? p.shortcode ?? ""));
      for (const node of more) {
        const k = node.id ?? node.shortcode ?? "";
        if (!seen.has(k)) {
          inline.push(node);
          seen.add(k);
        }
      }
    } catch {
      // Non-fatal — return whatever we got inline.
    }
    return inline.slice(0, n).map(normalizeMediaNode);
  }

  override async getRecentComments(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<{ post: Post; comments: CommentItem[] }> {
    if (platform !== "instagram") return super.getRecentComments(platform, handle, n);
    if (!this.client) throw new DataSourceError("ENSEMBLEDATA_TOKEN is not configured");
    const posts = await this.getRecentPosts(platform, handle, 3);
    if (posts.length === 0) return super.getRecentComments(platform, handle, n);
    const target = posts[0]!;
    // postComments needs the shortcode, not the internal id.
    const shortcode = this.extractShortcode(target.permalink) ?? target.id;
    let res: { data: unknown };
    try {
      res = await this.client.instagram.postComments({ code: shortcode });
    } catch (e) {
      throw this.mapError(e, "/instagram/post/comments");
    }
    const rawItems = res.data as
      | { comments?: EDCommentNode[] }
      | { items?: EDCommentNode[] }
      | EDCommentNode[];
    const items: EDCommentNode[] = Array.isArray(rawItems)
      ? rawItems
      : ((rawItems as { comments?: EDCommentNode[] }).comments ??
          (rawItems as { items?: EDCommentNode[] }).items ??
          []);
    const comments: CommentItem[] = items.slice(0, n).map((c, i) => {
      const owner = c.owner ?? c.user ?? {};
      return {
        id: String(c.pk ?? c.id ?? i),
        username: owner.username ?? "unknown",
        text: c.text ?? "",
        postedAt: c.created_at_utc
          ? new Date(c.created_at_utc * 1000).toISOString()
          : c.created_at
            ? new Date(c.created_at * 1000).toISOString()
            : new Date().toISOString(),
        fullName: owner.full_name ?? undefined,
        avatarUrl: owner.profile_pic_url ?? undefined,
      };
    });
    return { post: target, comments };
  }

  private extractShortcode(permalink?: string): string | null {
    if (!permalink) return null;
    const m = permalink.match(/\/p\/([^/?]+)/);
    return m ? m[1]! : null;
  }

  override async getFollowerSample(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<FollowerLite[]> {
    if (platform !== "instagram") return [];
    if (!this.client) throw new DataSourceError("ENSEMBLEDATA_TOKEN is not configured");
    const clean = handle.replace(/^@/, "").trim();
    const user = await this.fetchDetailedInfo(clean);
    const userId = user.id;
    if (!userId) {
      throw new DataSourceError(
        `ensembledata could not resolve user id for ${clean} — falling through`,
      );
    }
    let res: { data: unknown };
    try {
      res = await this.client.instagram.userFollowers({ userId });
    } catch (e) {
      throw this.mapError(e, "/instagram/user/followers");
    }
    const raw = res.data as
      | { items?: Array<{ username?: string; full_name?: string }> }
      | Array<{ username?: string; full_name?: string }>;
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return items.slice(0, n).map((f) => ({
      username: f.username ?? "",
      fullName: f.full_name ?? undefined,
    }));
  }

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
        takenBy: { followers: profile.followers, lastActiveAgo: "recently" },
      };
    } catch (e) {
      if (e instanceof HandleNotFoundError) {
        return { platform: "instagram", available: true };
      }
      throw e;
    }
  }

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

  override async getDemographics(_platform: Platform, _handle: string): Promise<DemographicSplit> {
    throw new DataSourceError("ensembledata: getDemographics not implemented");
  }
  override async getReachSignals(_platform: Platform, _handle: string): Promise<ReachSignals> {
    throw new DataSourceError("ensembledata: getReachSignals not implemented");
  }
  override async getFollowerAudit(_platform: Platform, _handle: string, _sample: number): Promise<FollowerAudit> {
    throw new DataSourceError("ensembledata: getFollowerAudit not implemented");
  }
  override async getUnfollowerDelta(_platform: Platform, _handle: string): Promise<UnfollowerDelta> {
    throw new DataSourceError("ensembledata: getUnfollowerDelta not implemented");
  }
  override async getLiveCount(_platform: Platform, _handle: string): Promise<LiveCount> {
    throw new DataSourceError("ensembledata: getLiveCount not implemented");
  }
  override async getHashtagStatus(_platform: Platform, _hashtag: string): Promise<HashtagStatus> {
    throw new DataSourceError("ensembledata: getHashtagStatus not implemented");
  }
  override async estimateEarnings(platform: Platform, profile: Profile, posts: Post[]): Promise<EarningsEstimate> {
    return super.estimateEarnings(platform, profile, posts);
  }
}

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
