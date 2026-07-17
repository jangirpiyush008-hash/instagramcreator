import type { Platform } from "../types";
import type { SocialTool } from "./types";
import { engagementRate } from "./engagement-rate";
import { usernameChecker } from "./username-checker";
import { bannedHashtag } from "./banned-hashtag";
import { hashtagFinder } from "./hashtag-finder";
import { thumbnailDownloader } from "./thumbnail-downloader";
import { earningsEstimator } from "./earnings-estimator";
import { shadowbanChecker } from "./shadowban-checker";
import { commentPicker } from "./comment-picker";
import { unfollowerTracker } from "./unfollower-tracker";
import { fakeFollower } from "./fake-follower";
import { genderSplit } from "./gender-split";
import { recentPosts } from "./recent-posts";

// Add a tool: drop a file in core/tools/<id>/index.ts that implements SocialTool,
// import it here, and append to TOOLS. The intent picker, scan API, paywall gating,
// and SEO pages all read from this registry — nothing else changes.
//
// Phase: 0 = shipped, 1/2/3 = roadmap stubs. Stubs render in the intent picker
// with a "Coming soon" badge; their run() throws NotImplementedError which the
// scan API converts to a clean 501 response.
export const TOOLS: readonly SocialTool[] = [
  engagementRate,
  usernameChecker,
  bannedHashtag,
  hashtagFinder,
  thumbnailDownloader,
  earningsEstimator,
  shadowbanChecker,
  commentPicker,
  unfollowerTracker,
  fakeFollower,
  genderSplit,
  recentPosts,
];

export const toolsForPlatform = (p: Platform): SocialTool[] =>
  TOOLS.filter((t) => t.platforms.includes(p));

export const getTool = (id: string): SocialTool | undefined =>
  TOOLS.find((t) => t.id === id);

// Slug lookup drives the /{platform}/{handle}/{slug} SEO route. Slugs
// live in seo.slug (curated for search — e.g. gender-split's slug is
// 'audience-demographics'). We ALSO accept id as a fallback so the
// route works even if we haven't picked a slug yet.
export const getToolBySlug = (slug: string): SocialTool | undefined =>
  TOOLS.find((t) => t.seo.slug === slug) ??
  TOOLS.find((t) => t.id === slug);
