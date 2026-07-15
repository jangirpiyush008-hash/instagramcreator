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
  // HikerAPI's account-search endpoints (confirmed against the live
  // openapi.json at api.hikerapi.com/openapi.json). v2 is the current
  // recommended path; v3 is newer, /v1/search/users is deprecated but
  // still functional. Try in preferred order, keep the first that
  // returns a non-empty user list.
  //
  // NB: search results DON'T include follower_count — that's a separate
  // /v2/user/by/username fetch. We surface the shallow hit here (name,
  // username, pic, verified) and skip enrichment to keep search cheap.
  const q = encodeURIComponent(query);
  const candidatePaths = [
    `/v2/fbsearch/accounts?query=${q}`,
    `/v3/fbsearch/accounts?query=${q}`,
    `/v1/search/users?query=${q}`,
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    for (const path of candidatePaths) {
      const url = `https://api.hikerapi.com${path}`;
      const res = await fetch(url, {
        headers: { "x-access-key": key, accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(`[discover] HikerAPI ${path} → ${res.status}`);
        continue;
      }
      const raw = (await res.json()) as unknown;
      const users = extractHikerUsers(raw);
      if (users.length === 0) {
        console.warn(`[discover] HikerAPI ${path} → 200 but 0 users`);
        continue;
      }
      console.log(`[discover] HikerAPI IG search hit on ${path} (${users.length} users)`);
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
    }
    console.warn("[discover] HikerAPI IG search: no endpoint returned results");
    return [];
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
  // tikwm actual response shape (confirmed via live curl 2026-07):
  //   { code: 0, data: { user_list: [{ user: {...}, stats: {...} }] } }
  // Both `user` and `stats` sit at each user_list entry, NOT flat.
  // Also — the working host is www.tikwm.com; the bare domain
  // 301-redirects but that's flaky for POST-like endpoints. Use www.
  const url = `https://www.tikwm.com/api/user/search?keywords=${encodeURIComponent(query)}&count=${limit}`;
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
    const entries = extractTikwmUserEntries(raw);
    if (entries.length === 0) {
      console.warn("[discover] tikwm TT search returned 0 entries");
    }
    return entries
      .slice(0, limit)
      .map((entry) => {
        const u = entry.user ?? {};
        const s = entry.stats ?? {};
        const handle = u.unique_id ?? u.uniqueId ?? "";
        return {
          platform: "tiktok" as Platform,
          handle,
          displayName: u.nickname,
          bio: u.signature,
          profilePicUrl: u.avatar_thumb ?? u.avatarThumb ?? u.avatar ?? u.avatarMedium,
          isVerified: !!(u.verified ?? u.is_verified),
          followers: Number(s.followerCount ?? s.follower_count ?? u.followerCount ?? 0),
          postCount: Number(s.videoCount ?? s.aweme_count ?? u.aweme_count ?? 0),
        };
      })
      .filter((u) => u.handle.length > 0);
  } catch (e) {
    console.warn("[discover] tikwm TT search error:", e instanceof Error ? e.message : e);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

interface TikwmUserInner {
  id?: string;
  unique_id?: string;
  uniqueId?: string;
  nickname?: string;
  signature?: string;
  avatar?: string;
  avatar_thumb?: string;
  avatarThumb?: string;
  avatarMedium?: string;
  verified?: boolean;
  is_verified?: boolean;
  followerCount?: number;
  aweme_count?: number;
}
interface TikwmStats {
  followerCount?: number;
  follower_count?: number;
  followingCount?: number;
  heartCount?: number;
  videoCount?: number;
  aweme_count?: number;
}
interface TikwmEntry {
  user?: TikwmUserInner;
  stats?: TikwmStats;
}

// tikwm has moved the response shape over time. Handle both:
//   - Current: data.user_list = [{ user: {...}, stats: {...} }]  (used now)
//   - Legacy:  data.user_list = [{ ...userFieldsFlat }]           (fallback)
function extractTikwmUserEntries(raw: unknown): TikwmEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const data = r.data as Record<string, unknown> | undefined;
  const list =
    (data && Array.isArray(data.user_list) ? data.user_list : undefined) ??
    (data && Array.isArray(data.users) ? data.users : undefined) ??
    (Array.isArray(r.users) ? r.users : undefined) ??
    [];
  return (list as unknown[]).map((entry) => {
    if (!entry || typeof entry !== "object") return {};
    const e = entry as Record<string, unknown>;
    // Current shape: user + stats siblings.
    if ("user" in e) return { user: e.user as TikwmUserInner, stats: e.stats as TikwmStats };
    // Legacy shape: fields flat on the entry itself.
    return { user: e as TikwmUserInner };
  });
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
  //
  // KEY nuance: fresh search results from providers DON'T include ER
  // (that requires a per-profile enrichment call we skip for cost). So
  // an ER filter on fresh hits would drop everything with `?? 0`. We
  // pass through unknown-ER hits — the user's filter still applies to
  // CACHED results that were enriched by a prior scan.
  //
  // Same rule for followers: if the provider returned 0 (missing field),
  // don't drop the hit outright — it might be a real profile whose
  // count didn't land in the search response.
  const filtered = fresh.filter((h) => {
    if (filters.followersMin != null && h.followers > 0 && h.followers < filters.followersMin) return false;
    if (filters.followersMax != null && h.followers > 0 && h.followers > filters.followersMax) return false;
    // ER filter only excludes when we HAVE an ER value on the hit.
    if (filters.erMin != null && h.engagementRate != null && h.engagementRate < filters.erMin) return false;
    if (filters.erMax != null && h.engagementRate != null && h.engagementRate > filters.erMax) return false;
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
