"use client";

import Link from "next/link";

// Small standalone panels for Subscription and Watchlist tabs. Kept
// separate from OverviewPanel + DeveloperHub so the DashboardPanels
// router can compose them cleanly without pulling in the old
// AccountDashboard tabbed component (retired in Phase H).

// ── Subscription panel ──────────────────────────────────────────────────
interface UnlockRow {
  id: string;
  scan_key: string;
  created_at: string;
}
interface Subscription {
  plan: string;
  status: string;
  renewsAt: string | null;
  provider: string;
}

export function SubscriptionPanel({
  subscription,
  unlocks,
  planLabel,
  activeSub,
}: {
  subscription: Subscription | null;
  unlocks: UnlockRow[];
  planLabel: string;
  activeSub: boolean;
}) {
  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Subscription</h1>
        <p className="text-foreground/70 mt-1 text-sm">
          Your web-app plan and one-time report unlocks. Developer API billing is separate — see the
          Developer API tab.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card/70 p-5">
        <h2 className="font-semibold mb-2">Current plan</h2>
        {subscription ? (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-foreground/70">Plan:</span>{" "}
              <span className="font-semibold">{subscription.plan}</span>
            </p>
            <p>
              <span className="text-foreground/70">Status:</span> {subscription.status}
            </p>
            {subscription.renewsAt && (
              <p>
                <span className="text-foreground/70">Renews:</span>{" "}
                {new Date(subscription.renewsAt).toLocaleDateString()}
              </p>
            )}
            <p className="text-foreground/60 text-xs pt-2">
              Manage billing through your {subscription.provider} portal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground/70">
              You&apos;re on <span className="text-foreground font-semibold">{planLabel}</span>.
              Upgrade to unlock every tool, remove teasers, and get priority support.
            </p>
            <Link
              href="/pricing"
              className="inline-block rounded-md bg-gradient-ig text-white px-4 py-2 text-sm font-semibold hover:brightness-110 transition"
            >
              See plans →
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card/70 p-5">
        <h2 className="font-semibold mb-2">One-time unlocks</h2>
        {unlocks.length > 0 ? (
          <ul className="divide-y divide-border text-sm">
            {unlocks.map((u) => (
              <li key={u.id} className="py-3 flex justify-between gap-4">
                <span className="truncate">{u.scan_key}</span>
                <span className="text-foreground/60 text-xs whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground/70">
            No one-time unlocks yet. When you pay to unlock a specific report, it shows up here.
          </p>
        )}
      </div>

      {!activeSub && (
        <div className="rounded-xl border border-border bg-card/40 p-5 text-xs text-foreground/70">
          <span className="text-foreground font-semibold">Looking for API billing?</span> The
          Developer API has its own tiers — open the Developer API tab in the sidebar.
        </div>
      )}
    </div>
  );
}

// ── Watchlist panel ─────────────────────────────────────────────────────
interface WatchlistRow {
  id: string;
  platform: string;
  handle: string;
  label: string | null;
  created_at: string;
}

export function WatchlistPanel({ rows }: { rows: WatchlistRow[] }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Watchlist</h1>
        <p className="text-foreground/70 mt-1 text-sm">
          Accounts you&apos;ve added for ongoing monitoring. Managed via the{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/v1/watchlist</code> API endpoint.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/70 p-6 text-sm text-foreground/70">
          No accounts on your watchlist. Use{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /v1/watchlist</code> to add
          accounts you want to monitor over time.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border bg-card/70 p-4 flex items-center gap-3"
            >
              <div className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-muted/70 text-foreground/70 font-semibold">
                {r.platform}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">@{r.handle}</div>
                {r.label && <div className="text-xs text-foreground/60 truncate">{r.label}</div>}
              </div>
              <div className="text-xs text-foreground/60 whitespace-nowrap">
                added {new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
