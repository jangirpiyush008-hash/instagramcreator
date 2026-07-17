// Real TikTok data via the tikwm `tiktok-scraper7` provider on RapidAPI.
// Same fallback pattern as RapidAPIInstagramAdapter.

import type { Platform } from "../types";
import type { Profile, Post, UsernameAvailability, CommentItem, FollowerLite } from "./adapter";
import { MockProvider } from "./mock-provider";
import { rapidApiFetch, type RapidAPIConfig } from "./rapidapi-base";
import { DataUnavailableError, HandleNotFoundError, PrivateAccountError, ProviderRateLimitError } from "../utils/errors";

interface RawUserInfo {
  data?: {
    user?: {
      id?: string;
      uniqueId?: string;
      nickname?: string;
      verified?: boolean;
      signature?: string;
      avatarLarger?: string;
      // TikTok exposes private profiles via privateAccount / secret flags
      privateAccount?: boolean;
      secret?: boolean;
    };
    stats?: {
      followerCount?: number;
      followingCount?: number;
      videoCount?: number;
      heartCount?: number;
    };
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
  create_time?: number;          // unix seconds
  createTime?: number;
  title?: string;
  desc?: string;
  cover?: string;
  origin_cover?: string;
  ai_dynamic_cover?: string;
  dynamic_cover?: string;
  duration?: number;
  // tikwm returns the playback URL under several possible fields depending on
  // whether the video has a watermark or not.
  play?: string;                 // watermarked download URL
  wmplay?: string;               // alt watermarked field name
  hdplay?: string;               // non-watermarked HD URL when available
  play_url?: string;
}

// tikwm/tiktok-scraper7 has shipped a few different field names for the video
// array over the years — `videos` (current docs), `list` (older), `aweme_list`
// (from the underlying TikTok Android API), `itemList` (webapp-shape). Accept
// them all so a schema drift on their side doesn't silently break us.
interface RawVideoList {
  data?: {
    videos?: RawVideo[];
    list?: RawVideo[];
    aweme_list?: RawVideo[];
    itemList?: RawVideo[];
  };
  videos?: RawVideo[];
}

interface RawCommentsList {
  data?: {
    comments?: {
      cid?: string;
      user?: { unique_id?: string };
      text?: string;
      create_time?: number;
    }[];
    total?: number;
  };
}

export class RapidAPITikTokAdapter extends MockProvider {
  private readonly cfg: RapidAPIConfig;

  constructor(apiKey?: string, host?: string) {
    super("tiktok");
    this.cfg = {
      apiKey: apiKey ?? process.env.RAPIDAPI_KEY ?? "",
      host: host ?? process.env.TIKTOK_RAPIDAPI_HOST ?? "tiktok-scraper7.p.rapidapi.com",
    };
  }

  private async safe<T>(label: string, fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      // Private accounts, handle-not-found, and upstream rate limits must
      // all surface honestly — never mask them with mock data.
      if (e instanceof PrivateAccountError) throw e;
      if (e instanceof HandleNotFoundError) throw e;
      if (e instanceof ProviderRateLimitError) throw e;
      if (e instanceof DataUnavailableError) throw e;
      console.warn(`[rapidapi-tiktok] ${label} failed, falling back to mock:`, e instanceof Error ? e.message : e);
      return fallback();
    }
  }

  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    return this.safe<Profile>(
      "getProfile",
      async () => {
        const j = await rapidApiFetch<RawUserInfo>(
          this.cfg,
          `/user/info?unique_id=${encodeURIComponent(handle)}`,
        );
        const u = j.data?.user;
        const s = j.data?.stats;
        if (!u || !s || s.followerCount === undefined) {
          throw new Error("response missing user/stats");
        }
        // Same STRICT wrong-account guard as the IG adapter — refuse when
        // the response either omits uniqueId or returns a non-matching one.
        // Without a positive match we can't confirm we got the right
        // account, so we treat it as not-found rather than risk wrong data.
        const returnedUsername = (u.uniqueId ?? "").toLowerCase();
        const requested = handle.toLowerCase();
        console.log(
          `[rapidapi-tiktok] getProfile requested="${requested}" returned_uniqueId="${returnedUsername || "<empty>"}" followers=${s.followerCount}`,
        );
        if (returnedUsername !== requested) {
          console.warn(
            `[rapidapi-tiktok] getProfile handle mismatch — requested "${requested}", got "${returnedUsername || "<empty>"}". Refusing to avoid wrong-account data.`,
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
        const j = await rapidApiFetch<RawVideoList>(
          this.cfg,
          `/user/posts?unique_id=${encodeURIComponent(handle)}&count=${Math.min(Math.max(n, 1), 30)}`,
        );
        const videos =
          j.data?.videos ??
          j.data?.list ??
          j.data?.aweme_list ??
          j.data?.itemList ??
          j.videos ??
          [];
        if (videos.length === 0) {
          // Log the actual response shape (keys only, no values) so we can see
          // what tikwm renamed the field to without leaking anything sensitive.
          const dataKeys = j.data ? Object.keys(j.data).join(",") : "<no data>";
          const rootKeys = Object.keys(j).join(",");
          console.warn(
            `[rapidapi-tiktok] /user/posts returned empty. root keys=[${rootKeys}] data keys=[${dataKeys}]`,
          );
          throw new Error("no videos returned");
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

  override async isHandleAvailable(platform: Platform, handle: string): Promise<UsernameAvailability> {
    return this.safe<UsernameAvailability>(
      "isHandleAvailable",
      async () => {
        try {
          const profile = await this.getProfile(platform, handle);
          if (!profile.followers && profile.followers !== 0) {
            return { platform, available: true };
          }
          return {
            platform,
            available: false,
            takenBy: { followers: profile.followers, lastActiveAgo: "recently" },
          };
        } catch {
          return { platform, available: true };
        }
      },
      () => super.isHandleAvailable(platform, handle),
    );
  }

  override async getFollowerSample(platform: Platform, handle: string, n: number): Promise<FollowerLite[]> {
    return this.safe<FollowerLite[]>(
      "getFollowerSample",
      async () => {
        // tikwm sidebar names this "Get User's Followers" at /user/followers.
        interface RawFollowerList {
          data?: {
            followers?: { user?: { unique_id?: string; uniqueId?: string; nickname?: string } }[];
            list?: { user?: { unique_id?: string; uniqueId?: string; nickname?: string } }[];
          };
        }
        const j = await rapidApiFetch<RawFollowerList>(
          this.cfg,
          `/user/followers?unique_id=${encodeURIComponent(handle)}&count=${Math.min(Math.max(n, 1), 200)}`,
        );
        const raw = j.data?.followers ?? j.data?.list ?? [];
        if (raw.length === 0) {
          const dataKeys = j.data ? Object.keys(j.data).join(",") : "<no data>";
          console.warn(
            `[rapidapi-tiktok] /user/followers returned empty. data keys=[${dataKeys}]`,
          );
          throw new Error("no followers in response");
        }
        return raw.slice(0, n).map<FollowerLite>((entry) => ({
          username: entry.user?.uniqueId ?? entry.user?.unique_id ?? "",
          fullName: entry.user?.nickname,
        }));
      },
      () => super.getFollowerSample(platform, handle, n),
    );
  }

  override async getRecentComments(platform: Platform, handle: string, n: number) {
    return this.safe(
      "getRecentComments",
      async () => {
        const posts = await this.getRecentPosts(platform, handle, 1);
        const post = posts[0];
        if (!post) throw new Error("no recent post for comments");
        const j = await rapidApiFetch<RawCommentsList>(
          this.cfg,
          `/comment/list?url=${encodeURIComponent(post.id)}&count=${Math.min(n, 50)}`,
        );
        const comments: CommentItem[] = (j.data?.comments ?? []).slice(0, n).map((c) => ({
          id: String(c.cid ?? Math.random().toString(36).slice(2)),
          username: c.user?.unique_id ?? "unknown",
          text: c.text ?? "",
          postedAt: c.create_time ? new Date(c.create_time * 1000).toISOString() : new Date().toISOString(),
        }));
        const totalComments = j.data?.total ?? post.comments;
        return {
          post: { ...post, comments: totalComments },
          comments,
        };
      },
      () => super.getRecentComments(platform, handle, n),
    );
  }

  override async getThumbnail(platform: Platform, handle: string) {
    return this.safe(
      "getThumbnail",
      async () => {
        const posts = await this.getRecentPosts(platform, handle, 1);
        const post = posts[0];
        if (!post?.thumbnailUrl) throw new Error("no thumbnail url");
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
