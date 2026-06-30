"use client";

import { EngagementRateView } from "./views/EngagementRateView";
import { UsernameCheckerView } from "./views/UsernameCheckerView";
import { BannedHashtagView } from "./views/BannedHashtagView";
import { ThumbnailDownloaderView } from "./views/ThumbnailDownloaderView";
import { EarningsEstimatorView } from "./views/EarningsEstimatorView";
import { LiveCounterView } from "./views/LiveCounterView";
import { ShadowbanCheckerView } from "./views/ShadowbanCheckerView";
import { CommentPickerView } from "./views/CommentPickerView";
import { UnfollowerTrackerView } from "./views/UnfollowerTrackerView";
import { FakeFollowerView } from "./views/FakeFollowerView";
import { GenderSplitView } from "./views/GenderSplitView";
import type { Platform } from "@/core/types";

export type ToolViewProps = {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
};

export type ToolView = (props: ToolViewProps) => JSX.Element;

// Map toolId → result-view component. Adding a tool means adding a row here.
export const VIEWS: Record<string, ToolView> = {
  "engagement-rate": EngagementRateView,
  "username-checker": UsernameCheckerView,
  "banned-hashtag": BannedHashtagView,
  "thumbnail-downloader": ThumbnailDownloaderView,
  "earnings-estimator": EarningsEstimatorView,
  "live-counter": LiveCounterView,
  "shadowban-checker": ShadowbanCheckerView,
  "comment-picker": CommentPickerView,
  "unfollower-tracker": UnfollowerTrackerView,
  "fake-follower": FakeFollowerView,
  "gender-split": GenderSplitView,
};

export function getView(toolId: string): ToolView | undefined {
  return VIEWS[toolId];
}
