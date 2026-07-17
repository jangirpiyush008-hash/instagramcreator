"use client";

import { createContext, useContext } from "react";
import type { Platform } from "@/core/types";

// Shared platform state for the dashboard shell. Set by DashboardShell
// (localStorage-backed, persists across tabs), consumed by inline tool
// workspaces so a sidebar tool click respects the currently-toggled
// platform without needing to pass it through every prop.

export const PlatformContext = createContext<Platform>("instagram");

export function usePlatform(): Platform {
  return useContext(PlatformContext);
}

// Client-side tab state shared between DashboardShell (owns the sidebar
// and setTab) and DashboardPanels (renders the panel). Kept out of the
// URL for click-latency reasons — clicking a sidebar item used to fire
// router.push which re-ran /account's 7 parallel Supabase queries on
// every tap. Now we swap panels in-place and only sync the URL via
// history.replaceState so back/forward + shareable links still work.
export const TabContext = createContext<{
  activeTab: string;
  setTab: (tabId: string) => void;
}>({ activeTab: "overview", setTab: () => undefined });

export function useTab() {
  return useContext(TabContext);
}

// Shared "current handle" state. Set by the Overview master-search
// (localStorage-backed under 'dc-handle'), consumed by ToolWorkspace so
// clicking a sidebar tool pre-fills + auto-submits the same handle
// instead of re-asking. Combined with CachedAdapter (24h profile TTL,
// 6h posts TTL), the first tool click hits the API, every follow-up
// click hits the primitive cache and renders in ~50ms.
export const HandleContext = createContext<{
  handle: string | null;
  setHandle: (h: string | null) => void;
}>({ handle: null, setHandle: () => undefined });

export function useHandle() {
  return useContext(HandleContext);
}
