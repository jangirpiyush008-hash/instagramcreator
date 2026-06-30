// Real Instagram data via the rocketapi `instagram-scraper-api2` provider on
// RapidAPI. Inherits from MockProvider so any method we haven't implemented
// (demographics, follower audit, reach signals) falls back to mock data.
//
// Activated when RAPIDAPI_KEY + IG_RAPIDAPI_HOST env vars are set; otherwise
// adapterFor("instagram") returns the plain MockProvider.

import type { Platform } from "../types";
import type { Profile, Post, UsernameAvailability, CommentItem } from "./adapter";
import { MockProvider } from "./mock-provider";
import { rapidApiFetch, type RapidAPIConfig } from "./rapidapi-base";

// Endpoint response shapes for instagram-scraper-api2 (rocketapi).
// Defensive typing — providers change fields without warning.
interface RawProfile {
  user?: {
    pk?: string;
    username?: string;
    full_name?: string;
    biography?: string;
    is_verified?: boolean;
    follower_count?: number;
    following_count?: number;
    profile_pic_url?: string;
  };
}

interface RawMedia {
  pk?: string;
  id?: string;
  like_count?: number;
  comment_count?: number;
  play_count?: number;
  view_count?: number;
  taken_at?: number;            // unix seconds
  caption?: { text?: string } | null;
  image_versions2?: { candidates?: { url?: string }[] };
  video_duration?: number;
}

interface RawFeed {
  items?: RawMedia[];
  // some plans return data.items instead
  data?: { items?: RawMedia[] };
}

interface RawSearch {
  data?: { users?: { pk?: string; username?: string }[] };
}

export class RapidAPIInstagramAdapter extends MockProvider {
  private readonly cfg: RapidAPIConfig;

  constructor(apiKey?: string, host?: string) {
    super("instagram");
    this.cfg = {
      apiKey: apiKey ?? process.env.RAPIDAPI_KEY ?? "",
      host: host ?? process.env.IG_RAPIDAPI_HOST ?? "instagram-scraper-api2.p.rapidapi.com",
    };
  }

  private async safe<T>(label: string, fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      console.warn(`[rapidapi-instagram] ${label} failed, falling back to mock:`, e instanceof Error ? e.message : e);
      return fallback();
    }
  }

  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    return this.safe<Profile>(
      "getProfile",
      async () => {
        const j = await rapidApiFetch<RawProfile>(
          this.cfg,
          `/v1/info?username_or_id_or_url=${encodeURIComponent(handle)}`,
        );
        const u = j.user;
        if (!u || u.follower_count === undefined) {
          throw new Error("response missing user.follower_count");
        }
        return {
          handle,
          displayName: u.full_name ?? handle,
          followers: u.follower_count,
          following: u.following_count ?? 0,
          verified: u.is_verified ?? false,
          avatarUrl: u.profile_pic_url,
          bio: u.biography,
        };
      },
      () => super.getProfile(platform, handle),
    );
  }

  override async getRecentPosts(platform: Platform, handle: string, n: number): Promise<Post[]> {
    return this.safe<Post[]>(
      "getRecentPosts",
      async () => {
        const j = await rapidApiFetch<RawFeed>(
          this.cfg,
          `/v1/posts?username_or_id_or_url=${encodeURIComponent(handle)}`,
        );
        const items = (j.items ?? j.data?.items ?? []).slice(0, n);
        if (items.length === 0) throw new Error("no posts returned");
        return items.map<Post>((m) => ({
          id: String(m.pk ?? m.id ?? Math.random().toString(36).slice(2)),
          likes: m.like_count ?? 0,
          comments: m.comment_count ?? 0,
          views: m.play_count ?? m.view_count,
          postedAt: m.taken_at ? new Date(m.taken_at * 1000).toISOString() : new Date().toISOString(),
          thumbnailUrl: m.image_versions2?.candidates?.[0]?.url,
          title: m.caption?.text?.slice(0, 80),
          caption: m.caption?.text,
          durationSec: m.video_duration,
        }));
      },
      () => super.getRecentPosts(platform, handle, n),
    );
  }

  override async isHandleAvailable(platform: Platform, handle: string): Promise<UsernameAvailability> {
    return this.safe<UsernameAvailability>(
      "isHandleAvailable",
      async () => {
        // If getProfile returns a real follower count, the handle is TAKEN.
        // 404 / missing user means AVAILABLE.
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

  override async getRecentComments(platform: Platform, handle: string, n: number) {
    return this.safe(
      "getRecentComments",
      async () => {
        const posts = await this.getRecentPosts(platform, handle, 1);
        const post = posts[0];
        if (!post) throw new Error("no recent post for comments");
        const j = await rapidApiFetch<{ items?: { pk?: string; user?: { username?: string }; text?: string; created_at?: number }[]; comment_count?: number }>(
          this.cfg,
          `/v1/comments?code_or_id_or_url=${encodeURIComponent(post.id)}`,
        );
        const comments: CommentItem[] = (j.items ?? []).slice(0, n).map((c) => ({
          id: String(c.pk ?? Math.random().toString(36).slice(2)),
          username: c.user?.username ?? "unknown",
          text: c.text ?? "",
          postedAt: c.created_at ? new Date(c.created_at * 1000).toISOString() : new Date().toISOString(),
        }));
        const totalComments = j.comment_count ?? post.comments;
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
        return {
          post,
          resolutions: [
            { label: "Standard (640×360)", url: post.thumbnailUrl, locked: false },
            { label: "HD (1280×720)", url: post.thumbnailUrl, locked: true },
            { label: "Full HD (1920×1080)", url: post.thumbnailUrl, locked: true },
            { label: "Max-res (original)", url: post.thumbnailUrl, locked: true },
          ],
        };
      },
      () => super.getThumbnail(platform, handle),
    );
  }
}
