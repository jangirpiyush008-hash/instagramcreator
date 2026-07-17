// TikTok data via the OFFICIAL EnsembleData Node SDK.
// Delegates HTTP/auth/UA to the SDK; we just adapt response shapes
// to our DataAdapter contract.

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

const SDK_TIMEOUT_SEC = 14;

interface EDTikTokUser {
  uniqueId?: string;
  unique_id?: string;
  nickname?: string;
  signature?: string;
  followerCount?: number;
  follower_count?: number;
  followingCount?: number;
  following_count?: number;
  verified?: boolean;
  is_verified?: boolean;
  privateAccount?: boolean;
  private_account?: boolean;
  avatarLarger?: string;
  avatar_larger?: { url_list?: string[] };
  avatar_url?: string;
  region?: string;
}

interface EDTikTokVideo {
  awemeId?: string;
  aweme_id?: string;
  desc?: string;
  createTime?: number;
  create_time?: number;
  statistics?: {
    digg_count?: number;
    comment_count?: number;
    play_count?: number;
    share_count?: number;
  };
  stats?: {
    diggCount?: number;
    commentCount?: number;
    playCount?: number;
    shareCount?: number;
  };
  video?: {
    cover?: string | { url_list?: string[] };
    playAddr?: string;
    play_addr?: { url_list?: string[] };
    duration?: number;
  };
  author?: { uniqueId?: string; unique_id?: string };
}

interface EDTikTokComment {
  cid?: string;
  id?: string;
  text?: string;
  createTime?: number;
  create_time?: number;
  user?: {
    uniqueId?: string;
    unique_id?: string;
    nickname?: string;
    avatarThumb?: string;
    avatar_thumb?: { url_list?: string[] };
  };
}

export class EnsembleDataTikTokAdapter extends MockProvider implements DataAdapter {
  private readonly client: ReturnType<typeof EDClient> | null;

  constructor(token?: string) {
    super("tiktok");
    const raw = (token ?? process.env.ENSEMBLEDATA_TOKEN ?? "").trim();
    const clean = raw.replace(/^["']|["']$/g, "");
    this.client = clean
      ? EDClient({ token: clean, timeout: SDK_TIMEOUT_SEC })
      : null;
  }

  private mapError(e: unknown, method: string): Error {
    if (e instanceof EDError) {
      const status = e.statusCode;
      const detail = e.detail || "";
      if (status === 402 || status === 429) return new ProviderRateLimitError("ensembledata", method);
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

  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    if (platform !== "tiktok") {
      throw new DataSourceError(`ensembledata-tiktok doesn't serve ${platform}`);
    }
    if (!this.client) throw new DataSourceError("ENSEMBLEDATA_TOKEN is not configured");
    const clean = handle.replace(/^@/, "").trim();
    let res: { data: unknown };
    try {
      res = await this.client.tiktok.userInfoFromUsername({ username: clean });
    } catch (e) {
      throw this.mapError(e, "/tt/user/info");
    }
    // TT SDK returns { user: {...}, stats: {...} } typically.
    const wrapper = res.data as { user?: EDTikTokUser; userInfo?: { user?: EDTikTokUser } } | EDTikTokUser;
    const user: EDTikTokUser | undefined =
      "user" in (wrapper as { user?: EDTikTokUser })
        ? (wrapper as { user?: EDTikTokUser }).user
        : "userInfo" in (wrapper as { userInfo?: { user?: EDTikTokUser } })
          ? (wrapper as { userInfo?: { user?: EDTikTokUser } }).userInfo?.user
          : (wrapper as EDTikTokUser);
    const returned = user?.uniqueId ?? user?.unique_id;
    if (!user || !returned) {
      throw new DataSourceError(
        `ensembledata /tt/user/info returned no user for ${clean} — falling through`,
      );
    }
    if (returned.toLowerCase() !== clean.toLowerCase()) {
      throw new DataSourceError(
        `ensembledata returned different user (${returned}) than requested (${clean}) — falling through`,
      );
    }
    if (user.privateAccount ?? user.private_account) {
      throw new PrivateAccountError(clean, "tiktok");
    }
    return {
      handle: returned,
      displayName: user.nickname ?? undefined,
      followers: Number(user.followerCount ?? user.follower_count ?? 0),
      following: Number(user.followingCount ?? user.following_count ?? 0),
      verified: Boolean(user.verified ?? user.is_verified),
      isPrivate: Boolean(user.privateAccount ?? user.private_account),
      avatarUrl:
        typeof user.avatarLarger === "string"
          ? user.avatarLarger
          : user.avatar_larger?.url_list?.[0] ?? user.avatar_url ?? undefined,
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
    if (!this.client) throw new DataSourceError("ENSEMBLEDATA_TOKEN is not configured");
    const clean = handle.replace(/^@/, "").trim();
    let res: { data: unknown };
    try {
      res = await this.client.tiktok.userPostsFromUsername({ username: clean, depth: 1 });
    } catch (e) {
      throw this.mapError(e, "/tt/user/posts");
    }
    const raw = res.data as
      | { aweme_list?: EDTikTokVideo[]; items?: EDTikTokVideo[] }
      | EDTikTokVideo[];
    const items: EDTikTokVideo[] = Array.isArray(raw)
      ? raw
      : (raw?.aweme_list ?? raw?.items ?? []);
    return items.slice(0, n).map((v) => normalizeVideo(v));
  }

  override async getRecentComments(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<{ post: Post; comments: CommentItem[] }> {
    if (platform !== "tiktok") return super.getRecentComments(platform, handle, n);
    if (!this.client) throw new DataSourceError("ENSEMBLEDATA_TOKEN is not configured");
    const posts = await this.getRecentPosts(platform, handle, 3);
    if (posts.length === 0) return super.getRecentComments(platform, handle, n);
    const target = posts[0]!;
    let res: { data: unknown };
    try {
      res = await this.client.tiktok.postCommentsById({ awemeId: target.id });
    } catch (e) {
      throw this.mapError(e, "/tt/post/comments");
    }
    const raw = res.data as
      | { comments?: EDTikTokComment[]; items?: EDTikTokComment[] }
      | EDTikTokComment[];
    const items: EDTikTokComment[] = Array.isArray(raw)
      ? raw
      : (raw?.comments ?? raw?.items ?? []);
    const comments: CommentItem[] = items.slice(0, n).map((c, i) => ({
      id: String(c.cid ?? c.id ?? i),
      username: c.user?.uniqueId ?? c.user?.unique_id ?? "unknown",
      text: c.text ?? "",
      postedAt: c.createTime
        ? new Date(c.createTime * 1000).toISOString()
        : c.create_time
          ? new Date(c.create_time * 1000).toISOString()
          : new Date().toISOString(),
      fullName: c.user?.nickname ?? undefined,
      avatarUrl:
        typeof c.user?.avatarThumb === "string"
          ? c.user.avatarThumb
          : c.user?.avatar_thumb?.url_list?.[0] ?? undefined,
    }));
    return { post: target, comments };
  }

  override async getFollowerSample(
    _platform: Platform,
    _handle: string,
    _n: number,
  ): Promise<FollowerLite[]> {
    throw new DataSourceError("ensembledata-tt: getFollowerSample not implemented");
  }

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
        takenBy: { followers: profile.followers, lastActiveAgo: "recently" },
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
  const id = v.awemeId ?? v.aweme_id ?? "";
  const cover =
    typeof v.video?.cover === "string"
      ? v.video.cover
      : v.video?.cover?.url_list?.[0] ?? undefined;
  const playUrl =
    v.video?.playAddr ??
    v.video?.play_addr?.url_list?.[0] ??
    undefined;
  const likes = v.stats?.diggCount ?? v.statistics?.digg_count ?? 0;
  const comments = v.stats?.commentCount ?? v.statistics?.comment_count ?? 0;
  const views = v.stats?.playCount ?? v.statistics?.play_count ?? undefined;
  const createdAt = v.createTime ?? v.create_time;
  const uid = v.author?.uniqueId ?? v.author?.unique_id;
  return {
    id: String(id),
    likes: Number(likes),
    comments: Number(comments),
    views,
    postedAt: createdAt
      ? new Date(createdAt * 1000).toISOString()
      : new Date().toISOString(),
    thumbnailUrl: cover,
    thumbnailUrlHd: cover,
    caption: v.desc ?? undefined,
    durationSec: v.video?.duration ?? undefined,
    videoUrl: playUrl,
    videoUrlHd: playUrl,
    permalink: uid && id ? `https://www.tiktok.com/@${uid}/video/${id}` : undefined,
  };
}
