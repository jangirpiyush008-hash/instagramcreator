import type {
  DataAdapter,
  Profile,
  Post,
  CommentItem,
  DemographicSplit,
  ReachSignals,
  HashtagStatus,
  FollowerAudit,
  UsernameAvailability,
  LiveCount,
  EarningsEstimate,
  UnfollowerDelta,
} from "./adapter";
import type { Platform } from "../types";

// Deterministic per-handle data so dev demos look real before a paid provider
// is wired. Swap with a real provider in core/data/router.ts — the tools never
// see the difference.

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

const NICHES = ["Tech / creator", "Lifestyle", "Fitness", "Fashion", "Food", "Travel", "Comedy", "Gaming"];
const COUNTRIES = ["India", "United States", "United Kingdom", "Brazil", "Indonesia", "Germany"];
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  India: ["Mumbai", "Bengaluru", "Delhi", "Hyderabad"],
  "United States": ["Los Angeles", "New York", "Austin", "Chicago"],
  "United Kingdom": ["London", "Manchester"],
  Brazil: ["São Paulo", "Rio de Janeiro"],
  Indonesia: ["Jakarta", "Surabaya"],
  Germany: ["Berlin", "Munich"],
};
const SUSPICIOUS_USERNAMES = [
  "user_847291", "marketinghack_pro", "buy.likes.now", "raj_8847_x",
  "follow4followx", "growth_hack_22", "promo_yes",
];
const SAMPLE_COMMENTS = [
  "Done! Tagged my BFF 🤞 fingers crossed",
  "Following + sharing on my story now",
  "Already a customer, love this!",
  "Sent ❤️ tagged 3 friends",
  "Pick me pick me 🎉",
  "Just joined! Hope I win",
  "Done all the steps ✓",
];
const SAMPLE_USERNAMES = [
  "anaya_kapoor", "rohan.codes", "the.lina", "kabir_iyer", "meera.creates",
  "saanvi_writes", "akhil.dev", "neha.shops", "the_rohit", "ananya.codes",
];

interface Seeds {
  rng: () => number;
  profile: Profile;
}

function makeSeeds(handle: string, platform: Platform): Seeds {
  const rng = seeded(hash(`${platform}:${handle}`));
  const followersBase = 8_000 + Math.floor(rng() * 480_000);
  const profile: Profile = {
    handle,
    displayName: handle
      .replace(/[._-]/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase()),
    followers: followersBase,
    following: 200 + Math.floor(rng() * 1_800),
    verified: rng() > 0.7,
    bio: "Public account · creator",
    niche: pick(NICHES, rng),
  };
  return { rng, profile };
}

export class MockProvider implements DataAdapter {
  constructor(private readonly platformLabel: "instagram" | "tiktok") {}

  async getProfile(platform: Platform, handle: string): Promise<Profile> {
    const { profile } = makeSeeds(handle, platform);
    return profile;
  }

  async getRecentPosts(platform: Platform, handle: string, n: number): Promise<Post[]> {
    const { rng, profile } = makeSeeds(handle, platform);
    const count = Math.min(Math.max(n, 1), 30);
    const base = Math.max(profile.followers * 0.025, 50);
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => {
      const variance = 0.5 + rng() * 1.5;
      const likes = Math.floor(base * variance);
      return {
        id: `post_${handle}_${i}`,
        likes,
        comments: Math.floor(likes * (0.02 + rng() * 0.04)),
        views: Math.floor(likes * (8 + rng() * 6)),
        postedAt: new Date(now - i * 86400 * 1000 * (1 + rng())).toISOString(),
        thumbnailUrl: undefined,
        title: i === 0 ? "How I built this in a weekend" : `Post ${i + 1}`,
        caption: undefined,
        durationSec: 30 + Math.floor(rng() * 600),
      };
    });
  }

  async isHandleAvailable(platform: Platform, handle: string): Promise<UsernameAvailability> {
    const { rng, profile } = makeSeeds(handle, platform);
    const available = rng() > 0.65;
    if (available) {
      return { platform, available: true };
    }
    return {
      platform,
      available: false,
      takenBy: {
        followers: profile.followers,
        lastActiveAgo: pick(["2d ago", "5d ago", "3w ago", "1y ago", "yesterday"], rng),
      },
    };
  }

  async getHashtagStatus(platform: Platform, hashtag: string): Promise<HashtagStatus> {
    const rng = seeded(hash(`${platform}:tag:${hashtag}`));
    const roll = rng();
    const status: HashtagStatus["status"] = roll < 0.6 ? "ok" : roll < 0.9 ? "warn" : "bad";
    const drop = status === "ok" ? 0 : status === "warn" ? -(20 + Math.floor(rng() * 50)) : -(60 + Math.floor(rng() * 30));
    return {
      hashtag,
      status,
      postsCount24h: Math.floor(1_000 + rng() * 80_000),
      reachDropPct: drop,
      reachTrend: Array.from({ length: 12 }, (_, i) => 100 + drop * (i / 12) + (rng() - 0.5) * 6),
      firstFlaggedAt: status === "ok" ? undefined : "Mar 2026",
      searchVisibility: status === "bad" ? "hidden" : "visible",
      alternatives: [
        `${hashtag}official`,
        `the${hashtag}`,
        `${hashtag}2026`,
      ],
    };
  }

  async getThumbnail(platform: Platform, handle: string) {
    const posts = await this.getRecentPosts(platform, handle, 1);
    const post = posts[0]!;
    return {
      post,
      resolutions: [
        { label: "Standard (640×360)", url: `#mock-${post.id}-sd`, locked: false },
        { label: "HD (1280×720)", url: `#mock-${post.id}-hd`, locked: true },
        { label: "Full HD (1920×1080)", url: `#mock-${post.id}-fhd`, locked: true },
        { label: "Max-res (original)", url: `#mock-${post.id}-max`, locked: true },
      ],
    };
  }

  async estimateEarnings(platform: Platform, profile: Profile, posts: Post[]): Promise<EarningsEstimate> {
    const rng = seeded(hash(`earn:${profile.handle}`));
    // crude CPM-style: followers/1000 * $5–15 base, scaled by engagement
    const er = posts.length
      ? (posts.reduce((a, p) => a + p.likes + p.comments, 0) / posts.length / Math.max(profile.followers, 1)) * 100
      : 1;
    const erMult = Math.max(0.6, Math.min(3, 0.6 + er / 2.5));
    const lo = Math.round((profile.followers / 1000) * (4 + rng() * 3) * erMult);
    const hi = Math.round(lo * (2 + rng()));
    const cadence = 6 + Math.floor(rng() * 12);
    return {
      perPostMin: lo,
      perPostMax: hi,
      perMonth: Math.round(((lo + hi) / 2) * cadence),
      perYear: Math.round(((lo + hi) / 2) * cadence * 12),
      currency: "USD",
      niche: profile.niche ?? "Lifestyle",
      postingCadencePerMonth: cadence,
    };
  }

  async getLiveCount(platform: Platform, handle: string): Promise<LiveCount> {
    const { rng, profile } = makeSeeds(handle, platform);
    const perHour = Math.max(10, Math.floor(profile.followers * (0.0003 + rng() * 0.0008)));
    const history = Array.from({ length: 12 }, (_, i) => profile.followers - (12 - i) * Math.floor(perHour / 12));
    return {
      current: profile.followers,
      perHour,
      perDayProjection: perHour * 24,
      history,
    };
  }

  async getReachSignals(platform: Platform, handle: string): Promise<ReachSignals> {
    const { rng } = makeSeeds(handle, platform);
    const states: ReachSignals["hashtagSearch"][] = ["ok", "warn", "bad"];
    const pickState = () => states[Math.floor(rng() * 3)]!;
    const trend = Array.from({ length: 12 }, (_, i) => Math.max(20, 100 - (rng() * 70 * i) / 11));
    return {
      hashtagSearch: pickState(),
      exploreReach: pickState(),
      reelsDistribution: pickState(),
      storyReplies: pickState(),
      reachTrend: trend,
      estimatedRecoveryDays: 7 + Math.floor(rng() * 10),
    };
  }

  async getRecentComments(platform: Platform, handle: string, n: number) {
    const { rng } = makeSeeds(handle, platform);
    const posts = await this.getRecentPosts(platform, handle, 1);
    const post = posts[0]!;
    const total = 1_500 + Math.floor(rng() * 6_000);
    const sampleN = Math.min(Math.max(n, 1), 50);
    const comments: CommentItem[] = Array.from({ length: sampleN }, (_, i) => ({
      id: `c_${post.id}_${i}`,
      username: SAMPLE_USERNAMES[(Math.floor(rng() * SAMPLE_USERNAMES.length))] ?? "anon",
      text: SAMPLE_COMMENTS[(Math.floor(rng() * SAMPLE_COMMENTS.length))] ?? "Nice",
      postedAt: post.postedAt,
    }));
    // pretend totalCount returned in caller meta — we surface it via the post.comments override
    return {
      post: { ...post, comments: total },
      comments,
    };
  }

  async getDemographics(platform: Platform, handle: string): Promise<DemographicSplit> {
    const { rng } = makeSeeds(handle, platform);
    const female = 35 + Math.floor(rng() * 35);
    const other = 2 + Math.floor(rng() * 6);
    const male = Math.max(0, 100 - female - other);
    const country = pick(COUNTRIES, rng);
    const city = pick(CITIES_BY_COUNTRY[country] ?? ["—"], rng);
    return {
      malePct: male,
      femalePct: female,
      otherPct: other,
      topAgeRange: pick(["18–24", "25–34", "35–44"], rng),
      topCountry: country,
      topCity: city,
      sampleSize: 3000,
    };
  }

  async getFollowerSample(_platform: Platform, _handle: string, _n: number): Promise<import("./adapter").FollowerLite[]> {
    // MockProvider intentionally returns nothing here — the gender-split tool
    // needs REAL follower usernames to do meaningful name-based classification.
    // Feeding it seeded mock data would just fake a random gender split, which
    // was the exact bug we already fixed for the other estimate tools.
    return [];
  }

  async getFollowerAudit(platform: Platform, handle: string, sample: number): Promise<FollowerAudit> {
    const { rng } = makeSeeds(handle, platform);
    const botPct = 4 + Math.floor(rng() * 18);
    const inactivePct = 10 + Math.floor(rng() * 18);
    const realPct = Math.max(0, 100 - botPct - inactivePct);
    const flaggedCount = 3 + Math.floor(rng() * 4);
    return {
      realPct,
      inactivePct,
      botPct,
      sampleSize: Math.min(Math.max(sample, 500), 5_000),
      flagged: Array.from({ length: flaggedCount }, (_, i) => ({
        username: SUSPICIOUS_USERNAMES[i % SUSPICIOUS_USERNAMES.length]!,
        note: pick(
          [
            "0 posts · default avatar · 12 followers",
            "Mass-follow pattern · spam comments",
            "Bio link to follower service",
            "Inactive 14 months",
            "Generated handle · no recent activity",
          ],
          rng,
        ),
      })),
    };
  }

  async getUnfollowerDelta(platform: Platform, handle: string): Promise<UnfollowerDelta> {
    const { rng, profile } = makeSeeds(handle, platform);
    const lost = 200 + Math.floor(rng() * 800);
    const gained = lost + Math.floor(rng() * 600);
    const history = Array.from({ length: 12 }, (_, i) =>
      profile.followers - Math.floor((12 - i) * (gained - lost) / 12),
    );
    return {
      net7d: gained - lost,
      gained7d: gained,
      lost7d: lost,
      trackedSince: "Mar 4",
      followerHistory: history,
      recentUnfollowers: SAMPLE_USERNAMES.slice(0, 5).map((u, i) => ({
        username: u,
        lostAt: pick(["2 hours ago", "Yesterday", "2 days ago", "3 days ago", "4 days ago"], rng),
        followers: 500 + Math.floor(rng() * 30_000),
      })),
      ghostFollowers: Math.floor(profile.followers * 0.012),
      mutualLost: 30 + Math.floor(rng() * 30),
    };
  }
}
