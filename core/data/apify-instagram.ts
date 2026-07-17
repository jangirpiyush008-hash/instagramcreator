// Instagram data via Apify actor runs (https://apify.com).
//
// Fundamentally slower than the other providers — Apify's model is
// job-based (submit a run, poll for completion). We use their
// `run-sync-get-dataset-items` endpoint which BLOCKS until the actor
// finishes and returns the scraped dataset in the same response,
// typically 10-60s per profile scrape.
//
// Because of the latency, Apify sits at the BOTTOM of the chain —
// only reached when Ensembledata + HikerAPI + RapidAPI have all
// failed. In steady state you'll rarely see requests flow here.
// Think of it as insurance, not a workhorse.
//
// Auth: token query param.
// Default actor: apify/instagram-scraper (most popular, best-maintained).
// Override with APIFY_IG_ACTOR_ID env var if you want a faster or
// specialized one (e.g. dtrungtin/instagram-profile-scraper).
//
// Docs: https://docs.apify.com/api/v2#/reference/actor-runs/run-synchronously-and-get-dataset-items

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

const BASE = "https://api.apify.com/v2";
const DEFAULT_ACTOR_ID = "apify/instagram-scraper";
// 45s timeout — Apify runs are slow; a tighter timeout would trip the
// circuit breaker after 3 legitimate requests, taking Apify out of
// service permanently in the current process.
const TIMEOUT_MS = 45_000;

// Response shape from apify/instagram-scraper "details" mode. Actor
// schemas vary; we parse defensively so a minor actor update doesn't
// break us silently.
interface ApifyIgItem {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  verified?: boolean;
  private?: boolean;
  profilePicUrl?: string;
  profilePicUrlHd?: string;
  externalUrl?: string;
  businessCategoryName?: string;
  latestPosts?: ApifyIgPost[];
}

interface ApifyIgPost {
  id?: string;
  shortCode?: string;
  type?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  timestamp?: string;
  caption?: string;
  displayUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
}

export class ApifyInstagramAdapter extends MockProvider implements DataAdapter {
  private readonly token: string;
  private readonly actorId: string;

  constructor(token?: string, actorId?: string) {
    super("instagram");
    this.token = token ?? process.env.APIFY_TOKEN ?? "";
    this.actorId = actorId ?? process.env.APIFY_IG_ACTOR_ID ?? DEFAULT_ACTOR_ID;
  }

  // Submit + await a synchronous actor run. Apify replaces `/` in the
  // actorId with `~` for URL safety (e.g. apify/instagram-scraper →
  // apify~instagram-scraper).
  private async runSync<T>(input: Record<string, unknown>): Promise<T> {
    if (!this.token) {
      throw new DataSourceError("APIFY_TOKEN is not configured");
    }
    const actorPath = this.actorId.replace(/\//g, "~");
    const url = `${BASE}/acts/${actorPath}/run-sync-get-dataset-items?token=${encodeURIComponent(this.token)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(input),
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 402) {
        // Free credit exhausted → treat as rate limit so the chain
        // moves on and the breaker trips after 3 consecutive 402s.
        throw new ProviderRateLimitError("apify", this.actorId);
      }
      if (res.status === 429) {
        throw new ProviderRateLimitError("apify", this.actorId);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new DataSourceError(
          `apify ${this.actorId} returned ${res.status}: ${body.slice(0, 200)}`,
        );
      }
      // Endpoint returns a JSON array of dataset items.
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ProviderRateLimitError) throw e;
      if (e instanceof HandleNotFoundError) throw e;
      if (e instanceof PrivateAccountError) throw e;
      if (e instanceof DataSourceError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new DataSourceError(
          `apify ${this.actorId} timeout after ${TIMEOUT_MS / 1000}s — actor run took too long`,
        );
      }
      throw new DataSourceError(`apify ${this.actorId} fetch error`, e);
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── getProfile ────────────────────────────────────────────────────────────
  override async getProfile(platform: Platform, handle: string): Promise<Profile> {
    if (platform !== "instagram") {
      throw new DataSourceError(`apify-instagram doesn't serve ${platform}`);
    }
    const clean = handle.replace(/^@/, "").trim();
    const items = await this.runSync<ApifyIgItem[]>({
      directUrls: [`https://www.instagram.com/${clean}/`],
      resultsType: "details",
      resultsLimit: 1,
      // Ask the actor to include the most recent posts too — we cache
      // the whole item in memory below so getRecentPosts on the same
      // handle doesn't cost a second actor run.
      addParentData: false,
      searchType: "user",
    });
    const item = items?.[0];
    if (!item || !item.username) {
      throw new HandleNotFoundError(clean, "instagram");
    }
    if (item.username.toLowerCase() !== clean.toLowerCase()) {
      // Fuzzy-match protection — same guard as Hiker + Ensembledata.
      throw new HandleNotFoundError(clean, "instagram");
    }
    if (item.private) {
      throw new PrivateAccountError(clean, "instagram");
    }
    // Cache the item so a follow-up getRecentPosts in the same tool run
    // can reuse the latestPosts payload without a second $$$ actor run.
    this.cacheItem(clean.toLowerCase(), item);
    return {
      handle: item.username,
      displayName: item.fullName ?? undefined,
      followers: Number(item.followersCount ?? 0),
      following: Number(item.followsCount ?? 0),
      verified: Boolean(item.verified),
      isPrivate: Boolean(item.private),
      avatarUrl: item.profilePicUrlHd ?? item.profilePicUrl ?? undefined,
      bio: item.biography ?? undefined,
      niche: item.businessCategoryName ?? undefined,
    };
  }

  // Per-adapter memo cache. Small enough (< ~10KB per entry) that
  // holding a handful in memory per Node process is fine — CachedAdapter
  // (Supabase-backed) already covers cross-request caching; this one
  // is purely to avoid two Apify runs inside a single tool invocation.
  private readonly itemCache = new Map<string, { item: ApifyIgItem; cachedAt: number }>();
  private static readonly ITEM_CACHE_MS = 5 * 60 * 1000; // 5 min

  private cacheItem(handleLower: string, item: ApifyIgItem): void {
    this.itemCache.set(handleLower, { item, cachedAt: Date.now() });
  }

  private cachedItem(handleLower: string): ApifyIgItem | null {
    const hit = this.itemCache.get(handleLower);
    if (!hit) return null;
    if (Date.now() - hit.cachedAt > ApifyInstagramAdapter.ITEM_CACHE_MS) {
      this.itemCache.delete(handleLower);
      return null;
    }
    return hit.item;
  }

  // ── getRecentPosts ────────────────────────────────────────────────────────
  override async getRecentPosts(
    platform: Platform,
    handle: string,
    n: number,
  ): Promise<Post[]> {
    if (platform !== "instagram") return [];
    const clean = handle.replace(/^@/, "").trim();
    const cached = this.cachedItem(clean.toLowerCase());
    let latestPosts: ApifyIgPost[] | undefined = cached?.latestPosts;
    if (!latestPosts) {
      // Fresh actor run — request posts specifically. Some actors
      // return latestPosts inline when resultsType=details; if the
      // configured actor doesn't, this fallback fetches them explicitly.
      const items = await this.runSync<ApifyIgItem[]>({
        directUrls: [`https://www.instagram.com/${clean}/`],
        resultsType: "posts",
        resultsLimit: Math.min(n, 20),
        addParentData: false,
      });
      const item = items?.[0];
      latestPosts = item?.latestPosts ?? (items as unknown as ApifyIgPost[]);
    }
    if (!Array.isArray(latestPosts)) return [];
    return latestPosts.slice(0, n).map((p) => normalizePost(p));
  }

  // ── Everything else — throw so chain falls through to next provider ─────
  //
  // Apify actors CAN do these operations, but with such expensive-and-slow
  // trade-offs that reaching for the next chain member is always the
  // right call. If we ever want Apify to serve any of these, replace
  // the throw with a real runSync call.

  override async getRecentComments(
    _platform: Platform,
    _handle: string,
    _n: number,
  ): Promise<{ post: Post; comments: CommentItem[] }> {
    throw new DataSourceError("apify-instagram: getRecentComments not implemented");
  }

  override async getFollowerSample(
    _platform: Platform,
    _handle: string,
    _n: number,
  ): Promise<FollowerLite[]> {
    throw new DataSourceError("apify-instagram: getFollowerSample not implemented");
  }

  override async isHandleAvailable(
    platform: Platform,
    handle: string,
  ): Promise<UsernameAvailability> {
    // Available check is cheap-ish — just a profile lookup. Reuse getProfile.
    if (platform !== "instagram") return super.isHandleAvailable(platform, handle);
    try {
      const profile = await this.getProfile(platform, handle);
      return {
        platform: "instagram",
        available: false,
        takenBy: {
          followers: profile.followers,
          lastActiveAgo: "recently",
        },
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
    throw new DataSourceError("apify-instagram: getDemographics not implemented");
  }

  override async getReachSignals(_platform: Platform, _handle: string): Promise<ReachSignals> {
    throw new DataSourceError("apify-instagram: getReachSignals not implemented");
  }

  override async getFollowerAudit(_platform: Platform, _handle: string, _sample: number): Promise<FollowerAudit> {
    throw new DataSourceError("apify-instagram: getFollowerAudit not implemented");
  }

  override async getUnfollowerDelta(_platform: Platform, _handle: string): Promise<UnfollowerDelta> {
    throw new DataSourceError("apify-instagram: getUnfollowerDelta not implemented");
  }

  override async getLiveCount(_platform: Platform, _handle: string): Promise<LiveCount> {
    throw new DataSourceError("apify-instagram: getLiveCount not implemented");
  }

  override async getHashtagStatus(_platform: Platform, _hashtag: string): Promise<HashtagStatus> {
    throw new DataSourceError("apify-instagram: getHashtagStatus not implemented");
  }

  override async estimateEarnings(
    platform: Platform,
    profile: Profile,
    posts: Post[],
  ): Promise<EarningsEstimate> {
    return super.estimateEarnings(platform, profile, posts);
  }
}

function normalizePost(p: ApifyIgPost): Post {
  return {
    id: String(p.id ?? p.shortCode ?? ""),
    likes: Number(p.likesCount ?? 0),
    comments: Number(p.commentsCount ?? 0),
    views: p.videoViewCount ?? p.videoPlayCount ?? undefined,
    postedAt: p.timestamp ?? new Date().toISOString(),
    thumbnailUrl: p.displayUrl ?? undefined,
    thumbnailUrlHd: p.displayUrl ?? undefined,
    caption: p.caption ?? undefined,
    durationSec: p.videoDuration ?? undefined,
    videoUrl: p.videoUrl ?? undefined,
    permalink: p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : undefined,
  };
}
