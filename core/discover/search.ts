import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform } from "../types";

// Provider-level creator search. Wraps HikerAPI (IG), tikwm (TikTok),
// and YouTube Data API (YT) so /api/discover has one entry point per
// platform. Each returns a normalized DiscoveryHit — the DB shape lives
// in supabase/migrations/0007_creator_index.sql.
//
// Design note: we return "shallow" hits (basic profile + follower count)
// on the first pass. We do NOT enrich each hit with recent posts + ER
// here — that's a per-click cost we cap by only enriching what the user
// actually saves or clicks. If we enriched every hit, a 20-result query
// would cost ~20× the search itself.

export interface DiscoveryHit {
  platform: Platform;
  handle: string;
  displayName?: string;
  bio?: string;
  profilePicUrl?: string;
  externalUrl?: string;
  isVerified: boolean;
  followers: number;
  postCount?: number;
  engagementRate?: number; // percent, e.g. 3.14
  avgViews?: number;
  avgLikes?: number;
  avgComments?: number;
}

export interface SearchFilters {
  q?: string;
  followersMin?: number;
  followersMax?: number;
  erMin?: number;
  erMax?: number;
  limit?: number; // capped at 50
}

// ── Cache lookup ────────────────────────────────────────────────────────
//
// The whole search flow is: check DB first, if we have >= limit rows
// matching this platform+filters and any of them is fresh (< 24h), return
// from DB. Otherwise call the provider, upsert results, and return.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function readCreatorIndex(
  supa: SupabaseClient,
  platform: Platform,
  filters: SearchFilters,
): Promise<DiscoveryHit[]> {
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
  const freshSince = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  let q = supa
    .from("creator_index")
    .select(
      "platform, handle, display_name, bio, profile_pic_url, external_url, is_verified, followers, post_count, engagement_rate, avg_views, avg_likes, avg_comments",
    )
    .eq("platform", platform)
    .gte("refreshed_at", freshSince);

  if (filters.followersMin != null) q = q.gte("followers", filters.followersMin);
  if (filters.followersMax != null) q = q.lte("followers", filters.followersMax);
  if (filters.erMin != null) q = q.gte("engagement_rate", filters.erMin);
  if (filters.erMax != null) q = q.lte("engagement_rate", filters.erMax);
  if (filters.q && filters.q.trim().length > 0) {
    // trigram / ilike match against search_text (bio + handle + name).
    // Postgres will use the GIN index when the pattern is long enough.
    q = q.ilike("search_text", `%${filters.q.trim().toLowerCase()}%`);
  }

  q = q.order("followers", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) {
    console.warn("[discover] cache read failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    platform: r.platform as Platform,
    handle: r.handle,
    displayName: r.display_name ?? undefined,
    bio: r.bio ?? undefined,
    profilePicUrl: r.profile_pic_url ?? undefined,
    externalUrl: r.external_url ?? undefined,
    isVerified: r.is_verified,
    followers: Number(r.followers ?? 0),
    postCount: r.post_count ?? undefined,
    engagementRate: r.engagement_rate ?? undefined,
    avgViews: r.avg_views ?? undefined,
    avgLikes: r.avg_likes ?? undefined,
    avgComments: r.avg_comments ?? undefined,
  }));
}

// ── Cache write ─────────────────────────────────────────────────────────

export async function upsertCreators(
  supa: SupabaseClient,
  hits: DiscoveryHit[],
): Promise<void> {
  if (hits.length === 0) return;
  const rows = hits.map((h) => ({
    platform: h.platform,
    handle: h.handle,
    display_name: h.displayName ?? null,
    bio: h.bio ?? null,
    profile_pic_url: h.profilePicUrl ?? null,
    external_url: h.externalUrl ?? null,
    is_verified: h.isVerified,
    followers: h.followers,
    post_count: h.postCount ?? 0,
    engagement_rate: h.engagementRate ?? null,
    avg_views: h.avgViews ?? null,
    avg_likes: h.avgLikes ?? null,
    avg_comments: h.avgComments ?? null,
    refreshed_at: new Date().toISOString(),
  }));
  const { error } = await supa
    .from("creator_index")
    .upsert(rows, { onConflict: "platform,handle" });
  if (error) {
    // Non-fatal — the caller still returns results to the user.
    console.warn("[discover] upsert failed:", error.message);
  }
}

// ── Provider search: Instagram (HikerAPI) ──────────────────────────────

export async function searchInstagram(query: string, limit = 20): Promise<DiscoveryHit[]> {
  const key = process.env.HIKER_API_KEY;
  if (!key) {
    console.warn("[discover] HIKER_API_KEY not configured — IG search unavailable");
    return [];
  }
  // HikerAPI user search — returns a page of matched profiles.
  const url = `https://api.hikerapi.com/v1/user/search/user_v2?query=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { "x-access-key": key, accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[discover] HikerAPI IG search returned", res.status);
      return [];
    }
    const raw = (await res.json()) as unknown;
    const users = extractHikerUsers(raw);
    return users.slice(0, limit).map((u) => ({
      platform: "instagram" as Platform,
      handle: u.username,
      displayName: u.full_name,
      bio: u.biography,
      profilePicUrl: u.profile_pic_url,
      isVerified: u.is_verified ?? false,
      followers: Number(u.follower_count ?? 0),
      postCount: Number(u.media_count ?? 0),
    }));
  } catch (e) {
    console.warn("[discover] HikerAPI IG search error:", e instanceof Error ? e.message : e);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

interface HikerUser {
  username: string;
  full_name?: string;
  biography?: string;
  profile_pic_url?: string;
  is_verified?: boolean;
  follower_count?: number;
  media_count?: number;
}

function extractHikerUsers(raw: unknown): HikerUser[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  // Provider returns either { users: [...] } or bare array — defensive.
  if (Array.isArray(r.users)) return r.users as HikerUser[];
  if (Array.isArray(r)) return r as unknown as HikerUser[];
  if (Array.isArray(r.data)) return r.data as HikerUser[];
  return [];
}

// ── Provider search: TikTok (tikwm) ────────────────────────────────────

export async function searchTikTok(query: string, limit = 20): Promise<DiscoveryHit[]> {
  // tikwm exposes a keyword user search — free-tier friendly.
  const url = `https://tikwm.com/api/user/search?keywords=${encodeURIComponent(query)}&count=${limit}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    const apiKey = process.env.TIKWM_API_KEY;
    if (apiKey) headers["X-API-KEY"] = apiKey;
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[discover] tikwm TT search returned", res.status);
      return [];
    }
    const raw = (await res.json()) as unknown;
    const users = extractTikwmUsers(raw);
    return users.slice(0, limit).map((u) => ({
      platform: "tiktok" as Platform,
      handle: u.unique_id ?? u.uniqueId ?? "",
      displayName: u.nickname,
      bio: u.signature,
      profilePicUrl: u.avatar_thumb ?? u.avatar,
      isVerified: !!(u.verified ?? u.is_verified),
      followers: Number(u.follower_count ?? u.followerCount ?? 0),
      postCount: Number(u.aweme_count ?? 0),
    })).filter((u) => u.handle.length > 0);
  } catch (e) {
    console.warn("[discover] tikwm TT search error:", e instanceof Error ? e.message : e);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

interface TikwmUser {
  unique_id?: string;
  uniqueId?: string;
  nickname?: string;
  signature?: string;
  avatar?: string;
  avatar_thumb?: string;
  verified?: boolean;
  is_verified?: boolean;
  follower_count?: number;
  followerCount?: number;
  aweme_count?: number;
}

function extractTikwmUsers(raw: unknown): TikwmUser[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const data = r.data as Record<string, unknown> | undefined;
  if (data && Array.isArray(data.user_list)) return data.user_list as TikwmUser[];
  if (data && Array.isArray(data.users)) return data.users as TikwmUser[];
  if (Array.isArray(r.users)) return r.users as TikwmUser[];
  return [];
}

// ── Provider search: YouTube (Data API v3) ─────────────────────────────

export async function searchYouTube(query: string, limit = 20): Promise<DiscoveryHit[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.warn("[discover] YOUTUBE_API_KEY not configured — YT search unavailable");
    return [];
  }
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=${Math.min(50, limit)}` +
    `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(searchUrl, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      console.warn("[discover] YouTube search returned", res.status);
      return [];
    }
    const raw = (await res.json()) as YouTubeSearchResp;
    const items = raw.items ?? [];
    // We have snippet only — need a second call to statistics.
    const channelIds = items
      .map((it) => it.snippet?.channelId ?? it.id?.channelId)
      .filter((x): x is string => !!x);
    if (channelIds.length === 0) return [];

    const statsUrl =
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics` +
      `&id=${channelIds.join(",")}&key=${encodeURIComponent(key)}`;
    const statsRes = await fetch(statsUrl, { signal: controller.signal, cache: "no-store" });
    if (!statsRes.ok) {
      console.warn("[discover] YouTube channels lookup returned", statsRes.status);
      return [];
    }
    const statsRaw = (await statsRes.json()) as YouTubeChannelsResp;
    return (statsRaw.items ?? []).map((c) => ({
      platform: "youtube" as Platform,
      handle: c.snippet?.customUrl?.replace(/^@/, "") ?? c.snippet?.title ?? c.id ?? "",
      displayName: c.snippet?.title,
      bio: c.snippet?.description,
      profilePicUrl: c.snippet?.thumbnails?.default?.url,
      externalUrl: `https://www.youtube.com/channel/${c.id}`,
      isVerified: false, // YT Data API doesn't expose verified badge
      followers: Number(c.statistics?.subscriberCount ?? 0),
      postCount: Number(c.statistics?.videoCount ?? 0),
      avgViews:
        Number(c.statistics?.viewCount ?? 0) /
        Math.max(1, Number(c.statistics?.videoCount ?? 1)),
    })).filter((u) => u.handle.length > 0);
  } catch (e) {
    console.warn("[discover] YouTube search error:", e instanceof Error ? e.message : e);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

interface YouTubeSearchResp {
  items?: {
    id?: { channelId?: string };
    snippet?: { channelId?: string };
  }[];
}
interface YouTubeChannelsResp {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
      thumbnails?: { default?: { url?: string } };
    };
    statistics?: {
      subscriberCount?: string;
      videoCount?: string;
      viewCount?: string;
    };
  }[];
}

// ── Main entry ─────────────────────────────────────────────────────────

export async function searchCreators(
  supa: SupabaseClient,
  platform: Platform,
  filters: SearchFilters,
): Promise<DiscoveryHit[]> {
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20));

  // 1. Try cache first.
  const cached = await readCreatorIndex(supa, platform, filters);
  if (cached.length >= limit) return cached.slice(0, limit);

  // 2. Cache miss / partial — hit the provider.
  const query = (filters.q ?? "").trim();
  if (query.length === 0) return cached; // nothing to search for, return whatever we cached

  let fresh: DiscoveryHit[] = [];
  if (platform === "instagram") fresh = await searchInstagram(query, limit);
  else if (platform === "tiktok") fresh = await searchTikTok(query, limit);
  else fresh = await searchYouTube(query, limit);

  // 3. Persist so next search for the same query is instant.
  if (fresh.length > 0) await upsertCreators(supa, fresh);

  // 4. Apply the numeric filters client-side to the fresh page.
  const filtered = fresh.filter((h) => {
    if (filters.followersMin != null && h.followers < filters.followersMin) return false;
    if (filters.followersMax != null && h.followers > filters.followersMax) return false;
    if (filters.erMin != null && (h.engagementRate ?? 0) < filters.erMin) return false;
    if (filters.erMax != null && (h.engagementRate ?? 0) > filters.erMax) return false;
    return true;
  });

  // 5. Merge cached + fresh, dedup by handle, sorted by followers desc.
  const seen = new Set<string>();
  const merged: DiscoveryHit[] = [];
  for (const h of [...cached, ...filtered]) {
    if (seen.has(h.handle)) continue;
    seen.add(h.handle);
    merged.push(h);
  }
  merged.sort((a, b) => b.followers - a.followers);
  return merged.slice(0, limit);
}
