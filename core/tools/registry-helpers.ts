import type { Platform } from "../types";
import { TOOLS } from "./registry";

// Returns the ordered list of tool IDs supported by a given platform.
// Used by executeFullReport to enumerate what to bundle.
export function getAllToolsForPlatform(platform: Platform): string[] {
  return TOOLS.filter((t) => t.platforms.includes(platform) && t.phase === 0).map((t) => t.id);
}

// Sidebar category grouping used by the dashboard shell. Keeps a single
// source of truth so the sidebar order matches what the docs page and
// full-report bundle emit. Only lists tool IDs — the shell looks up
// name/slug/blurb via getTool() when it renders.
export type ToolCategory = "user-data" | "media-data" | "discovery";

export const TOOL_CATEGORIES: {
  id: ToolCategory;
  label: string;
  toolIds: string[];
}[] = [
  {
    id: "user-data",
    label: "User Data",
    toolIds: [
      "engagement-rate",
      "gender-split",
      "fake-follower",
      "unfollower-tracker",
      "live-counter",
      "shadowban-checker",
      "earnings-estimator",
    ],
  },
  {
    id: "media-data",
    label: "Media Data",
    toolIds: ["recent-posts", "thumbnail-downloader", "comment-picker"],
  },
  {
    id: "discovery",
    label: "Discovery",
    toolIds: ["username-checker", "banned-hashtag"],
  },
];
