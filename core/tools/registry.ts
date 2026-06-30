import type { Platform } from "../types";
import type { SocialTool } from "./types";
import { engagementRate } from "./engagement-rate";
import { usernameChecker } from "./username-checker";
import { bannedHashtag } from "./banned-hashtag";
import { thumbnailDownloader } from "./thumbnail-downloader";
import { earningsEstimator } from "./earnings-estimator";
import { liveCounter } from "./live-counter";
import { shadowbanChecker } from "./shadowban-checker";
import { commentPicker } from "./comment-picker";
import { unfollowerTracker } from "./unfollower-tracker";
import { fakeFollower } from "./fake-follower";
import { genderSplit } from "./gender-split";

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
  thumbnailDownloader,
  earningsEstimator,
  liveCounter,
  shadowbanChecker,
  commentPicker,
  unfollowerTracker,
  fakeFollower,
  genderSplit,
];

export const toolsForPlatform = (p: Platform): SocialTool[] =>
  TOOLS.filter((t) => t.platforms.includes(p));

export const getTool = (id: string): SocialTool | undefined =>
  TOOLS.find((t) => t.id === id);
