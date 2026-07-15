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
