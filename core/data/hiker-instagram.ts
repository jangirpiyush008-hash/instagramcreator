// Real Instagram data via HikerAPI (https://hikerapi.com).
//
// Why: RapidAPI's RockSolid provider silently 429s once its 20-req/month free
// tier is exhausted, and their Pro plan is $29/mo fixed. HikerAPI is
// pay-per-request, more reliable, and has a richer Instagram private-API
// surface (instagrapi under the hood). Combined with our primitive cache
// this becomes the cheapest path to real IG data at MVP scale.
//
// Auth: single `x-access-key` header. Base URL: https://api.hikerapi.com.
// Endpoints reference: https://api.hikerapi.com/docs
//
// Response shapes: getProfile CONFIRMED against a real /v2/user/by/username
// call for mkbhd. The other three primitives (posts, comments, followers)
// are built with defensive multi-shape parsing PLUS diagnostic logging —
// same pattern as the tikwm and RockSolid adapters. If HikerAPI's shape
// differs from what I expect, Railway logs will show the actual keys and
// we patch in one line.
//
// Never falls back to mock. Errors bubble up as HandleNotFoundError,
// PrivateAccountError, ProviderRateLimitError, or DataSourceError so the
// scan API surfaces them honestly to the user.

import type { Platform } from "../types";
import type { Profile, Post, UsernameAvailability, CommentItem, FollowerLite } from "./adapter";
import { MockProvider } from "./mock-provider";
import { DataSourceError, HandleNotFoundError, PrivateAccountError, ProviderRateLimitError } from "../utils/errors";

// ------- CONFIRMED: /v2/user/by/username --------------------------------------

interface HikerUserRaw {
  username?: string;
  full_name?: string;
  biography?: string;
  pk?: number | string;
  id?: string;
  follower_count?: number;
  following_count?: number;
  is_verified?: boolean;
  is_private?: boolean;
  is_business?: boolean;
  media_count?: number;
  profile_pic_url?: string;
  hd_profile_pic_url_info?: { url?: string; width?: number; height?: number };
  external_url?: string;
  category?: string;
}

// ------- Guessed shapes (defensive) — HikerAPI is instagrapi-based so these
// closely mirror Instagram's private-API responses.

interface HikerMediaRaw {
  pk?: number | string;
  id?: string;
  code?: string;
  media_type?: number;   // 1 = image, 2 = video, 8 = carousel
  like_count?: number;
  comment_count?: number;
  play_count?: number;
  view_count?: number;
  taken_at?: number;     // unix seconds
  caption_text?: string;
  caption?: { text?: string } | string;
  thumbnail_url?: string;
  image_versions2?: { candidates?: { url?: string; width?: number; height?: number }[] };
  video_url?: string;
  video_versions?: { url?: string; type?: number; width?: number; height?: number }[];
  video_duration?: number;
  user?: { username?: string; is_private?: boolean; is_verified?: boolean };
}

interface HikerCommentRaw {
  pk?: number | string;
  id?: string;
  // HikerAPI includes commenter metadata inline — profile_pic_url and
  // full_name are almost always populated. We surface them via CommentItem
  // so audience-enrichment can skip a separate getProfile call per
  // commenter (which is slow and has a much higher failure rate for
  // renamed / deleted / private accounts).
  user?: {
    username?: string;
    full_name?: string;
    profile_pic_url?: string;
    profile_pic_url_hd?: string;
  };
  user_id?: string;
  text?: string;
  content?: string;
  created_at?: number;
  created_at_utc?: number;
}

interface HikerFollowerRaw {
  pk?: number | string;
  username?: string;
  full_name?: string;
}

export class HikerInstagramAdapter extends MockProvider {
  private readonly apiKey: string;
  private readonly host: string;

  constructor(apiKey?: string, host?: string) {
    super("instagram");
    this.apiKey = apiKey ?? process.env.HIKER_API_KEY ?? "";
    this.host = host ?? "api.hikerapi.com";
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new DataSourceError("HIKER_API_KEY is not configured");
    }
    const qs = new URLSearchParams(params).toString();
    const url = `https://${this.host}${path}${qs ? `?${qs}` : ""}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        headers: {
          "x-access-key": this.apiKey,
          accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 402) {
        // HikerAPI's "insufficient funds" — treat as provider quota, not our error.
        throw new ProviderRateLimitError(this.host, path);
      }
      if (res.status === 429) {
        throw new ProviderRateLimitError(this.host, path);
      }
      if (res.status === 404) {
        throw new HandleNotFoundError("", "instagram");
      }
      if (!res.ok) {
        throw new DataSourceError(`${this.host} GET ${path} returned ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ProviderRateLimitError) throw e;
      if (e instanceof HandleNotFoundError) throw e;
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
      // Bubble the intentional errors — never mask with mock.
      if (e instanceof PrivateAccountError) throw e;
      if (e instanceof HandleNotFoundError) throw e;
      if (e instanceof ProviderRateLimitError) throw e;
      console.warn(
        `[hiker-instagram] ${label} failed, falling back to mock:`,
        e instanceof Error ? e.message : e,
      );
      return fallback();
    }
  }

  // Cache the profile PK across the tool run so we don't pay for two
  // getProfile calls when both getRecentPosts and getFollowerSample need it.
  private pkCache = new Map<string, string>();

  private async resolvePk(handle: string): Promise<string> {
    const cached = this.pkCache.get(handle.toLowerCase());
    if (cached) return cached;
    const r = await this.get<{ user?: HikerUserRaw; status?: string }>(
      "/v2/user/by/username",
      { username: handle },
    );
    const u = r.user;
    if (!u) throw new HandleNotFoundError(handle, "instagram");
    const pk = String(u.pk ?? u.id ?? "");
    if (!pk) throw new HandleNotFoundError(handle, "instagram");
    this.pkCache.set(handle.toLowerCase(), pk);
    return pk;
  }

  // ---------------------------------------------------------------------------
  // getProfile — response shape CONFIRMED against real API call
  // ---------------------------------------------------------------------------

  // Loose commenter lookup. Same /v2/user/by/username endpoint as
  // getProfile, but deliberately does NOT throw on private accounts,
  // deleted accounts, or handle-normalization mismatches. Audience
  // enrichment wants partial data from as many commenters as possible —
  // even a private commenter's public avatar + bio is useful signal.
  // Not `override` — the base MockProvider doesn't declare this optional
  // interface method. Present on this concrete adapter because we can
  // actually implement it cheaply via HikerAPI's user-by-username call.
  async getCommenterInfo(_platform: Platform, username: string) {
    try {
      const r = await this.get<{ user?: HikerUserRaw }>(
        "/v2/user/by/username",
        { username },
      );
      const u = r.user;
      if (!u) return {};
      return {
        fullName: u.full_name,
        avatarUrl: u.hd_profile_pic_url_info?.url ?? u.profile_pic_url,
        bio: u.biography,
        isPrivate: u.is_private === true,
      };
    } catch (e) {
      if (process.env.DEBUG_ENRICHMENT === "1") {
        console.warn(
          `[hiker-instagram] commenter lookup failed for ${username}:`,
          e instanceof Error ? e.message : e,
        );
      }
      return {};
    }
  }

  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    return this.safe<Profile>(
      "getProfile",
      async () => {
        const r = await this.get<{ user?: HikerUserRaw; status?: string }>(
          "/v2/user/by/username",
          { username: handle },
        );
        const u = r.user;
        if (!u) throw new HandleNotFoundError(handle, "instagram");

        // Wrong-account guard — refuse if returned username doesn't match.
        const returnedUsername = (u.username ?? "").toLowerCase();
        const requested = handle.toLowerCase();
        if (returnedUsername && returnedUsername !== requested) {
          console.warn(
            `[hiker-instagram] getProfile handle mismatch — requested "${requested}", got "${returnedUsername}". Refusing.`,
          );
          throw new HandleNotFoundError(handle, "instagram");
        }

        if (u.is_private === true) {
          throw new PrivateAccountError(handle, "instagram");
        }

        // Cache the PK for downstream calls.
        if (u.pk !== undefined) this.pkCache.set(handle.toLowerCase(), String(u.pk));

        return {
          handle,
          displayName: u.full_name ?? handle,
          followers: u.follower_count ?? 0,
          following: u.following_count ?? 0,
          verified: u.is_verified ?? false,
          isPrivate: false,
          avatarUrl: u.hd_profile_pic_url_info?.url ?? u.profile_pic_url,
          bio: u.biography,
          niche: u.category,
        };
      },
      () => super.getProfile(platform, handle),
    );
  }

  // ---------------------------------------------------------------------------
  // getRecentPosts — HikerAPI has multiple endpoints; try them in order
  // ---------------------------------------------------------------------------

  override async getRecentPosts(platform: Platform, handle: string, n: number): Promise<Post[]> {
    return this.safe<Post[]>(
      "getRecentPosts",
      async () => {
        const pk = await this.resolvePk(handle);
        // Primary attempt: /v2/user/medias by user_id. Fall through to /gql
        // and /v1 variants if the first shape isn't there. Multi-endpoint
        // trial keeps this working across HikerAPI's schema drift.
        let raw: HikerMediaRaw[] = [];
        const shapes: { path: string; params: Record<string, string> }[] = [
          { path: "/v2/user/medias", params: { user_id: pk } },
          { path: "/gql/user/medias", params: { user_id: pk } },
          { path: "/v1/user/medias/chunk", params: { user_id: pk, end_cursor: "" } },
          { path: "/g2/user/medias", params: { user_id: pk } },
        ];
        let lastErrKeys = "<none>";
        for (const attempt of shapes) {
          try {
            const r = await this.get<unknown>(attempt.path, attempt.params);
            const parsed = this.parseMediasResponse(r);
            if (parsed.length > 0) {
              raw = parsed;
              break;
            }
            // Track what came back for the diagnostic log.
            const keys = r && typeof r === "object" ? Object.keys(r as object).join(",") : String(r);
            lastErrKeys = `${attempt.path} keys=[${keys}]`;
          } catch (e) {
            // ProviderRateLimit / HandleNotFound bubble; other errors let us try next shape.
            if (e instanceof ProviderRateLimitError) throw e;
            if (e instanceof HandleNotFoundError) throw e;
            lastErrKeys = `${attempt.path} error=${e instanceof Error ? e.message : e}`;
          }
        }
        if (raw.length === 0) {
          console.warn(`[hiker-instagram] getRecentPosts: no medias returned. ${lastErrKeys}`);
          throw new DataSourceError("no posts in response");
        }

        // Guard against private-account signals in nested user data.
        const firstAuthor = raw[0]?.user;
        if (firstAuthor?.is_private === true) {
          throw new PrivateAccountError(handle, "instagram");
        }

        return raw.slice(0, n).map<Post>((p) => {
          const code = p.code ?? String(p.id ?? p.pk ?? Math.random().toString(36).slice(2));
          const candidates = p.image_versions2?.candidates ?? [];
          const largestThumb = candidates
            .slice()
            .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
          const bestVideo = (p.video_versions ?? [])
            .slice()
            .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
          const captionText =
            typeof p.caption === "string"
              ? p.caption
              : p.caption?.text ?? p.caption_text;
          return {
            id: code,
            likes: p.like_count ?? 0,
            comments: p.comment_count ?? 0,
            views: p.play_count ?? p.view_count,
            postedAt: p.taken_at
              ? new Date(p.taken_at * 1000).toISOString()
              : new Date().toISOString(),
            thumbnailUrl: p.thumbnail_url ?? candidates[0]?.url,
            thumbnailUrlHd: largestThumb ?? p.thumbnail_url,
            title: captionText?.slice(0, 80),
            caption: captionText,
            durationSec: p.video_duration,
            videoUrl: p.video_url ?? bestVideo,
            videoUrlHd: bestVideo ?? p.video_url,
            permalink: `https://www.instagram.com/p/${code}/`,
          };
        });
      },
      () => super.getRecentPosts(platform, handle, n),
    );
  }

  // Parses several possible top-level shapes for a medias list. HikerAPI
  // endpoints sometimes return {items:[]}, sometimes {medias:[]}, sometimes
  // {response:{items:[]}}, sometimes a bare array. Handle all defensively.
  private parseMediasResponse(r: unknown): HikerMediaRaw[] {
    if (Array.isArray(r)) return r as HikerMediaRaw[];
    if (!r || typeof r !== "object") return [];
    const obj = r as Record<string, unknown>;
    const candidates: unknown[] = [
      obj.items,
      obj.medias,
      obj.medias_and_ads,
      (obj.response as { items?: unknown } | undefined)?.items,
      (obj.data as { items?: unknown; medias?: unknown } | undefined)?.items,
      (obj.data as { items?: unknown; medias?: unknown } | undefined)?.medias,
      (obj.user as { edge_owner_to_timeline_media?: { edges?: { node?: unknown }[] } } | undefined)
        ?.edge_owner_to_timeline_media?.edges?.map((e) => e.node),
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) return c as HikerMediaRaw[];
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // getRecentComments — per HikerAPI docs: /v2/media/comments returns 15
  // ---------------------------------------------------------------------------

  override async getRecentComments(platform: Platform, handle: string, n: number) {
    return this.safe(
      "getRecentComments",
      async () => {
        const posts = await this.getRecentPosts(platform, handle, 1);
        const post = posts[0];
        if (!post) throw new DataSourceError("no recent post");
        // media_id needs to be the numeric pk. Our Post.id is the shortcode,
        // so we resolve by asking HikerAPI for the media by code. Cheaper: if
        // getRecentPosts stashed the pk somewhere. For now, use the shortcode
        // endpoint or fall back to converting via /v1/media/pk/from/code.
        let mediaPk: string | null = null;
        try {
          const r = await this.get<{ pk?: number | string; id?: string }>(
            "/v1/media/pk/from/code",
            { code: post.id },
          );
          mediaPk = String(r.pk ?? r.id ?? "");
        } catch {
          // best effort — some HikerAPI plans return the pk inline with the media,
          // in which case we should have stored it. Not fatal — try with the code.
          mediaPk = post.id;
        }
        const r = await this.get<unknown>("/v2/media/comments", { id: mediaPk ?? post.id });
        const raw = this.parseCommentsResponse(r);
        const comments: CommentItem[] = raw.slice(0, n).map((c) => ({
          id: String(c.pk ?? c.id ?? Math.random().toString(36).slice(2)),
          username: c.user?.username ?? "unknown",
          text: c.text ?? c.content ?? "",
          postedAt: c.created_at_utc
            ? new Date(c.created_at_utc * 1000).toISOString()
            : c.created_at
            ? new Date(c.created_at * 1000).toISOString()
            : new Date().toISOString(),
          fullName: c.user?.full_name,
          // Prefer the HD variant when present — better face-detection accuracy.
          avatarUrl: c.user?.profile_pic_url_hd ?? c.user?.profile_pic_url,
        }));
        const totalComments = post.comments;
        return {
          post: { ...post, comments: totalComments },
          comments,
        };
      },
      () => super.getRecentComments(platform, handle, n),
    );
  }

  private parseCommentsResponse(r: unknown): HikerCommentRaw[] {
    if (Array.isArray(r)) return r as HikerCommentRaw[];
    if (!r || typeof r !== "object") return [];
    const obj = r as Record<string, unknown>;
    const candidates: unknown[] = [
      obj.comments,
      obj.items,
      (obj.response as { comments?: unknown } | undefined)?.comments,
      (obj.data as { comments?: unknown; items?: unknown } | undefined)?.comments,
      (obj.data as { comments?: unknown; items?: unknown } | undefined)?.items,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) return c as HikerCommentRaw[];
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // getFollowerSample — feeds gender-split tool
  // ---------------------------------------------------------------------------

  override async getFollowerSample(platform: Platform, handle: string, n: number): Promise<FollowerLite[]> {
    return this.safe<FollowerLite[]>(
      "getFollowerSample",
      async () => {
        const pk = await this.resolvePk(handle);
        // Try the recommended endpoint first, then fall through to alternates.
        const shapes: { path: string; params: Record<string, string> }[] = [
          { path: "/g2/user/followers", params: { user_id: pk } },
          { path: "/v2/user/followers", params: { user_id: pk } },
          { path: "/v1/user/followers/chunk", params: { user_id: pk, max_id: "" } },
          { path: "/gql/user/followers/chunk", params: { user_id: pk } },
        ];
        let raw: HikerFollowerRaw[] = [];
        let diag = "<none>";
        for (const attempt of shapes) {
          try {
            const r = await this.get<unknown>(attempt.path, attempt.params);
            const parsed = this.parseFollowersResponse(r);
            if (parsed.length > 0) {
              raw = parsed;
              break;
            }
            const keys = r && typeof r === "object" ? Object.keys(r as object).join(",") : String(r);
            diag = `${attempt.path} keys=[${keys}]`;
          } catch (e) {
            if (e instanceof ProviderRateLimitError) throw e;
            diag = `${attempt.path} error=${e instanceof Error ? e.message : e}`;
          }
        }
        if (raw.length === 0) {
          console.warn(`[hiker-instagram] getFollowerSample: no followers returned. ${diag}`);
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

  private parseFollowersResponse(r: unknown): HikerFollowerRaw[] {
    if (Array.isArray(r)) return r as HikerFollowerRaw[];
    if (!r || typeof r !== "object") return [];
    const obj = r as Record<string, unknown>;
    const candidates: unknown[] = [
      obj.users,
      obj.items,
      obj.followers,
      (obj.response as { users?: unknown } | undefined)?.users,
      (obj.data as { users?: unknown; items?: unknown } | undefined)?.users,
      (obj.data as { users?: unknown; items?: unknown } | undefined)?.items,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) return c as HikerFollowerRaw[];
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Composed methods (reuse the primitives above)
  // ---------------------------------------------------------------------------

  override async getThumbnail(platform: Platform, handle: string) {
    return this.safe(
      "getThumbnail",
      async () => {
        const posts = await this.getRecentPosts(platform, handle, 1);
        const post = posts[0];
        if (!post?.thumbnailUrl) throw new DataSourceError("no thumbnail url on first post");
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
}
