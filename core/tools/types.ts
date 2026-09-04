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

export type ToolParams = Record<string, string | number | boolean>;

export interface SocialTool {
  id: string;                 // "engagement-rate"
  name: string;               // "Engagement Rate"
  intentLabel: string;        // shown in picker: "How engaged is this audience?"
  blurb: string;              // short description for cards
  platforms: Platform[];
  phase: 0 | 1 | 2 | 3;       // 0 = shipped; 1/2/3 = roadmap (intent picker shows badge)
  seo: { slug: string; title: string; description: string };
  // Opt out of the 48h ToolResult cache. Underlying provider primitive
  // cache (CachedAdapter) still applies. Use for tools where users expect
  // a fresh read every submit (e.g. Authenticity Analyzer's decode score
  // should re-run on every click, not return the same cached verdict for
  // 48 hours). Default is false — the standard cache path.
  skipCache?: boolean;
  // pure logic — reads ONLY from the DataAdapter. No network calls of its own.
  run(args: {
    platform: Platform;
    handle: string;
    data: DataAdapter;
    params?: ToolParams;
  }): Promise<ToolResult>;
}
