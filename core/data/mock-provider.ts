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
import { DataUnavailableError } from "../utils/errors";

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

  async isHandleAvailable(_platform: Platform, _handle: string): Promise<UsernameAvailability> {
    // No mock fabrication — the availability tool would rather report
    // "unknown" than a made-up 458k follower count. Any real provider
    // that fails should let this bubble; ChainAdapter converts it into
    // a null availability state per platform.
    throw new DataUnavailableError("isHandleAvailable");
  }

  async getHashtagStatus(_platform: Platform, _hashtag: string): Promise<HashtagStatus> {
    // The banned-hashtag tool uses its own curated dictionary + structural
    // checks. This adapter method has no real backing anywhere.
    throw new DataUnavailableError("getHashtagStatus");
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

  async getLiveCount(_platform: Platform, _handle: string): Promise<LiveCount> {
    // Live-counter tool computes from real Supabase follower_snapshots.
    // No adapter-level mock — that would defeat the entire feature.
    throw new DataUnavailableError("getLiveCount");
  }

  async getReachSignals(_platform: Platform, _handle: string): Promise<ReachSignals> {
    // Shadowban-checker tool computes from real post metrics
    // (viewsPerFollower, likesPerFollower, recent-vs-older reach medians).
    // No adapter-level backing.
    throw new DataUnavailableError("getReachSignals");
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

  async getDemographics(_platform: Platform, _handle: string): Promise<DemographicSplit> {
    // Gender-split tool computes from real audience enrichment
    // (bio/face/name inference on real commenters). Fabricating a split
    // here would ship the exact fake numbers the tool is designed to
    // replace with honest ones.
    throw new DataUnavailableError("getDemographics");
  }

  async getFollowerSample(_platform: Platform, _handle: string, _n: number): Promise<import("./adapter").FollowerLite[]> {
    // MockProvider intentionally returns nothing here — the gender-split tool
    // needs REAL follower usernames to do meaningful name-based classification.
    // Feeding it seeded mock data would just fake a random gender split, which
    // was the exact bug we already fixed for the other estimate tools.
    return [];
  }

  async getFollowerAudit(_platform: Platform, _handle: string, _sample: number): Promise<FollowerAudit> {
    // Fake-follower tool builds its quality score from real public
    // engagement + follow ratios + audience-profile completeness.
    // No adapter-level backing.
    throw new DataUnavailableError("getFollowerAudit");
  }

  async getUnfollowerDelta(_platform: Platform, _handle: string): Promise<UnfollowerDelta> {
    // Unfollower-tracker tool reads real Supabase follower_snapshots
    // and computes 7d/30d windowed deltas. No adapter-level backing.
    throw new DataUnavailableError("getUnfollowerDelta");
  }
}
