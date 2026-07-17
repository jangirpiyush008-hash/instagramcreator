// Real Instagram data via the RockSolid `instagram-scraper-stable-api` on
// RapidAPI. Uses POST + application/x-www-form-urlencoded against .php
// endpoints (the API's native shape).
//
// Inherits from MockProvider so unimplemented methods fall back to mock data
// — and every implemented method individually falls back to mock on any
// provider error (transient retry messages, scraper blocked upstream, etc).
//
// Activated only when RAPIDAPI_KEY is set; otherwise adapterFor("instagram")
// returns the plain MockProvider.

import type { Platform } from "../types";
import type { Profile, Post, UsernameAvailability, CommentItem, FollowerLite } from "./adapter";
import { MockProvider } from "./mock-provider";
import { DataSourceError, DataUnavailableError, HandleNotFoundError, PrivateAccountError, ProviderRateLimitError } from "../utils/errors";

interface ProviderEnvelope {
  // RockSolid endpoints wrap payloads inconsistently:
  //   /ig_get_fb_profile_v3.php  → { user: {...} } or the user fields at root
  //   /get_ig_user_posts.php     → { posts: [{ node: {...} }], pagination_token }
  //   /get_post_comments.php     → { comments: [...] } or { items: [...] }
  //   /get_ig_user_followers.php → { users: [{...}] } or { followers: [...] }
  error?: string;
  user?: unknown;
  data?: unknown;
  items?: unknown;
  posts?: { node?: unknown }[];
  comments?: unknown;
  comment_count?: number;
  users?: unknown;
  followers?: unknown;
}

interface IgFollowerRaw {
  username?: string;
  full_name?: string;
  pk?: string;
  id?: string;
}

interface IgUserRaw {
  username?: string;
  full_name?: string;
  biography?: string;
  is_verified?: boolean;
  is_private?: boolean;
  follower_count?: number;
  following_count?: number;
  edge_followed_by?: { count?: number };
  edge_follow?: { count?: number };
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
}

interface IgPostRaw {
  id?: string;
  pk?: string;
  code?: string;                // RockSolid uses `code` for the shortcode
  shortcode?: string;
  like_count?: number;
  comment_count?: number;
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  edge_media_to_comment?: { count?: number };
  play_count?: number;
  video_view_count?: number;
  taken_at?: number;            // unix seconds
  taken_at_timestamp?: number;
  thumbnail_src?: string;
  display_url?: string;
  image_versions2?: { candidates?: { url?: string; width?: number; height?: number }[] };
  caption?: { text?: string } | null;
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  video_duration?: number;
  // Media type flags: is_video (older shape) or media_type === 2 for reels/videos.
  is_video?: boolean;
  media_type?: number;
  // Video URL fields — RockSolid can return any of these depending on post type.
  video_url?: string;
  video_versions?: { url?: string; type?: number; width?: number; height?: number }[];
  // RockSolid nests the author under user with is_private / is_verified
  user?: { username?: string; is_private?: boolean; is_verified?: boolean };
}

interface IgCommentRaw {
  id?: string;
  pk?: string;
  username?: string;
  user?: { username?: string };
  text?: string;
  comment_text?: string;
  created_at?: number;
}

export class RapidAPIInstagramAdapter extends MockProvider {
  private readonly apiKey: string;
  private readonly host: string;

  constructor(apiKey?: string, host?: string) {
    super("instagram");
    this.apiKey = apiKey ?? process.env.RAPIDAPI_KEY ?? "";
    this.host =
      host ??
      process.env.IG_RAPIDAPI_HOST ??
      "instagram-scraper-stable-api.p.rapidapi.com";
  }

  private async post<T>(path: string, body: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, query);
  }

  private async request<T>(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey || !this.host) {
      throw new DataSourceError("RapidAPI not configured (missing key or host)");
    }
    const isGet = method === "GET";
    const qs = new URLSearchParams(params).toString();
    const url = `https://${this.host}${path}${isGet && qs ? `?${qs}` : ""}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "x-rapidapi-key": this.apiKey,
          "x-rapidapi-host": this.host,
          ...(isGet ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
          accept: "application/json",
        },
        body: isGet ? undefined : qs,
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 429) {
        throw new ProviderRateLimitError(this.host, path);
      }
      if (!res.ok) {
        throw new DataSourceError(`${this.host} ${method} ${path} returned ${res.status}`);
      }
      const json = (await res.json()) as ProviderEnvelope & Record<string, unknown>;
      // Many scrapers return 200 with {"error": "..."} on transient upstream
      // failures ("Please try again later"). Treat as a fail.
      if (json && typeof json === "object" && "error" in json && json.error) {
        throw new DataSourceError(`${this.host} provider message: ${String(json.error).slice(0, 80)}`);
      }
      return json as T;
    } catch (e) {
      if (e instanceof DataSourceError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new DataSourceError(`${this.host} timeout after 12s`);
      }
      throw new DataSourceError(`${this.host} fetch error`, e);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safe<T>(label: string, fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      // PrivateAccountError, HandleNotFoundError, and ProviderRateLimitError
      // are intentional — never mask them with mock data. Silently falling
      // back to seeded mock on a 429 was the root cause of the whole
      // "wrong follower count" bug (mock data got returned as if it were
      // real). The API route catches these and shows the correct UI.
      if (e instanceof PrivateAccountError) throw e;
      if (e instanceof HandleNotFoundError) throw e;
      if (e instanceof ProviderRateLimitError) throw e;
      // DataUnavailableError means no real signal exists — do not paper
      // over with mock. Let ChainAdapter move on to the next provider.
      if (e instanceof DataUnavailableError) throw e;
      console.warn(
        `[rapidapi-ig-stable] ${label} failed, falling back to mock:`,
        e instanceof Error ? e.message : e,
      );
      return fallback();
    }
  }

  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    return this.safe<Profile>(
      "getProfile",
      async () => {
        // "Account Data V2" endpoint on RockSolid — real endpoint path per
        // their sidebar tooltip. Uses FB Graph internally so needs a public
        // username; the API resolves it to an internal id itself.
        const r = await this.post<ProviderEnvelope>(
          "/ig_get_fb_profile_v3.php",
          { username_or_url: handle },
        );
        const u = (r.user ?? (r.data as { user?: IgUserRaw })?.user ?? r) as IgUserRaw;
        const followers =
          u.follower_count ?? u.edge_followed_by?.count ?? null;
        if (followers === null) {
          throw new DataSourceError("response missing follower count");
        }
        // Guard against wrong-account matches. RockSolid has been observed
        // returning a completely different profile when the requested handle
        // is a small / new account it can't resolve (e.g. `ashwarya_gg` →
        // some 458k-follower unrelated account). STRICT MODE — refuse
        // whenever the response either omits the username OR returns one
        // that doesn't match what we asked for. Without a positive-match
        // confirmation we can't be sure it's the right account, so we
        // treat it as not-found rather than risk showing wrong data.
        const returnedUsername = (u.username ?? "").toLowerCase();
        const requested = handle.toLowerCase();
        console.log(
          `[rapidapi-ig-stable] getProfile requested="${requested}" returned_username="${returnedUsername || "<empty>"}" followers=${followers}`,
        );
        if (returnedUsername !== requested) {
          console.warn(
            `[rapidapi-ig-stable] getProfile handle mismatch — requested "${requested}", got "${returnedUsername || "<empty>"}". Refusing to avoid wrong-account data.`,
          );
          throw new HandleNotFoundError(handle, "instagram");
        }
        // Refuse private accounts immediately — bubble a PrivateAccountError
        // that the safe() wrapper deliberately re-throws (see below) so the
        // scan API can return a clean 422 instead of falling back to mock.
        if (u.is_private === true) {
          throw new PrivateAccountError(handle, "instagram");
        }
        return {
          handle,
          displayName: u.full_name ?? handle,
          followers,
          following: u.following_count ?? u.edge_follow?.count ?? 0,
          verified: u.is_verified ?? false,
          isPrivate: false,
          avatarUrl: u.profile_pic_url_hd ?? u.profile_pic_url,
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
        // "User Posts" endpoint — no v2 suffix per the RockSolid docs.
        const r = await this.post<ProviderEnvelope>(
          "/get_ig_user_posts.php",
          { username_or_url: handle },
        );
        // RockSolid /get_ig_user_posts.php returns:
        //   { posts: [{ node: {...} }, ...], pagination_token }
        // Some other providers use {items: [...]} — handle both.
        const raw: IgPostRaw[] =
          (r.posts?.map((p) => p.node).filter(Boolean) as IgPostRaw[]) ??
          (r.items as IgPostRaw[] | undefined) ??
          ((r.data as { items?: IgPostRaw[] } | undefined)?.items) ??
          [];
        if (raw.length === 0) {
          throw new DataSourceError("no posts in response");
        }
        // If any post shows the author account as private, refuse the scan —
        // don't leak metrics from a private profile.
        const firstAuthor = raw[0]?.user;
        if (firstAuthor?.is_private === true) {
          throw new PrivateAccountError(handle, "instagram");
        }
        return raw.slice(0, n).map<Post>((p) => {
          // RockSolid: pk = numeric id, code = shortcode (for building /p/{code}/ urls)
          const shortcode = String(p.code ?? p.shortcode ?? p.pk ?? p.id ?? Math.random().toString(36).slice(2));
          // Pick highest-resolution thumbnail from image_versions2 candidates
          // (candidates are typically sorted largest→smallest, but sort defensively).
          const candidates = p.image_versions2?.candidates ?? [];
          const largestThumb = candidates
            .slice()
            .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
          // Highest-bandwidth video variant from video_versions.
          const bestVideo = (p.video_versions ?? [])
            .slice()
            .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
          return {
            id: shortcode,
            likes: p.like_count ?? p.edge_liked_by?.count ?? p.edge_media_preview_like?.count ?? 0,
            comments: p.comment_count ?? p.edge_media_to_comment?.count ?? 0,
            views: p.play_count ?? p.video_view_count,
            postedAt: p.taken_at
              ? new Date(p.taken_at * 1000).toISOString()
              : p.taken_at_timestamp
              ? new Date(p.taken_at_timestamp * 1000).toISOString()
              : new Date().toISOString(),
            thumbnailUrl:
              p.thumbnail_src ??
              p.display_url ??
              candidates[0]?.url,
            thumbnailUrlHd: largestThumb ?? p.display_url ?? p.thumbnail_src,
            title:
              p.caption?.text?.slice(0, 80) ??
              p.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 80),
            caption:
              p.caption?.text ?? p.edge_media_to_caption?.edges?.[0]?.node?.text,
            durationSec: p.video_duration,
            videoUrl: p.video_url ?? bestVideo,
            videoUrlHd: bestVideo ?? p.video_url,
            permalink: `https://www.instagram.com/p/${shortcode}/`,
          };
        });
      },
      () => super.getRecentPosts(platform, handle, n),
    );
  }

  override async isHandleAvailable(platform: Platform, handle: string): Promise<UsernameAvailability> {
    // If getProfile succeeds, the handle is taken — surface the real
    // follower count. If it explicitly 404s (HandleNotFoundError), the
    // handle is free. Every other error (rate-limit, private, network,
    // parse) must bubble so ChainAdapter tries the next provider.
    // Previous "catch { return available: true }" caused rate-limits to
    // be misreported as "handle available", and the mock fallback
    // fabricated a fake 458k follower count for taken accounts.
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
  }

  override async getThumbnail(platform: Platform, handle: string) {
    return this.safe(
      "getThumbnail",
      async () => {
        const posts = await this.getRecentPosts(platform, handle, 1);
        const post = posts[0];
        if (!post?.thumbnailUrl) {
          throw new DataSourceError("no thumbnail url on first post");
        }
        const sd = post.thumbnailUrl;
        const hd = post.thumbnailUrlHd ?? post.thumbnailUrl;
        const resolutions: { label: string; url: string; locked: boolean }[] = [
          { label: "Cover (SD)", url: sd, locked: false },
          { label: "Cover (HD)", url: hd, locked: false },
        ];
        if (post.videoUrl) {
          resolutions.push({ label: "Video (MP4)", url: post.videoUrl, locked: false });
        }
        if (post.videoUrlHd && post.videoUrlHd !== post.videoUrl) {
          resolutions.push({ label: "Video (HD MP4)", url: post.videoUrlHd, locked: false });
        }
        return { post, resolutions };
      },
      () => super.getThumbnail(platform, handle),
    );
  }

  override async getFollowerSample(platform: Platform, handle: string, n: number): Promise<FollowerLite[]> {
    return this.safe<FollowerLite[]>(
      "getFollowerSample",
      async () => {
        // RockSolid exposes `/get_ig_user_followers.php` — same POST +
        // form-urlencoded convention as the other endpoints. If the exact
        // path is different on their end, the log at request-time will show
        // the 404 and we can patch in one line.
        const r = await this.post<ProviderEnvelope>(
          "/get_ig_user_followers.php",
          { username_or_url: handle },
        );
        const raw: IgFollowerRaw[] =
          (r.users as IgFollowerRaw[] | undefined) ??
          (r.followers as IgFollowerRaw[] | undefined) ??
          (r.items as IgFollowerRaw[] | undefined) ??
          ((r.data as { users?: IgFollowerRaw[]; followers?: IgFollowerRaw[] } | undefined)?.users) ??
          ((r.data as { users?: IgFollowerRaw[]; followers?: IgFollowerRaw[] } | undefined)?.followers) ??
          [];
        if (raw.length === 0) {
          const dataKeys = r.data ? Object.keys(r.data as object).join(",") : "<no data>";
          const rootKeys = Object.keys(r).join(",");
          console.warn(
            `[rapidapi-ig-stable] /get_ig_user_followers.php returned empty. root keys=[${rootKeys}] data keys=[${dataKeys}]`,
          );
          throw new DataSourceError("no followers in response");
        }
        return raw.slice(0, n).map<FollowerLite>((u) => ({
          username: u.username ?? "",
          fullName: u.full_name,
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
        if (!post) throw new DataSourceError("no recent post");
        // "Get Post Comments" is a GET endpoint per the RockSolid sidebar.
        const postUrl = `https://www.instagram.com/p/${post.id}/`;
        const r = await this.get<ProviderEnvelope>(
          "/get_post_comments.php",
          { post_url: postUrl },
        );
        const raw =
          (r.comments as IgCommentRaw[] | undefined) ??
          (r.items as IgCommentRaw[] | undefined) ??
          ((r.data as { comments?: IgCommentRaw[] } | undefined)?.comments) ??
          [];
        const totalComments = r.comment_count ?? post.comments;
        const comments: CommentItem[] = raw.slice(0, n).map((c) => ({
          id: String(c.id ?? c.pk ?? Math.random().toString(36).slice(2)),
          username: c.username ?? c.user?.username ?? "unknown",
          text: c.text ?? c.comment_text ?? "",
          postedAt: c.created_at
            ? new Date(c.created_at * 1000).toISOString()
            : new Date().toISOString(),
        }));
        return {
          post: { ...post, comments: totalComments },
          comments,
        };
      },
      () => super.getRecentComments(platform, handle, n),
    );
  }
}
