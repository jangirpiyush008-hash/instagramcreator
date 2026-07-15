"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Platform } from "@/core/types";
import { TOOLS } from "@/core/tools/registry";
import { OverviewPanel } from "./OverviewPanel";
import { ToolWorkspace } from "./ToolWorkspace";
import { DeveloperHub } from "@/web/components/developer/DeveloperHub";

// Right-panel router. Reads ?tab= and picks which panel to render.
// - overview          → OverviewPanel (default landing)
// - developer         → inline DeveloperHub (same content as /developer route)
// - subscription      → SubscriptionPanel (renders below via prop)
// - watchlist         → WatchlistPanel (renders below via prop)
// - any tool ID       → ToolWorkspace with inline ScanResult
// - unknown           → falls back to overview

// Serializable tool metadata — the shell reads name/blurb/platforms via
// this map so the client bundle doesn't need to import tool implementations.
type ToolMeta = {
  id: string;
  slug: string;
  name: string;
  intentLabel: string;
  blurb: string;
  platforms: Platform[];
};
const TOOL_META: Record<string, ToolMeta> = Object.fromEntries(
  TOOLS.filter((t) => t.phase === 0).map((t) => [
    t.id,
    {
      id: t.id,
      slug: t.seo.slug ?? t.id,
      name: t.name,
      intentLabel: t.intentLabel,
      blurb: t.blurb,
      platforms: [...t.platforms],
    },
  ]),
);

// `overview` accepts only the DATA props of OverviewPanel — never the
// onOpenTab callback. Callbacks can't cross the server→client boundary in
// Next.js App Router, so the server passes serializable data only and
// DashboardPanels wires setTab in below.
interface Props {
  activeTab: string;
  overview: Omit<React.ComponentProps<typeof OverviewPanel>, "onOpenTab">;
  developer: React.ComponentProps<typeof DeveloperHub>;
  subscriptionPanel: React.ReactNode;
  watchlistPanel: React.ReactNode;
}

export function DashboardPanels({
  activeTab,
  overview,
  developer,
  subscriptionPanel,
  watchlistPanel,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();

  // Same setTab pattern as DashboardShell — kept here so OverviewPanel's
  // "Re-run" clicks can hop straight into a tool workspace.
  const setTab = useCallback(
    (tabId: string) => {
      const p = new URLSearchParams(search.toString());
      p.set("tab", tabId);
      router.push(`/account?${p.toString()}`, { scroll: false });
    },
    [router, search],
  );

  if (activeTab === "developer") {
    return <DeveloperHub {...developer} />;
  }
  if (activeTab === "subscription") {
    return <>{subscriptionPanel}</>;
  }
  if (activeTab === "watchlist") {
    return <>{watchlistPanel}</>;
  }

  const tool = TOOL_META[activeTab];
  if (tool) {
    return (
      <ToolWorkspace
        toolId={tool.id}
        toolName={tool.name}
        intentLabel={tool.intentLabel}
        blurb={tool.blurb}
        supportedPlatforms={tool.platforms}
      />
    );
  }

  return <OverviewPanel {...overview} onOpenTab={setTab} />;
}
