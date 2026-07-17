"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Platform } from "@/core/types";
import { TOOL_CATEGORIES } from "@/core/tools/registry-helpers";
import { TOOLS } from "@/core/tools/registry";
import { PlatformContext, TabContext } from "./PlatformContext";

// GramScraper-style dashboard shell. Sidebar clicks stay on the SAME URL
// (they just swap ?tab=X in the query), so the whole dashboard behaves
// like a single-page workspace. The right-panel content (children) reads
// the tab param and renders the matching workspace / panel.
//
// Platform selection lives in localStorage under 'dc-platform' and is
// exposed via PlatformContext for panels to consume without prop-drilling.

const ACCOUNT_TABS: { id: string; label: string }[] = [
  { id: "profile", label: "My Profile" },
  { id: "subscription", label: "Subscription" },
  { id: "watchlist", label: "Watchlist" },
];

// Trimmed tool metadata — serializable subset the client bundle can
// safely import. Full SocialTool holds a run() function that can't
// cross the server→client boundary.
type ToolMeta = {
  id: string;
  slug: string;
  name: string;
  intentLabel: string;
  platforms: Platform[];
};
const TOOL_META: Record<string, ToolMeta> = Object.fromEntries(
  TOOLS.map((t) => [
    t.id,
    {
      id: t.id,
      slug: t.seo.slug ?? t.id,
      name: t.name,
      intentLabel: t.intentLabel,
      platforms: [...t.platforms],
    },
  ]),
);

export function DashboardShell({
  children,
  user,
  credits,
  activeTab: initialTab,
}: {
  children: React.ReactNode;
  user: { email: string; name?: string; avatarUrl?: string };
  credits: { used: number; limit: number; tierName: string };
  activeTab: string;
}) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [platformReady, setPlatformReady] = useState(false);
  // activeTab lives client-side to keep tab switches near-instant. Was
  // going through router.push before, which re-ran /account's 7 Supabase
  // queries on every click. The URL is still synced via history.replaceState
  // below so back/forward + copy-shared links still work.
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("dc-platform");
      if (stored === "instagram" || stored === "tiktok" || stored === "youtube") {
        setPlatform(stored);
      }
    } catch {
      // localStorage disabled — stick with default.
    }
    setPlatformReady(true);
  }, []);

  // Keep local state in sync if the parent server component re-renders
  // with a different initialTab (e.g. after a payment redirect back to
  // /account?tab=subscription&status=success).
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  function selectPlatform(p: Platform) {
    setPlatform(p);
    try {
      window.localStorage.setItem("dc-platform", p);
    } catch {
      // ignore
    }
  }

  // Sidebar item click → swap panels in-place (no server re-fetch) and
  // update the URL via history.replaceState so a browser back button, a
  // shared link, or a page reload still land the user on the same tab.
  // scroll behavior is preserved because we're not navigating.
  const setTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tabId);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // window.history may throw in restricted iframes; the UI still
      // works, we just don't update the URL.
    }
  }, []);

  const contextValue = useMemo(() => platform, [platform]);
  const tabContextValue = useMemo(
    () => ({ activeTab, setTab }),
    [activeTab, setTab],
  );

  return (
    <TabContext.Provider value={tabContextValue}>
    <PlatformContext.Provider value={contextValue}>
      <div className="min-h-[calc(100vh-4rem)] flex">
        {/* SIDEBAR */}
        <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 border-r border-border bg-card/40 flex-col">
          <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
            {/* Overview — always first, always visible */}
            <div>
              <SidebarItem
                label="Overview"
                active={activeTab === "overview"}
                onClick={() => setTab("overview")}
              />
            </div>

            {/* Tool categories */}
            {TOOL_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <SectionHeader label={cat.label} />
                <div className="space-y-0.5">
                  {cat.toolIds.map((toolId) => {
                    const tool = TOOL_META[toolId];
                    if (!tool) return null;
                    const supports = tool.platforms.includes(platform);
                    return (
                      <SidebarItem
                        key={tool.id}
                        label={tool.name}
                        active={activeTab === tool.id}
                        disabled={!supports}
                        disabledHint={
                          !supports ? `Not available on ${labelFor(platform)}` : undefined
                        }
                        onClick={() => setTab(tool.id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Account section */}
            <div>
              <SectionHeader label="Account" />
              <div className="space-y-0.5">
                {ACCOUNT_TABS.map((t) => (
                  <SidebarItem
                    key={t.id}
                    label={t.label}
                    active={activeTab === t.id}
                    onClick={() => setTab(t.id)}
                  />
                ))}
                <SidebarItem
                  label="Developer API"
                  active={activeTab === "developer"}
                  highlight
                  onClick={() => setTab("developer")}
                />
              </div>
            </div>
          </nav>
        </aside>

        {/* MAIN */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* TOP BAR */}
          <div className="border-b border-border bg-background/60 backdrop-blur">
            <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                {platformReady && (
                  <PlatformToggle platform={platform} onChange={selectPlatform} />
                )}
              </div>
              <div className="flex items-center gap-4">
                <CreditMeter used={credits.used} limit={credits.limit} tierName={credits.tierName} />
                <UserPill user={user} onClick={() => setTab("profile")} />
              </div>
            </div>
          </div>

          {/* CONTENT */}
          <div className="flex-1 px-4 sm:px-6 py-6 lg:py-8">{children}</div>
        </div>
      </div>
    </PlatformContext.Provider>
    </TabContext.Provider>
  );
}

// ── Section header (bolder + larger per user feedback) ───────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-foreground px-3 mb-2 mt-1">
      {label}
    </div>
  );
}

// ── Sidebar item ─────────────────────────────────────────────────────────
function SidebarItem({
  label,
  active,
  disabled,
  disabledHint,
  highlight,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  if (disabled) {
    return (
      <div
        title={disabledHint}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground/30 cursor-not-allowed"
      >
        <span className="truncate">{label}</span>
      </div>
    );
  }
  const baseClass =
    "w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors " +
    (active
      ? "bg-primary/10 text-primary"
      : highlight
      ? "text-primary hover:bg-primary/10"
      : "text-foreground/80 hover:text-foreground hover:bg-muted/60");
  return (
    <button type="button" onClick={onClick} className={baseClass}>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Platform toggle ──────────────────────────────────────────────────────
function PlatformToggle({
  platform,
  onChange,
}: {
  platform: Platform;
  onChange: (p: Platform) => void;
}) {
  const options: { id: Platform; label: string; gradient: string }[] = [
    { id: "instagram", label: "Instagram", gradient: "bg-gradient-ig" },
    { id: "tiktok", label: "TikTok", gradient: "bg-gradient-tt" },
    { id: "youtube", label: "YouTube", gradient: "bg-gradient-yt" },
  ];
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card/70 p-1">
      {options.map((o) => {
        const active = platform === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={
              "px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all " +
              (active
                ? `${o.gradient} text-white shadow`
                : "text-foreground/70 hover:text-foreground")
            }
            aria-pressed={active}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Credit meter ─────────────────────────────────────────────────────────
function CreditMeter({
  used,
  limit,
  tierName,
}: {
  used: number;
  limit: number;
  tierName: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const low = pct >= 80;
  return (
    <Link
      href="/pricing"
      title={`${tierName} plan — ${used.toLocaleString()} of ${limit.toLocaleString()} scans used`}
      className="hidden sm:flex items-center gap-3 rounded-full border border-border bg-card/70 px-3 py-1.5 hover:border-primary/50 transition"
    >
      <div className="text-xs">
        <div className="font-semibold tabular-nums">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </div>
        <div className="text-[10px] text-foreground/60 uppercase tracking-wider">
          {tierName} scans
        </div>
      </div>
      <div className="w-20 h-1.5 rounded-full bg-border/70 overflow-hidden">
        <div
          className={"h-full rounded-full transition-all " + (low ? "bg-amber-500" : "bg-gradient-ig")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

// ── User pill ────────────────────────────────────────────────────────────
// Clickable — jumps to the Profile tab so a user always has one obvious
// way to reach their settings. Replaces the previous separate Dashboard
// button in the header nav (which was redundant with the logo redirect).
function UserPill({
  user,
  onClick,
}: {
  user: { email: string; name?: string; avatarUrl?: string };
  onClick?: () => void;
}) {
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();
  // Email lives in the button's tooltip (hover to reveal) instead of as a
  // separate always-visible line. Keeps the header lean and lets the
  // "Account" / display-name breathe on narrower screens.
  const inner = (
    <>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          className="h-8 w-8 rounded-full border border-border"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-gradient-ig text-white grid place-items-center text-xs font-semibold">
          {initial}
        </div>
      )}
      <div className="hidden md:block text-left">
        <div className="text-xs font-semibold leading-tight">{user.name ?? "Account"}</div>
      </div>
    </>
  );
  const tooltip = `${user.name ? `${user.name} · ` : ""}${user.email} — open profile`;
  if (!onClick) return <div className="flex items-center gap-2 text-sm" title={tooltip}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className="flex items-center gap-2 text-sm rounded-full pr-3 pl-0.5 py-0.5 hover:bg-muted/60 transition-colors"
    >
      {inner}
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
function labelFor(p: Platform): string {
  if (p === "instagram") return "Instagram";
  if (p === "tiktok") return "TikTok";
  return "YouTube";
}
