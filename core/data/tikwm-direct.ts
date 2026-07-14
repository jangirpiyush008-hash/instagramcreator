// Real TikTok data via tikwmapi.com DIRECT — no RapidAPI middleman.
//
// Why: same underlying tikwm data that `RapidAPITikTokAdapter` fetches via
// `tiktok-scraper7.p.rapidapi.com`, but hit direct at api.tikwmapi.com.
// Cheaper (no RapidAPI cut), same reliability, same data quality.
//
// Auth: `x-tikwmapi-key` header. Response envelope:
//   { code: 0, msg: "success", data: {...}, processed_time: X }
// Non-zero codes: 10401 (missing key), 10429 (rate limited), 10430 (quota).
//
// Response shapes are IDENTICAL to what we get from the RapidAPI wrapper
// (both wrap tikwm), so all the defensive parsing from RapidAPITikTokAdapter
// carries over verbatim. The only meaningful differences are base URL and
// how auth failures / rate limits surface.

import type { Platform } from "../types";
import type { Profile, Post, UsernameAvailability, CommentItem, FollowerLite } from "./adapter";
import { MockProvider } from "./mock-provider";
import { DataSourceError, HandleNotFoundError, PrivateAccountError, ProviderRateLimitError } from "../utils/errors";

const HOST = "api.tikwmapi.com";

interface TikwmEnvelope<T> {
  code?: number;
  msg?: string;
  processed_time?: number;
  data?: T;
}

interface UserInfoData {
  user?: {
    id?: string;
    uniqueId?: string;
    nickname?: string;
    verified?: boolean;
    signature?: string;
    avatarLarger?: string;
    privateAccount?: boolean;
    secret?: boolean;
  };
  stats?: {
    followerCount?: number;
    followingCount?: number;
    videoCount?: number;
    heartCount?: number;
  };
}

interface RawVideo {
  video_id?: string;
  aweme_id?: string;
  id?: string;
  digg_count?: number;
  like_count?: number;
  comment_count?: number;
  play_count?: number;
  view_count?: number;
  share_count?: number;
  create_time?: number;
  createTime?: number;
  title?: string;
  desc?: string;
  cover?: string;
  origin_cover?: string;
  ai_dynamic_cover?: string;
  dynamic_cover?: string;
  duration?: number;
  play?: string;
  wmplay?: string;
  hdplay?: string;
  play_url?: string;
}

interface VideoListData {
  videos?: RawVideo[];
  list?: RawVideo[];
  aweme_list?: RawVideo[];
  itemList?: RawVideo[];
}

interface CommentsData {
  comments?: {
    cid?: string;
    user?: { unique_id?: string };
    text?: string;
    create_time?: number;
  }[];
  total?: number;
}

interface FollowersData {
  followers?: { user?: { uniqueId?: string; unique_id?: string; nickname?: string } }[];
  list?: { user?: { uniqueId?: string; unique_id?: string; nickname?: string } }[];
}

export class TikwmDirectAdapter extends MockProvider {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    super("tiktok");
    this.apiKey = apiKey ?? process.env.TIKWM_API_KEY ?? "";
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.apiKey) {
      throw new DataSourceError("TIKWM_API_KEY is not configured");
    }
    const url = `https://${HOST}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        headers: {
          "x-tikwmapi-key": this.apiKey,
          accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 429 || res.status === 403) {
        throw new ProviderRateLimitError(HOST, path);
      }
      if (!res.ok) {
        throw new DataSourceError(`${HOST} ${path} returned ${res.status}`);
      }
      const j = (await res.json()) as TikwmEnvelope<T>;
      // tikwm returns HTTP 200 with an application-level error code — 10429
      // = rate-limited, 10430 = quota exhausted, 10401 = auth. Surface these
      // the same way we surface upstream network 429s.
      if (j.code === 10429 || j.code === 10430) {
        throw new ProviderRateLimitError(HOST, path);
      }
      if (j.code === 10401) {
        throw new DataSourceError("TIKWM_API_KEY rejected — check the value on Railway");
      }
      if (j.code !== 0 && j.code !== undefined) {
        throw new DataSourceError(`${HOST} ${path} returned code=${j.code} msg=${j.msg ?? "unknown"}`);
      }
      // Some tikwm endpoints omit `code` on success — treat missing as ok.
      if (!j.data) {
        throw new DataSourceError(`${HOST} ${path} returned empty data`);
      }
      return j.data;
    } catch (e) {
      if (e instanceof ProviderRateLimitError) throw e;
      if (e instanceof HandleNotFoundError) throw e;
      if (e instanceof DataSourceError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new DataSourceError(`${HOST} timeout after 12s`);
      }
      throw new DataSourceError(`${HOST} fetch error`, e);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safe<T>(label: string, fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof PrivateAccountError) throw e;
      if (e instanceof HandleNotFoundError) throw e;
      if (e instanceof ProviderRateLimitError) throw e;
      console.warn(`[tikwm-direct] ${label} failed, falling back to mock:`, e instanceof Error ? e.message : e);
      return fallback();
    }
  }

  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    return this.safe<Profile>(
      "getProfile",
      async () => {
        const data = await this.get<UserInfoData>(`/user/info?unique_id=${encodeURIComponent(handle)}`);
        const u = data.user;
        const s = data.stats;
        if (!u || !s || s.followerCount === undefined) {
          throw new DataSourceError("response missing user/stats");
        }
        // Wrong-account guard — refuse if returned uniqueId doesn't match.
        const returnedUsername = (u.uniqueId ?? "").toLowerCase();
        const requested = handle.toLowerCase();
        console.log(
          `[tikwm-direct] getProfile requested="${requested}" returned_uniqueId="${returnedUsername || "<empty>"}" followers=${s.followerCount}`,
        );
        if (returnedUsername !== requested) {
          console.warn(
            `[tikwm-direct] getProfile handle mismatch — requested "${requested}", got "${returnedUsername || "<empty>"}". Refusing to avoid wrong-account data.`,
          );
          throw new HandleNotFoundError(handle, "tiktok");
        }
        if (u.privateAccount === true || u.secret === true) {
          throw new PrivateAccountError(handle, "tiktok");
        }
        return {
          handle,
          displayName: u.nickname ?? handle,
          followers: s.followerCount,
          following: s.followingCount ?? 0,
          verified: u.verified ?? false,
          isPrivate: false,
          avatarUrl: u.avatarLarger,
          bio: u.signature,
        };
      },
      () => super.getProfile(platform, handle),
    );
  }

  override async getRecentPosts(platform: Platform, handle: string, n: number): Promise<Post[]> {
    return this.safe<Post[]>(
      "getRecentPosts",
      async () => {
        const count = Math.min(Math.max(n, 1), 30);
        const data = await this.get<VideoListData>(
          `/user/posts?unique_id=${encodeURIComponent(handle)}&count=${count}`,
        );
        const videos = data.videos ?? data.list ?? data.aweme_list ?? data.itemList ?? [];
        if (videos.length === 0) {
          const dataKeys = Object.keys(data).join(",");
          console.warn(
            `[tikwm-direct] /user/posts returned empty. data keys=[${dataKeys}]`,
          );
          throw new DataSourceError("no videos returned");
        }
        return videos.slice(0, n).map<Post>((v) => {
          const videoId = String(v.video_id ?? v.aweme_id ?? v.id ?? Math.random().toString(36).slice(2));
          return {
            id: videoId,
            likes: v.digg_count ?? v.like_count ?? 0,
            comments: v.comment_count ?? 0,
            views: v.play_count ?? v.view_count,
            postedAt: v.create_time
              ? new Date(v.create_time * 1000).toISOString()
              : v.createTime
              ? new Date(v.createTime * 1000).toISOString()
              : new Date().toISOString(),
            thumbnailUrl: v.cover ?? v.origin_cover ?? v.dynamic_cover ?? v.ai_dynamic_cover,
            thumbnailUrlHd: v.origin_cover ?? v.cover,
            title: (v.title ?? v.desc)?.slice(0, 80),
            caption: v.title ?? v.desc,
            durationSec: v.duration,
            videoUrl: v.play ?? v.wmplay ?? v.play_url,
            videoUrlHd: v.hdplay ?? v.play ?? v.play_url,
            permalink: `https://www.tiktok.com/@${handle}/video/${videoId}`,
          };
        });
      },
      () => super.getRecentPosts(platform, handle, n),
    );
  }

  override async getRecentComments(platform: Platform, handle: string, n: number) {
    return this.safe(
      "getRecentComments",
      async () => {
        const posts = await this.getRecentPosts(platform, handle, 1);
        const post = posts[0];
        if (!post) throw new DataSourceError("no recent post for comments");
        const data = await this.get<CommentsData>(
          `/comment/list?url=${encodeURIComponent(post.id)}&count=${Math.min(n, 50)}`,
        );
        const comments: CommentItem[] = (data.comments ?? []).slice(0, n).map((c) => ({
          id: String(c.cid ?? Math.random().toString(36).slice(2)),
          username: c.user?.unique_id ?? "unknown",
          text: c.text ?? "",
          postedAt: c.create_time ? new Date(c.create_time * 1000).toISOString() : new Date().toISOString(),
        }));
        const totalComments = data.total ?? post.comments;
        return {
          post: { ...post, comments: totalComments },
          comments,
        };
      },
      () => super.getRecentComments(platform, handle, n),
    );
  }

  override async getFollowerSample(platform: Platform, handle: string, n: number): Promise<FollowerLite[]> {
    return this.safe<FollowerLite[]>(
      "getFollowerSample",
      async () => {
        const data = await this.get<FollowersData>(
          `/user/followers?unique_id=${encodeURIComponent(handle)}&count=${Math.min(Math.max(n, 1), 200)}`,
        );
        const raw = data.followers ?? data.list ?? [];
        if (raw.length === 0) {
          const dataKeys = Object.keys(data).join(",");
          console.warn(`[tikwm-direct] /user/followers returned empty. data keys=[${dataKeys}]`);
          throw new DataSourceError("no followers in response");
        }
        return raw.slice(0, n).map<FollowerLite>((entry) => ({
          username: entry.user?.uniqueId ?? entry.user?.unique_id ?? "",
          fullName: entry.user?.nickname,
        }));
      },
      () => super.getFollowerSample(platform, handle, n),
    );
  }

  override async isHandleAvailable(platform: Platform, handle: string): Promise<UsernameAvailability> {
    return this.safe<UsernameAvailability>(
      "isHandleAvailable",
      async () => {
        try {
          const profile = await this.getProfile(platform, handle);
          return {
            platform,
            available: false,
            takenBy: { followers: profile.followers, lastActiveAgo: "recently" },
          };
        } catch (e) {
          if (e instanceof HandleNotFoundError) {
            return { platform, available: true };
          }
          throw e;
        }
      },
      () => super.isHandleAvailable(platform, handle),
    );
  }

  override async getThumbnail(platform: Platform, handle: string) {
    return this.safe(
      "getThumbnail",
      async () => {
        const posts = await this.getRecentPosts(platform, handle, 1);
        const post = posts[0];
        if (!post?.thumbnailUrl) throw new DataSourceError("no thumbnail url");
        const sd = post.thumbnailUrl;
        const hd = post.thumbnailUrlHd ?? post.thumbnailUrl;
        const resolutions: { label: string; url: string; locked: boolean }[] = [
          { label: "Cover (SD)", url: sd, locked: false },
          { label: "Cover (HD)", url: hd, locked: false },
        ];
        if (post.videoUrl) {
          resolutions.push({ label: "Video (watermarked)", url: post.videoUrl, locked: false });
        }
        if (post.videoUrlHd && post.videoUrlHd !== post.videoUrl) {
          resolutions.push({ label: "Video (HD, no watermark)", url: post.videoUrlHd, locked: false });
        }
        return { post, resolutions };
      },
      () => super.getThumbnail(platform, handle),
    );
  }
}
