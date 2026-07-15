"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Platform } from "@/core/types";
import { TOOL_CATEGORIES } from "@/core/tools/registry-helpers";
import { TOOLS } from "@/core/tools/registry";

// GramScraper-style dashboard shell. Renders:
//   • Left sidebar: tool categories (User Data / Media Data / Discovery)
//     + account settings (Overview, API Keys, Usage, Watchlist, Billing).
//   • Top bar: platform toggle (IG/TT/YT), credit meter, user pill, sign out.
//   • Main content area: whatever the page passes as children.
//
// Platform selection is stored in localStorage under 'dc-platform' so
// sidebar tool links respect the user's most-recent choice across pages.
// Falls back to 'instagram' on first visit / SSR.

const ACCOUNT_TABS: { id: string; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "api-keys", label: "API Keys", icon: "◉" },
  { id: "usage", label: "API Usage", icon: "◇" },
  { id: "watchlist", label: "Watchlist", icon: "◐" },
  { id: "subscription", label: "Subscription", icon: "◆" },
];

// Trimmed tool metadata — the shell reads name + slug from the registry
// at build time; passing serializable objects into the client keeps the
// registry's run() functions out of the bundle.
type ToolMeta = {
  id: string;
  slug: string;
  name: string;
  platforms: Platform[];
};
const TOOL_META: Record<string, ToolMeta> = Object.fromEntries(
  TOOLS.map((t) => [
    t.id,
    { id: t.id, slug: t.seo.slug ?? t.id, name: t.name, platforms: [...t.platforms] },
  ]),
);

export function DashboardShell({
  children,
  user,
  credits,
  activeTab,
}: {
  children: React.ReactNode;
  user: { email: string; name?: string; avatarUrl?: string };
  credits: { used: number; limit: number; tierName: string };
  activeTab?: string; // for account-section highlighting
}) {
  const pathname = usePathname();
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [platformReady, setPlatformReady] = useState(false);

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

  function selectPlatform(p: Platform) {
    setPlatform(p);
    try {
      window.localStorage.setItem("dc-platform", p);
    } catch {
      // localStorage disabled — selection still works for this tab.
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex">
      {/* SIDEBAR */}
      <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 border-r border-border bg-card/40 flex-col">
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
          {TOOL_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-2">
                {cat.label}
              </div>
              <div className="space-y-0.5">
                {cat.toolIds.map((toolId) => {
                  const tool = TOOL_META[toolId];
                  if (!tool) return null;
                  const supports = tool.platforms.includes(platform);
                  const href = `/${platform}/creator/${tool.slug}`;
                  return (
                    <SidebarItem
                      key={tool.id}
                      href={href}
                      label={tool.name}
                      active={pathname?.endsWith(`/${tool.slug}`) ?? false}
                      disabled={!supports}
                      disabledHint={
                        !supports ? `Not available on ${labelFor(platform)}` : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-2">
              Account
            </div>
            <div className="space-y-0.5">
              {ACCOUNT_TABS.map((t) => (
                <SidebarItem
                  key={t.id}
                  href={`/account?tab=${t.id}`}
                  label={t.label}
                  icon={t.icon}
                  active={activeTab === t.id}
                />
              ))}
              <SidebarItem
                key="api"
                href="/developer"
                label="Developer API"
                icon="◧"
                highlight
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
              <UserPill user={user} />
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 px-4 sm:px-6 py-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}

// ── Sidebar item ─────────────────────────────────────────────────────────
function SidebarItem({
  href,
  label,
  icon,
  active,
  disabled,
  disabledHint,
  highlight,
}: {
  href: string;
  label: string;
  icon?: string;
  active?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  highlight?: boolean;
}) {
  const baseClass =
    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors " +
    (active
      ? "bg-primary/10 text-primary font-medium"
      : highlight
      ? "text-primary hover:bg-primary/10"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/50");

  if (disabled) {
    return (
      <div
        title={disabledHint}
        className={
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground/50 cursor-not-allowed"
        }
      >
        {icon && <span className="text-xs opacity-70">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
    );
  }
  return (
    <Link href={href} className={baseClass}>
      {icon && <span className="text-xs opacity-70">{icon}</span>}
      <span className="truncate">{label}</span>
    </Link>
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
                : "text-muted-foreground hover:text-foreground")
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
        <div className="font-medium tabular-nums">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
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
function UserPill({ user }: { user: { email: string; name?: string; avatarUrl?: string } }) {
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2 text-sm">
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
      <div className="hidden md:block">
        <div className="text-xs font-medium leading-tight">
          {user.name ?? "Account"}
        </div>
        <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">
          {user.email}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
function labelFor(p: Platform): string {
  if (p === "instagram") return "Instagram";
  if (p === "tiktok") return "TikTok";
  return "YouTube";
}
