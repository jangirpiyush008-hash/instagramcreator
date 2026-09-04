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
  // Opt out of the 48h ToolResult cache entirely. Underlying provider
  // primitive cache (CachedAdapter) still applies. Use only when EVERY
  // scan MUST fetch fresh (very rare — usually cacheTtlSeconds is what
  // you want instead). Default is false.
  skipCache?: boolean;
  // Override the 48h ToolResult cache TTL for this tool (in seconds).
  // Used for tools where users expect fresh-feeling scans but where a
  // short debounce (e.g. 5 min) is fine — repeat clicks on the same
  // handle within the window return cached results (no credit charge,
  // no provider burn), but any scan older than this returns fresh.
  // The read path also honors this — old cache rows with longer TTL
  // are treated as expired for this tool, so a change here can't leak
  // stale results from pre-change cache entries.
  cacheTtlSeconds?: number;
  // pure logic — reads ONLY from the DataAdapter. No network calls of its own.
  run(args: {
    platform: Platform;
    handle: string;
    data: DataAdapter;
    params?: ToolParams;
  }): Promise<ToolResult>;
}
