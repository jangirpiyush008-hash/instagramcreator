// TikTok data via EnsembleData (https://ensembledata.com).
//
// Same provider as the IG adapter but under the /tiktok/ path namespace.
// Positioned as an additional TikTok chain member alongside tikwm.
// Chain order (TT): tikwm-direct → ensembledata → rapidapi-tikwm → mock.
//
// Auth: single `token` query param. Base URL is
// https://ensembledata.com/apis/tiktok/*.
//
// Endpoints wired here (CONFIRMED /tiktok/* prefix — not /tt/*):
//   GET  /apis/tiktok/user/info      — profile lookup by username
//   GET  /apis/tiktok/user/posts     — recent videos
//   GET  /apis/tiktok/post/comments  — comments on a specific video

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

interface EDTikTokUser {
  unique_id?: string;
  username?: string;
  nickname?: string;
  signature?: string;
  follower_count?: number;
  following_count?: number;
  is_verified?: boolean;
  private_account?: boolean;
  avatar_url?: string;
  avatar_larger?: { url_list?: string[] };
  aweme_count?: number;
  region?: string;
}

interface EDTikTokVideo {
  aweme_id?: string;
  desc?: string;
  create_time?: number;
  statistics?: {
    digg_count?: number;
    comment_count?: number;
    play_count?: number;
    share_count?: number;
  };
  video?: {
    cover?: { url_list?: string[] };
    play_addr?: { url_list?: string[] };
    duration?: number;
  };
  author?: { unique_id?: string };
}

interface EDTikTokComment {
  cid?: string;
  text?: string;
  create_time?: number;
  user?: {
    unique_id?: string;
    nickname?: string;
    avatar_thumb?: { url_list?: string[] };
  };
}

export class EnsembleDataTikTokAdapter extends MockProvider implements DataAdapter {
  private readonly token: string;

  constructor(token?: string) {
    super("tiktok");
    this.token = token ?? process.env.ENSEMBLEDATA_TOKEN ?? "";
  }

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
      if (res.status === 402 || res.status === 429) {
        throw new ProviderRateLimitError("ensembledata", path);
      }
      // 404 is ambiguous (broken endpoint / auth / user missing).
      // Treat as provider failure so chain falls through to tikwm /
      // RapidAPI which can authoritatively answer.
      if (res.status === 404) {
        throw new DataSourceError(
          `ensembledata GET ${path} returned 404 — falling through`,
        );
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new DataSourceError(
          `ensembledata GET ${path} returned ${res.status}: ${body.slice(0, 200)}`,
        );
      }
      const json = (await res.json()) as { data?: unknown };
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

  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    if (platform !== "tiktok") {
      throw new DataSourceError(`ensembledata-tiktok doesn't serve ${platform}`);
    }
    const clean = handle.replace(/^@/, "").trim();
    const raw = await this.get<{ user?: EDTikTokUser } | EDTikTokUser>(
      "/tiktok/user/info",
      { username: clean },
    );
    const user: EDTikTokUser = "user" in (raw as { user?: EDTikTokUser })
      ? (raw as { user: EDTikTokUser }).user
      : (raw as EDTikTokUser);
    const returnedHandle = user?.unique_id ?? user?.username;
    if (!returnedHandle) {
      throw new DataSourceError(
        `ensembledata /tiktok/user/info returned no user for ${clean} — falling through`,
      );
    }
    if (returnedHandle.toLowerCase() !== clean.toLowerCase()) {
      throw new DataSourceError(
        `ensembledata returned different user (${returnedHandle}) than requested (${clean}) — falling through`,
      );
    }
    if (user.private_account) {
      throw new PrivateAccountError(clean, "tiktok");
    }
    return {
      handle: returnedHandle,
      displayName: user.nickname ?? undefined,
      followers: Number(user.follower_count ?? 0),
      following: Number(user.following_count ?? 0),
      verified: Boolean(user.is_verified),
      isPrivate: Boolean(user.private_account),
      avatarUrl:
        user.avatar_larger?.url_list?.[0] ??
        user.avatar_url ??
        undefined,
      bio: user.signature ?? undefined,
      niche: user.region ?? undefined,
    };
  }

  override async getRecentPosts(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<Post[]> {
    if (platform !== "tiktok") return [];
    const clean = handle.replace(/^@/, "").trim();
    const raw = await this.get<{ items?: EDTikTokVideo[] } | EDTikTokVideo[]>(
      "/tiktok/user/posts",
      { username: clean, depth: "1" },
    );
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return items.slice(0, n).map((v) => normalizeVideo(v));
  }

  override async getRecentComments(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<{ post: Post; comments: CommentItem[] }> {
    if (platform !== "tiktok") return super.getRecentComments(platform, handle, n);
    const posts = await this.getRecentPosts(platform, handle, 3);
    if (posts.length === 0) return super.getRecentComments(platform, handle, n);
    const target = posts[0]!;
    const raw = await this.get<{ items?: EDTikTokComment[] } | EDTikTokComment[]>(
      "/tiktok/post/comments",
      { post_id: target.id },
    );
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    const comments: CommentItem[] = items.slice(0, n).map((c, i) => ({
      id: String(c.cid ?? i),
      username: c.user?.unique_id ?? "unknown",
      text: c.text ?? "",
      postedAt: c.create_time
        ? new Date(c.create_time * 1000).toISOString()
        : new Date().toISOString(),
      fullName: c.user?.nickname ?? undefined,
      avatarUrl: c.user?.avatar_thumb?.url_list?.[0] ?? undefined,
    }));
    return { post: target, comments };
  }

  // Followers-list endpoint on TikTok requires more setup; delegate to
  // chain fallback for now.
  override async getFollowerSample(
    platform: Platform,
    handle: string,
    _n: number,
  ): Promise<FollowerLite[]> {
    throw new DataSourceError("ensembledata-tt: getFollowerSample not implemented");
  }

  // Same trust-behavior refactor as ensembledata-instagram: delegate
  // to getProfile so a suspect Ensembledata response falls through
  // to tikwm / RapidAPI instead of returning a false "available: true".
  override async isHandleAvailable(
    platform: Platform,
    handle: string,
  ): Promise<UsernameAvailability> {
    if (platform !== "tiktok") return super.isHandleAvailable(platform, handle);
    try {
      const profile = await this.getProfile(platform, handle);
      return {
        platform: "tiktok",
        available: false,
        takenBy: {
          followers: profile.followers,
          lastActiveAgo: "recently",
        },
      };
    } catch (e) {
      if (e instanceof HandleNotFoundError) {
        return { platform: "tiktok", available: true };
      }
      throw e;
    }
  }

  override async getThumbnail(
    platform: Platform,
    handle: string,
  ): Promise<{ post: Post; resolutions: { label: string; url: string; locked: boolean }[] }> {
    if (platform !== "tiktok") return super.getThumbnail(platform, handle);
    const posts = await this.getRecentPosts(platform, handle, 1);
    if (posts.length === 0) return super.getThumbnail(platform, handle);
    const post = posts[0]!;
    const url = post.thumbnailUrl ?? "";
    return {
      post,
      resolutions: [
        { label: "SD", url, locked: false },
        { label: "HD", url: post.thumbnailUrlHd ?? url, locked: false },
      ],
    };
  }

  override async getDemographics(_platform: Platform, _handle: string): Promise<DemographicSplit> {
    throw new DataSourceError("ensembledata-tt: getDemographics not implemented");
  }

  override async getReachSignals(_platform: Platform, _handle: string): Promise<ReachSignals> {
    throw new DataSourceError("ensembledata-tt: getReachSignals not implemented");
  }

  override async getFollowerAudit(_platform: Platform, _handle: string, _sample: number): Promise<FollowerAudit> {
    throw new DataSourceError("ensembledata-tt: getFollowerAudit not implemented");
  }

  override async getUnfollowerDelta(_platform: Platform, _handle: string): Promise<UnfollowerDelta> {
    throw new DataSourceError("ensembledata-tt: getUnfollowerDelta not implemented");
  }

  override async getLiveCount(_platform: Platform, _handle: string): Promise<LiveCount> {
    throw new DataSourceError("ensembledata-tt: getLiveCount not implemented");
  }

  override async getHashtagStatus(_platform: Platform, _hashtag: string): Promise<HashtagStatus> {
    throw new DataSourceError("ensembledata-tt: getHashtagStatus not implemented");
  }

  override async estimateEarnings(platform: Platform, profile: Profile, posts: Post[]): Promise<EarningsEstimate> {
    return super.estimateEarnings(platform, profile, posts);
  }
}

function normalizeVideo(v: EDTikTokVideo): Post {
  const cover = v.video?.cover?.url_list?.[0] ?? undefined;
  const playUrl = v.video?.play_addr?.url_list?.[0] ?? undefined;
  return {
    id: String(v.aweme_id ?? ""),
    likes: Number(v.statistics?.digg_count ?? 0),
    comments: Number(v.statistics?.comment_count ?? 0),
    views: v.statistics?.play_count ?? undefined,
    postedAt: v.create_time
      ? new Date(v.create_time * 1000).toISOString()
      : new Date().toISOString(),
    thumbnailUrl: cover,
    thumbnailUrlHd: cover,
    caption: v.desc ?? undefined,
    durationSec: v.video?.duration ?? undefined,
    videoUrl: playUrl,
    videoUrlHd: playUrl,
    permalink:
      v.author?.unique_id && v.aweme_id
        ? `https://www.tiktok.com/@${v.author.unique_id}/video/${v.aweme_id}`
        : undefined,
  };
}
