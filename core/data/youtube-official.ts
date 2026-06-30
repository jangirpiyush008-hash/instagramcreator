import type { Profile, Post } from "./adapter";
import type { Platform } from "../types";
import { DataSourceError } from "../utils/errors";
import { MockProvider } from "./mock-provider";

const YT = "https://www.googleapis.com/youtube/v3";

interface YtChannel {
  id: string;
  snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  status?: { isLinked?: boolean };
}

interface YtPlaylistItem {
  contentDetails?: { videoId?: string };
}

interface YtVideo {
  id: string;
  snippet?: { publishedAt?: string };
  statistics?: { likeCount?: string; commentCount?: string; viewCount?: string };
}

// Extends MockProvider so the new DataAdapter methods (comments, demographics,
// audit, etc.) have working defaults until they're wired against real YouTube
// endpoints. Overrides getProfile + getRecentPosts with the official API.
export class YouTubeOfficialAdapter extends MockProvider {
  constructor(private readonly apiKey: string = process.env.YOUTUBE_API_KEY ?? "") {
    super("instagram");
  }

  private requireKey() {
    if (!this.apiKey) {
      throw new DataSourceError("YOUTUBE_API_KEY is not configured");
    }
  }

  private async getJson<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (e) {
      throw new DataSourceError("YouTube network error", e);
    }
    if (!res.ok) {
      throw new DataSourceError(`YouTube API ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private async resolveChannel(handle: string): Promise<YtChannel> {
    this.requireKey();
    const h = handle.startsWith("@") ? handle : `@${handle}`;
    // forHandle works for @handles (added 2023). Fallback to forUsername for legacy names.
    const url =
      `${YT}/channels?part=snippet,statistics,contentDetails` +
      `&forHandle=${encodeURIComponent(h)}&key=${this.apiKey}`;
    const j = await this.getJson<{ items?: YtChannel[] }>(url);
    if (j.items && j.items.length > 0 && j.items[0]) return j.items[0];

    const url2 =
      `${YT}/channels?part=snippet,statistics,contentDetails` +
      `&forUsername=${encodeURIComponent(handle)}&key=${this.apiKey}`;
    const j2 = await this.getJson<{ items?: YtChannel[] }>(url2);
    if (j2.items && j2.items.length > 0 && j2.items[0]) return j2.items[0];
    throw new DataSourceError(`YouTube channel not found: ${handle}`);
  }

  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    if (platform !== "youtube") {
      throw new DataSourceError(`YouTubeOfficialAdapter received platform=${platform}`);
    }
    const ch = await this.resolveChannel(handle);
    const stats = ch.statistics ?? {};
    return {
      handle,
      displayName: ch.snippet?.title,
      followers: Number(stats.subscriberCount ?? 0),
      following: 0,
      verified: ch.status?.isLinked ?? false,
      avatarUrl: ch.snippet?.thumbnails?.default?.url,
    };
  }

  override async getRecentPosts(platform: Platform, handle: string, n: number): Promise<Post[]> {
    if (platform !== "youtube") {
      throw new DataSourceError(`YouTubeOfficialAdapter received platform=${platform}`);
    }
    const ch = await this.resolveChannel(handle);
    const uploadsId = ch.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) return [];

    const max = Math.min(Math.max(n, 1), 50);
    const playlistUrl =
      `${YT}/playlistItems?part=contentDetails&playlistId=${uploadsId}` +
      `&maxResults=${max}&key=${this.apiKey}`;
    const pj = await this.getJson<{ items?: YtPlaylistItem[] }>(playlistUrl);
    const videoIds = (pj.items ?? [])
      .map((i) => i.contentDetails?.videoId)
      .filter((v): v is string => Boolean(v));
    if (videoIds.length === 0) return [];

    const videosUrl =
      `${YT}/videos?part=snippet,statistics&id=${videoIds.join(",")}` +
      `&key=${this.apiKey}`;
    const vj = await this.getJson<{ items?: YtVideo[] }>(videosUrl);
    return (vj.items ?? []).map((v) => ({
      id: v.id,
      likes: Number(v.statistics?.likeCount ?? 0),
      comments: Number(v.statistics?.commentCount ?? 0),
      views: Number(v.statistics?.viewCount ?? 0),
      postedAt: v.snippet?.publishedAt ?? new Date(0).toISOString(),
    }));
  }
}
