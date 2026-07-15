import type { Profile, Post, CommentItem, FollowerLite } from "./adapter";
import type { Platform } from "../types";
import { DataSourceError, HandleNotFoundError, ProviderRateLimitError } from "../utils/errors";
import { MockProvider } from "./mock-provider";

const YT = "https://www.googleapis.com/youtube/v3";

interface YtChannel {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  status?: { isLinked?: boolean };
}

interface YtPlaylistItem {
  contentDetails?: { videoId?: string };
  snippet?: { title?: string; description?: string };
}

interface YtVideo {
  id: string;
  snippet?: {
    publishedAt?: string;
    title?: string;
    description?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
      standard?: { url?: string };
      maxres?: { url?: string };
    };
  };
  statistics?: { likeCount?: string; commentCount?: string; viewCount?: string };
  contentDetails?: { duration?: string };
}

interface YtCommentThread {
  snippet?: {
    topLevelComment?: {
      id?: string;
      snippet?: {
        authorDisplayName?: string;
        // YouTube always returns the commenter's profile photo URL inline.
        // We surface it via CommentItem.avatarUrl so audience-enrichment
        // can feed it directly to face-analyzer without a follow-up API call.
        authorProfileImageUrl?: string;
        authorChannelUrl?: string;
        textDisplay?: string;
        textOriginal?: string;
        publishedAt?: string;
      };
    };
  };
}

// Parse an ISO-8601 duration (PT1M32S) into seconds. Small helper — YT videos
// use this format across the API and we display it in MediaCard.
function parseIsoDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return h * 3600 + min * 60 + s;
}

// Extends MockProvider so unimplemented DataAdapter methods have working
// defaults, BUT — following the pattern we established for IG/TikTok — every
// method we intentionally can't support on YouTube should either return a
// clearly-empty result OR throw a bubbling error, never silently mock.
export class YouTubeOfficialAdapter extends MockProvider {
  constructor(private readonly apiKey: string = process.env.YOUTUBE_API_KEY ?? "") {
    super("instagram");
  }

  private requireKey() {
    if (!this.apiKey) {
      throw new DataSourceError("YOUTUBE_API_KEY is not configured on this deployment");
    }
  }

  private async getJson<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (e) {
      throw new DataSourceError("YouTube network error", e);
    }
    if (res.status === 403) {
      // 403 on the YouTube Data API almost always means quota exhausted for
      // the day — surface as our provider-rate-limit error so the UI shows
      // the same honest "please try again" state as IG/TikTok 429s.
      throw new ProviderRateLimitError("youtube.googleapis.com", url.split("?")[0] ?? "");
    }
    if (res.status === 429) {
      throw new ProviderRateLimitError("youtube.googleapis.com", url.split("?")[0] ?? "");
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
      `${YT}/channels?part=snippet,statistics,contentDetails,status` +
      `&forHandle=${encodeURIComponent(h)}&key=${this.apiKey}`;
    const j = await this.getJson<{ items?: YtChannel[] }>(url);
    if (j.items && j.items.length > 0 && j.items[0]) return j.items[0];

    const url2 =
      `${YT}/channels?part=snippet,statistics,contentDetails,status` +
      `&forUsername=${encodeURIComponent(handle)}&key=${this.apiKey}`;
    const j2 = await this.getJson<{ items?: YtChannel[] }>(url2);
    if (j2.items && j2.items.length > 0 && j2.items[0]) return j2.items[0];
    // Same honest 404 pattern as IG/TikTok — never fall to mock on a bad handle.
    throw new HandleNotFoundError(handle, "youtube");
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
      following: 0, // YouTube doesn't expose subscription count publicly
      verified: ch.status?.isLinked ?? false,
      avatarUrl: ch.snippet?.thumbnails?.high?.url ?? ch.snippet?.thumbnails?.medium?.url ?? ch.snippet?.thumbnails?.default?.url,
      bio: ch.snippet?.description,
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
      `${YT}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(",")}` +
      `&key=${this.apiKey}`;
    const vj = await this.getJson<{ items?: YtVideo[] }>(videosUrl);
    return (vj.items ?? []).map<Post>((v) => {
      const thumb =
        v.snippet?.thumbnails?.maxres?.url ??
        v.snippet?.thumbnails?.standard?.url ??
        v.snippet?.thumbnails?.high?.url ??
        v.snippet?.thumbnails?.medium?.url ??
        v.snippet?.thumbnails?.default?.url;
      const thumbHd =
        v.snippet?.thumbnails?.maxres?.url ??
        v.snippet?.thumbnails?.standard?.url ??
        thumb;
      return {
        id: v.id,
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
        views: Number(v.statistics?.viewCount ?? 0),
        postedAt: v.snippet?.publishedAt ?? new Date(0).toISOString(),
        title: v.snippet?.title?.slice(0, 80),
        caption: v.snippet?.title,
        thumbnailUrl: thumb,
        thumbnailUrlHd: thumbHd,
        durationSec: parseIsoDuration(v.contentDetails?.duration),
        // NOTE: no videoUrl. YouTube Data API doesn't provide download URLs,
        // and scraping them via yt-dlp violates YouTube TOS + creates a real
        // risk of Razorpay/LemonSqueezy account termination. The view layer
        // handles the missing videoUrl by hiding the download button and
        // linking to the permalink instead.
        permalink: `https://www.youtube.com/watch?v=${v.id}`,
      };
    });
  }

  override async getRecentComments(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<{ post: Post; comments: CommentItem[] }> {
    if (platform !== "youtube") {
      throw new DataSourceError(`YouTubeOfficialAdapter received platform=${platform}`);
    }
    const posts = await this.getRecentPosts(platform, handle, 1);
    const post = posts[0];
    if (!post) throw new DataSourceError("no recent video to pull comments from");
    const max = Math.min(Math.max(n, 1), 100);
    const url =
      `${YT}/commentThreads?part=snippet&videoId=${post.id}` +
      `&maxResults=${max}&order=relevance&key=${this.apiKey}`;
    const j = await this.getJson<{ items?: YtCommentThread[] }>(url);
    const items = j.items ?? [];
    const comments: CommentItem[] = items.slice(0, n).map((t) => {
      const s = t.snippet?.topLevelComment?.snippet;
      return {
        id: t.snippet?.topLevelComment?.id ?? Math.random().toString(36).slice(2),
        username: s?.authorDisplayName ?? "unknown",
        text: s?.textOriginal ?? s?.textDisplay ?? "",
        postedAt: s?.publishedAt ?? new Date().toISOString(),
        // On YT, authorDisplayName IS the human name (channel name), so
        // treat it as both username and full name for the name-dictionary
        // classifier. authorProfileImageUrl is public.
        fullName: s?.authorDisplayName,
        avatarUrl: s?.authorProfileImageUrl,
      };
    });
    return { post, comments };
  }

  override async getThumbnail(
    platform: Platform,
    handle: string,
  ): Promise<{ post: Post; resolutions: { label: string; url: string; locked: boolean }[] }> {
    if (platform !== "youtube") {
      throw new DataSourceError(`YouTubeOfficialAdapter received platform=${platform}`);
    }
    const posts = await this.getRecentPosts(platform, handle, 1);
    const post = posts[0];
    if (!post?.thumbnailUrl) throw new DataSourceError("no thumbnail for latest video");
    // YouTube exposes 5 canonical thumbnail sizes; we can build the URLs
    // directly from the video id even if the API returned a subset.
    const vid = post.id;
    const resolutions: { label: string; url: string; locked: boolean }[] = [
      { label: "Default (120×90)", url: `https://i.ytimg.com/vi/${vid}/default.jpg`, locked: false },
      { label: "Medium (320×180)", url: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`, locked: false },
      { label: "High (480×360)", url: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, locked: false },
      { label: "Standard (640×480)", url: `https://i.ytimg.com/vi/${vid}/sddefault.jpg`, locked: false },
      { label: "Max-res (1280×720)", url: `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`, locked: false },
    ];
    return { post, resolutions };
  }

  override async getFollowerSample(
    _platform: Platform,
    _handle: string,
    _n: number,
  ): Promise<FollowerLite[]> {
    // YouTube deliberately does NOT expose subscriber lists via any public API.
    // Return empty so the gender-split tool falls back cleanly to commenter
    // analysis (which YT does expose).
    return [];
  }
}
