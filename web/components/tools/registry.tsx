"use client";

import type { ReactElement } from "react";
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
import { RecentPostsView } from "./views/RecentPostsView";
import type { Platform } from "@/core/types";

export type ToolParamValue = string | number | boolean;
export type ToolParams = Record<string, ToolParamValue>;

export type ToolViewProps = {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
  // Interactive tools (e.g. engagement-rate's post-count selector) read the
  // active params here and call onParamsChange to trigger a re-fetch. Views
  // that don't need them can safely ignore both.
  params?: ToolParams;
  onParamsChange?: (next: ToolParams) => void;
};

export type ToolView = (props: ToolViewProps) => ReactElement;

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
  "recent-posts": RecentPostsView,
};

export function getView(toolId: string): ToolView | undefined {
  return VIEWS[toolId];
}
