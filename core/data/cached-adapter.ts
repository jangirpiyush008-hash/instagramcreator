// Decorator that wraps any DataAdapter with a Supabase-backed primitive cache.
//
// Why:
//   Every scan today calls RapidAPI for {profile, posts, comments, followers}
//   even if a previous tool already fetched the same data 10 seconds ago.
//   Splitting the cache by PRIMITIVE (not by tool) means:
//     - Second tool for the same handle → 0 API calls
//     - Different users hitting popular creators → cache hit for both
//     - Bill goes ~3x further on the same RapidAPI plan
//
// Design:
//   - Each primitive method checks the cache first, returns cached data on hit,
//     otherwise calls the inner adapter and stores the fresh result.
//   - Errors (HandleNotFoundError / ProviderRateLimitError / DataSourceError)
//     bubble past the cache — we never cache a failure. Next request retries.
//   - Cache reads that fail (Supabase down / etc.) silently degrade to a
//     direct inner-adapter call so a flaky cache never breaks a scan.
//   - Methods without external API cost (getFollowerAudit, getDemographics,
//     estimateEarnings, etc.) are pass-through — no cache overhead for
//     already-cheap computation.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform } from "../types";
import type {
  DataAdapter,
  Profile,
  Post,
  UsernameAvailability,
  CommentItem,
  FollowerLite,
  HashtagStatus,
  EarningsEstimate,
  LiveCount,
  ReachSignals,
  DemographicSplit,
  FollowerAudit,
  UnfollowerDelta,
} from "./adapter";

// TTLs tuned to how fast each data type actually changes upstream.
const TTL_HOURS = {
  profile: 24,       // follower count creeps slowly for most accounts
  posts: 6,          // creators post a few times/day tops
  comments: 24,      // comment threads are pretty stable once cool
  thumbnail: 24,     // derived from posts — same freshness class
  followers: 48,     // audience composition changes very slowly
  availability: 12,  // handle takes/frees within a day is enough
};

interface CacheEnvelope<T> {
  v: 1;
  d: T;
}

export class CachedAdapter implements DataAdapter {
  constructor(
    private readonly inner: DataAdapter,
    private readonly supa: SupabaseClient,
    // Prefix lets us bust the whole cache by bumping this string in future
    // migrations without dropping the table.
    private readonly prefix = "v1",
  ) {}

  private key(...parts: (string | number)[]): string {
    return `${this.prefix}:${parts.join(":")}`;
  }

  private async read<T>(key: string): Promise<T | null> {
    try {
      const { data, error } = await this.supa
        .from("data_cache")
        .select("data, expires_at")
        .eq("cache_key", key)
        .maybeSingle();
      if (error || !data) return null;
      if (new Date(data.expires_at).getTime() < Date.now()) return null;
      const env = data.data as CacheEnvelope<T>;
      return env?.v === 1 ? env.d : null;
    } catch (e) {
      console.warn("[cache] read failed, passing through:", e instanceof Error ? e.message : e);
      return null;
    }
  }

  private async write<T>(key: string, value: T, ttlHours: number): Promise<void> {
    try {
      const expires = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
      await this.supa.from("data_cache").upsert(
        { cache_key: key, data: { v: 1, d: value }, expires_at: expires },
        { onConflict: "cache_key" },
      );
    } catch (e) {
      // Cache writes are best-effort. A failed write just means the next
      // request still pays for the primitive — not the end of the world.
      console.warn("[cache] write failed:", e instanceof Error ? e.message : e);
    }
  }

  // ---------------------------------------------------------------------------
  // Cached primitives
  // ---------------------------------------------------------------------------

  async getProfile(platform: Platform, handle: string): Promise<Profile> {
    const key = this.key("profile", platform, handle);
    const hit = await this.read<Profile>(key);
    if (hit) return hit;
    const fresh = await this.inner.getProfile(platform, handle);
    await this.write(key, fresh, TTL_HOURS.profile);
    return fresh;
  }

  // Optional method — only proxy through if the inner adapter implements
  // it. Distinct cache key from getProfile because the loose lookup
  // returns partial data with different semantics.
  async getCommenterInfo(platform: Platform, username: string) {
    if (!this.inner.getCommenterInfo) return {};
    const key = this.key("commenter", platform, username);
    const hit = await this.read<Awaited<ReturnType<NonNullable<typeof this.inner.getCommenterInfo>>>>(key);
    if (hit) return hit;
    const fresh = await this.inner.getCommenterInfo(platform, username);
    await this.write(key, fresh, TTL_HOURS.profile);
    return fresh;
  }

  async getRecentPosts(platform: Platform, handle: string, n: number): Promise<Post[]> {
    // Cache-key includes N so different N-requests don't collide. Storage is
    // cheap; the smarter "fetch max, slice down" optimization can come later
    // if we ever see cache-storage pressure.
    const key = this.key("posts", platform, handle, n);
    const hit = await this.read<Post[]>(key);
    if (hit) return hit;
    const fresh = await this.inner.getRecentPosts(platform, handle, n);
    await this.write(key, fresh, TTL_HOURS.posts);
    return fresh;
  }

  async getRecentComments(platform: Platform, handle: string, n: number) {
    const key = this.key("comments", platform, handle, n);
    const hit = await this.read<{ post: Post; comments: CommentItem[] }>(key);
    if (hit) return hit;
    const fresh = await this.inner.getRecentComments(platform, handle, n);
    await this.write(key, fresh, TTL_HOURS.comments);
    return fresh;
  }

  async getThumbnail(platform: Platform, handle: string) {
    const key = this.key("thumbnail", platform, handle);
    const hit = await this.read<{ post: Post; resolutions: { label: string; url: string; locked: boolean }[] }>(key);
    if (hit) return hit;
    const fresh = await this.inner.getThumbnail(platform, handle);
    await this.write(key, fresh, TTL_HOURS.thumbnail);
    return fresh;
  }

  async getFollowerSample(platform: Platform, handle: string, n: number): Promise<FollowerLite[]> {
    const key = this.key("followers", platform, handle, n);
    const hit = await this.read<FollowerLite[]>(key);
    if (hit) return hit;
    const fresh = await this.inner.getFollowerSample(platform, handle, n);
    // Cache even empty arrays — no need to re-hit the provider to confirm
    // "still zero followers exposed" over and over.
    await this.write(key, fresh, TTL_HOURS.followers);
    return fresh;
  }

  async isHandleAvailable(platform: Platform, handle: string): Promise<UsernameAvailability> {
    const key = this.key("availability", platform, handle);
    const hit = await this.read<UsernameAvailability>(key);
    if (hit) return hit;
    const fresh = await this.inner.isHandleAvailable(platform, handle);
    await this.write(key, fresh, TTL_HOURS.availability);
    return fresh;
  }

  // ---------------------------------------------------------------------------
  // Pass-through — no external API cost, no cache overhead needed
  // ---------------------------------------------------------------------------

  getHashtagStatus(platform: Platform, hashtag: string): Promise<HashtagStatus> {
    return this.inner.getHashtagStatus(platform, hashtag);
  }
  estimateEarnings(platform: Platform, profile: Profile, posts: Post[]): Promise<EarningsEstimate> {
    return this.inner.estimateEarnings(platform, profile, posts);
  }
  getLiveCount(platform: Platform, handle: string): Promise<LiveCount> {
    return this.inner.getLiveCount(platform, handle);
  }
  getReachSignals(platform: Platform, handle: string): Promise<ReachSignals> {
    return this.inner.getReachSignals(platform, handle);
  }
  getDemographics(platform: Platform, handle: string): Promise<DemographicSplit> {
    return this.inner.getDemographics(platform, handle);
  }
  getFollowerAudit(platform: Platform, handle: string, sample: number): Promise<FollowerAudit> {
    return this.inner.getFollowerAudit(platform, handle, sample);
  }
  getUnfollowerDelta(platform: Platform, handle: string): Promise<UnfollowerDelta> {
    return this.inner.getUnfollowerDelta(platform, handle);
  }
}
