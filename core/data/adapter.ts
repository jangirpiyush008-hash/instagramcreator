import type { Platform } from "../types";

export interface Profile {
  handle: string;
  displayName?: string;
  followers: number;
  following: number;
  verified: boolean;
  isPrivate?: boolean;
  avatarUrl?: string;
  // optional demographic / location signals when available
  bio?: string;
  niche?: string;
}

export interface Post {
  id: string;
  likes: number;
  comments: number;
  views?: number;
  postedAt: string;
  thumbnailUrl?: string;
  // Highest-quality thumbnail available, for HD download slot.
  thumbnailUrlHd?: string;
  title?: string;
  caption?: string;
  durationSec?: number;
  // Playable video URL. Watermarked variant for TikTok; the plain video URL for IG.
  videoUrl?: string;
  // Non-watermarked / HD variant when the provider exposes one.
  videoUrlHd?: string;
  // Deep-link back to the original post on the platform.
  permalink?: string;
}

export interface CommentItem {
  id: string;
  username: string;
  text: string;
  postedAt: string;
}

export interface DemographicSplit {
  malePct: number;
  femalePct: number;
  otherPct: number;
  topAgeRange: string;
  topCountry: string;
  topCity: string;
  sampleSize: number;
}

export interface ReachSignals {
  hashtagSearch: "ok" | "warn" | "bad";
  exploreReach: "ok" | "warn" | "bad";
  reelsDistribution: "ok" | "warn" | "bad";
  storyReplies: "ok" | "warn" | "bad";
  reachTrend: number[];          // last N data points, indexed 100 = baseline
  estimatedRecoveryDays?: number;
}

export interface HashtagStatus {
  hashtag: string;
  status: "ok" | "warn" | "bad";
  postsCount24h: number;
  reachDropPct: number;          // negative = drop
  reachTrend: number[];
  firstFlaggedAt?: string;
  searchVisibility: "visible" | "hidden";
  alternatives: string[];
}

export interface FollowerAudit {
  realPct: number;
  inactivePct: number;
  botPct: number;
  sampleSize: number;
  flagged: {
    username: string;
    note: string;
  }[];
}

export interface UsernameAvailability {
  platform: Platform;
  available: boolean;
  takenBy?: {
    followers: number;
    lastActiveAgo: string;       // human label e.g. "2d ago"
  };
}

export interface LiveCount {
  current: number;
  perHour: number;
  perDayProjection: number;
  history: number[];
}

export interface EarningsEstimate {
  perPostMin: number;            // in minor currency (paise / cents)
  perPostMax: number;
  perMonth: number;
  perYear: number;
  currency: "USD" | "INR";
  niche: string;
  postingCadencePerMonth: number;
}

export interface UnfollowerDelta {
  net7d: number;
  gained7d: number;
  lost7d: number;
  trackedSince: string;
  followerHistory: number[];
  recentUnfollowers: {
    username: string;
    lostAt: string;
    followers: number;
  }[];
  ghostFollowers: number;
  mutualLost: number;
}

export interface DataAdapter {
  // Phase 0 baseline
  getProfile(platform: Platform, handle: string): Promise<Profile>;
  getRecentPosts(platform: Platform, handle: string, n: number): Promise<Post[]>;

  // Phase 1
  isHandleAvailable(platform: Platform, handle: string): Promise<UsernameAvailability>;
  getHashtagStatus(platform: Platform, hashtag: string): Promise<HashtagStatus>;
  getThumbnail(platform: Platform, handle: string): Promise<{ post: Post; resolutions: { label: string; url: string; locked: boolean }[] }>;
  estimateEarnings(platform: Platform, profile: Profile, posts: Post[]): Promise<EarningsEstimate>;
  getLiveCount(platform: Platform, handle: string): Promise<LiveCount>;

  // Phase 2
  getReachSignals(platform: Platform, handle: string): Promise<ReachSignals>;
  getRecentComments(platform: Platform, handle: string, n: number): Promise<{ post: Post; comments: CommentItem[] }>;
  getDemographics(platform: Platform, handle: string): Promise<DemographicSplit>;

  // Phase 3
  getFollowerAudit(platform: Platform, handle: string, sample: number): Promise<FollowerAudit>;
  getUnfollowerDelta(platform: Platform, handle: string): Promise<UnfollowerDelta>;
}
