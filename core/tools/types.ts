import type { Platform } from "../types";
import type { DataAdapter } from "../data/adapter";

export interface ToolResult {
  toolId: string;
  platform: Platform;
  handle: string;
  // free fields are always shown; locked fields are blurred until entitled
  free: Record<string, unknown>;
  locked: Record<string, unknown>;
  generatedAt: string; // ISO
}

export interface SocialTool {
  id: string;                 // "engagement-rate"
  name: string;               // "Engagement Rate"
  intentLabel: string;        // shown in picker: "How engaged is this audience?"
  blurb: string;              // short description for cards
  platforms: Platform[];
  phase: 0 | 1 | 2 | 3;       // 0 = shipped; 1/2/3 = roadmap (intent picker shows badge)
  seo: { slug: string; title: string; description: string };
  // pure logic — reads ONLY from the DataAdapter. No network calls of its own.
  run(args: { platform: Platform; handle: string; data: DataAdapter }): Promise<ToolResult>;
}
