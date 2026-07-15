"use client";

import Link from "next/link";

// Landing panel for the dashboard. Consumer-focused — API-side details
// (keys, tiers, usage log) live on the Developer tab.

interface RecentScan {
  scan_key: string;    // "platform:handle:toolId"
  created_at: string;
}

interface WatchlistLite {
  id: string;
  platform: string;
  handle: string;
}

interface Props {
  planLabel: string;
  activeSub: boolean;
  scansUsed: number;
  scansLimit: number;
  reportsUnlocked: number;
  recent: RecentScan[];
  watchlist: WatchlistLite[];
  onOpenTab: (tabId: string) => void;
}

export function OverviewPanel({
  planLabel,
  activeSub,
  scansUsed,
  scansLimit,
  reportsUnlocked,
  recent,
  watchlist,
  onOpenTab,
}: Props) {
  const remaining = Math.max(0, scansLimit - scansUsed);
  const pct = scansLimit > 0 ? Math.min(100, Math.round((scansUsed / scansLimit) * 100)) : 0;

  return (
    <div className="space-y-8 max-w-5xl">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-foreground/70 mt-1 text-sm">
          Everything you&apos;ve done on DecodeCreator at a glance.
        </p>
      </header>

      {/* KPI grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Current plan" value={planLabel} sub={activeSub ? "Active" : "Free tier"} />
        <StatCard
          label="Scans this month"
          value={scansUsed.toLocaleString()}
          sub={`${remaining.toLocaleString()} remaining`}
          progress={pct}
        />
        <StatCard
          label="Reports unlocked"
          value={reportsUnlocked}
          sub="one-time paid unlocks"
        />
        <StatCard
          label="Watched accounts"
          value={watchlist.length}
          sub="on your watchlist"
        />
      </div>

      {/*
        Free ER calculator was here but removed — redundant with the
        sidebar's Engagement Rate scan tool (which runs against real
        profile data). Free-math calculator lives on the homepage
        only now.
      */}

      {/* Upgrade CTA when on Free tier */}
      {!activeSub && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 flex flex-wrap items-center gap-4 justify-between">
          <div>
            <div className="font-semibold">Ready for more?</div>
            <div className="text-sm text-foreground/70 mt-1">
              Upgrade to Starter (₹599/mo) for 150 scans, all 12 tools, and watermark-free exports.
            </div>
          </div>
          <Link
            href="/pricing"
            className="rounded-full bg-gradient-ig text-white px-5 py-2 text-sm font-semibold hover:brightness-110 transition"
          >
            See plans →
          </Link>
        </div>
      )}

      {/* Recent scans */}
      <section>
        <SectionHeader>Recent scans</SectionHeader>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-foreground/70">
            No scans yet. Pick a tool from the sidebar to run your first.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card/60 overflow-hidden divide-y divide-border">
            {recent.slice(0, 8).map((r) => {
              const [platform, handle, toolId] = r.scan_key.split(":");
              if (!platform || !handle || !toolId) return null;
              return (
                <button
                  key={r.scan_key + r.created_at}
                  type="button"
                  onClick={() => onOpenTab(toolId)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      <span className="uppercase text-xs tracking-wider text-foreground/60 mr-2">
                        {platform}
                      </span>
                      @{handle}
                    </div>
                    <div className="text-xs text-foreground/60 mt-0.5">
                      {toolId} · {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-primary">Re-run →</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Watchlist preview */}
      {watchlist.length > 0 && (
        <section>
          <SectionHeader>
            Watching
            <button
              type="button"
              onClick={() => onOpenTab("watchlist")}
              className="text-xs text-primary font-medium hover:underline ml-auto"
            >
              Manage →
            </button>
          </SectionHeader>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {watchlist.slice(0, 6).map((w) => (
              <div
                key={w.id}
                className="rounded-lg border border-border bg-card/60 p-3 text-sm flex items-center gap-2"
              >
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-muted/70 text-foreground/70">
                  {w.platform}
                </span>
                <span className="font-medium truncate">@{w.handle}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  progress,
}: {
  label: string;
  value: string | number;
  sub?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="text-xs uppercase tracking-wider text-foreground/60 font-medium">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-foreground/60 mt-1">{sub}</div>}
      {progress !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-border/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-ig transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/70">{children}</h2>
    </div>
  );
}
