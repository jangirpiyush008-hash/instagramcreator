import type { SocialTool } from "../types";
import { DataUnavailableError } from "../../utils/errors";
import { EDClient, EDError } from "ensembledata";

// Hashtag Finder — takes a hashtag, returns top public posts using it plus
// a quick top-authors summary. Directly uses Ensembledata's hashtag-search
// endpoints (TikTok + YouTube). Instagram doesn't have a documented public
// hashtag search on Ensembledata — reports "unavailable" honestly instead
// of fabricating results.
//
// This tool takes the "handle" field as the hashtag (banned-hashtag does
// the same — it's the simplest way to reuse the existing per-tool routing
// and search UX without inventing a second input schema).

const SDK_TIMEOUT_SEC = 14;

interface TTVideo {
  aweme_id?: string;
  desc?: string;
  create_time?: number;
  author?: {
    unique_id?: string;
    uid?: string;
    nickname?: string;
    avatar_thumb?: { url_list?: string[] };
  };
  statistics?: {
    play_count?: number;
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
  };
  video?: {
    cover?: { url_list?: string[] };
    play_addr?: { url_list?: string[] };
    duration?: number;
  };
}

interface YTVideoSnippet {
  videoId?: string;
  title?: string;
  channelTitle?: string;
  channelId?: string;
  publishedAt?: string;
  thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
  viewCount?: string | number;
  likeCount?: string | number;
  commentCount?: string | number;
}

function edClient(): EDClient | null {
  const raw = (process.env.ENSEMBLEDATA_TOKEN ?? "").trim().replace(/^["']|["']$/g, "");
  if (!raw) return null;
  return new EDClient({ token: raw, timeout: SDK_TIMEOUT_SEC });
}

function tidyHashtag(input: string): string {
  return input.replace(/^#/, "").trim().toLowerCase().slice(0, 60);
}

export const hashtagFinder: SocialTool = {
  id: "hashtag-finder",
  name: "Hashtag Finder",
  intentLabel: "Who's posting under this hashtag?",
  blurb: "Search a hashtag and see the top public posts using it — creators, views, engagement.",
  // Instagram intentionally excluded (Ensembledata has no public IG hashtag
  // search endpoint). Adding it here would just crash tools that expect
  // a real data source.
  platforms: ["tiktok", "youtube"],
  phase: 0,
  seo: {
    slug: "hashtag-finder",
    title: "Hashtag Finder — Top Posts by Hashtag on TikTok & YouTube",
    description:
      "Search a hashtag on TikTok or YouTube and see the top public posts using it — creators, views, engagement.",
  },
  async run({ platform, handle }) {
    const hashtag = tidyHashtag(handle);
    if (!hashtag) {
      throw new Error("Enter a hashtag (letters, numbers, or underscore).");
    }
    const client = edClient();
    if (!client) {
      throw new DataUnavailableError(
        "hashtag-finder",
        "Ensembledata token is not configured for this deployment.",
      );
    }

    if (platform === "tiktok") {
      const res = (await client.tiktok.hashtagSearch({ hashtag })) as {
        data: unknown;
      };
      const raw = res.data as { aweme_list?: TTVideo[]; items?: TTVideo[] } | TTVideo[];
      const items: TTVideo[] = Array.isArray(raw)
        ? raw
        : (raw?.aweme_list ?? raw?.items ?? []);
      const posts = items.slice(0, 12).map((v) => normalizeTT(v, hashtag));
      const authors = collapseAuthors(
        posts.map((p) => ({
          username: p.author,
          avatarUrl: p.authorAvatar,
          followers: null,
          totalViews: p.views ?? 0,
        })),
      );
      return {
        toolId: "hashtag-finder",
        platform,
        handle: `#${hashtag}`,
        free: {
          hashtag,
          totalPostsSampled: posts.length,
          posts,
          topAuthors: authors.slice(0, 8),
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

    if (platform === "youtube") {
      // Ensembledata's YT hashtag endpoint asks for a "depth" — 1 page is
      // enough for a top-12 view. onlyShorts=false gives us the mixed feed.
      const res = (await client.youtube.hashtagSearch({
        hashtag,
        depth: 1,
        onlyShorts: false,
      })) as { data: unknown };
      const raw = res.data as { videos?: YTVideoSnippet[]; items?: YTVideoSnippet[] } | YTVideoSnippet[];
      const items: YTVideoSnippet[] = Array.isArray(raw)
        ? raw
        : (raw?.videos ?? raw?.items ?? []);
      const posts = items.slice(0, 12).map((v) => normalizeYT(v, hashtag));
      const authors = collapseAuthors(
        posts.map((p) => ({
          username: p.author,
          avatarUrl: undefined,
          followers: null,
          totalViews: p.views ?? 0,
        })),
      );
      return {
        toolId: "hashtag-finder",
        platform,
        handle: `#${hashtag}`,
        free: {
          hashtag,
          totalPostsSampled: posts.length,
          posts,
          topAuthors: authors.slice(0, 8),
        },
        locked: {},
        generatedAt: new Date().toISOString(),
      };
    }

    throw new DataUnavailableError(
      "hashtag-finder",
      `Hashtag search is not supported on ${platform} yet — try TikTok or YouTube.`,
    );
  },
};

interface HashtagPost {
  id: string;
  author: string;
  authorAvatar?: string;
  caption: string;
  views: number | null;
  likes: number;
  comments: number;
  postedAt: string;
  thumbnailUrl?: string;
  permalink?: string;
  durationSec?: number;
}

function normalizeTT(v: TTVideo, hashtag: string): HashtagPost {
  const id = v.aweme_id ?? "";
  const author = v.author?.unique_id ?? v.author?.uid ?? "unknown";
  const authorAvatar = v.author?.avatar_thumb?.url_list?.[0];
  const cover = v.video?.cover?.url_list?.[0];
  return {
    id,
    author,
    authorAvatar,
    caption: v.desc ?? `#${hashtag}`,
    views: v.statistics?.play_count ?? null,
    likes: v.statistics?.digg_count ?? 0,
    comments: v.statistics?.comment_count ?? 0,
    postedAt: v.create_time
      ? new Date(v.create_time * 1000).toISOString()
      : new Date().toISOString(),
    thumbnailUrl: cover,
    permalink: id && author ? `https://www.tiktok.com/@${author}/video/${id}` : undefined,
    durationSec: v.video?.duration,
  };
}

function normalizeYT(v: YTVideoSnippet, hashtag: string): HashtagPost {
  const id = v.videoId ?? "";
  const author = v.channelTitle ?? "unknown";
  const thumb = v.thumbnails?.high?.url ?? v.thumbnails?.medium?.url;
  const toNum = (x: string | number | undefined): number =>
    typeof x === "number" ? x : x ? Number(x) || 0 : 0;
  return {
    id,
    author,
    caption: v.title ?? `#${hashtag}`,
    views: v.viewCount ? toNum(v.viewCount) : null,
    likes: toNum(v.likeCount),
    comments: toNum(v.commentCount),
    postedAt: v.publishedAt ?? new Date().toISOString(),
    thumbnailUrl: thumb,
    permalink: id ? `https://www.youtube.com/watch?v=${id}` : undefined,
  };
}

function collapseAuthors(rows: {
  username: string;
  avatarUrl?: string;
  followers: number | null;
  totalViews: number;
}[]) {
  const map = new Map<
    string,
    { username: string; avatarUrl?: string; posts: number; totalViews: number }
  >();
  for (const r of rows) {
    const key = r.username.toLowerCase();
    const cur = map.get(key);
    if (cur) {
      cur.posts += 1;
      cur.totalViews += r.totalViews;
    } else {
      map.set(key, {
        username: r.username,
        avatarUrl: r.avatarUrl,
        posts: 1,
        totalViews: r.totalViews,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.totalViews - a.totalViews);
}

// Suppress unused-import warning — EDError is intentionally imported for
// consumers that want to catch specific status codes from this tool.
void EDError;
