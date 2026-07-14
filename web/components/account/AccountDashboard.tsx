"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  tier: string;
  creditsRemaining: number;
  creditsIncluded: number;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

interface UsageRow {
  endpoint: string;
  credits_charged: number;
  response_code: number;
  created_at: string;
  platform: string | null;
  handle: string | null;
}

interface WatchlistRow {
  id: string;
  platform: string;
  handle: string;
  label: string | null;
  created_at: string;
}

interface Subscription {
  plan: string;
  status: string;
  renewsAt: string | null;
  provider: string;
}

interface UnlockRow {
  id: string;
  scan_key: string;
  created_at: string;
  currency: string;
  amount_minor: number;
}

interface Props {
  initialTab: string;
  consumer: {
    planLabel: string;
    activeSub: boolean;
    reportsUnlocked: number;
  };
  developer: {
    apiCalls: number;
    creditsRemaining: number;
    creditsIncluded: number;
    watchlistCount: number;
    hasKey: boolean;
    tierName: string;
  };
  subscription: Subscription | null;
  unlocks: UnlockRow[];
  apiKeys: ApiKeyRow[];
  usage: UsageRow[];
  watchlist: WatchlistRow[];
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "subscription", label: "Subscription" },
  { id: "api-keys", label: "API Keys" },
  { id: "usage", label: "API Usage" },
  { id: "watchlist", label: "Watchlist" },
  { id: "docs", label: "Docs" },
] as const;

export function AccountDashboard(props: Props) {
  const [tab, setTab] = useState<string>(props.initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("Default");
  const router = useRouter();

  async function createKey() {
    setBusy("create");
    try {
      const res = await fetch("/api/account/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Failed to create key");
        return;
      }
      router.push(`/account?tab=api-keys&newKey=${encodeURIComponent(j.raw)}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? Requests using it will start failing immediately.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/account/keys/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Failed to revoke key");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap " +
                (active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "overview" && <OverviewTab consumer={props.consumer} developer={props.developer} />}
      {tab === "subscription" && (
        <SubscriptionTab
          subscription={props.subscription}
          unlocks={props.unlocks}
          activeSub={props.consumer.activeSub}
          planLabel={props.consumer.planLabel}
        />
      )}
      {tab === "api-keys" && (
        <ApiKeysTab
          keys={props.apiKeys}
          busy={busy}
          newKeyName={newKeyName}
          setNewKeyName={setNewKeyName}
          createKey={createKey}
          revokeKey={revokeKey}
        />
      )}
      {tab === "usage" && <UsageTab rows={props.usage} />}
      {tab === "watchlist" && <WatchlistTab rows={props.watchlist} />}
      {tab === "docs" && <DocsTab />}
    </div>
  );
}

function OverviewTab({
  consumer,
  developer,
}: {
  consumer: Props["consumer"];
  developer: Props["developer"];
}) {
  const pct =
    developer.creditsIncluded > 0
      ? Math.min(
          100,
          Math.max(0, (developer.creditsRemaining / developer.creditsIncluded) * 100),
        )
      : 0;
  const lowCredits = developer.hasKey && pct < 20;
  return (
    <div className="space-y-8">
      {/* CONSUMER ZONE */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-1 rounded-full bg-gradient-ig" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">Your account</h2>
            <p className="text-xs text-muted-foreground">
              Using DecodeCreator through the web app
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <StatCard
            label="Current plan"
            value={consumer.planLabel}
            sub={consumer.activeSub ? "Active subscription" : "No active subscription"}
          />
          <StatCard
            label="Reports unlocked"
            value={consumer.reportsUnlocked}
            sub="one-time paid unlocks"
          />
          <div className="rounded-xl border border-border bg-card/60 p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Grow your usage
              </div>
              <div className="text-sm mt-1">
                {consumer.activeSub
                  ? "You're on a paid plan — thank you."
                  : "Unlock every tool with a Creator plan."}
              </div>
            </div>
            {!consumer.activeSub && (
              <Link
                href="/pricing"
                className="mt-3 inline-block rounded-md bg-gradient-ig text-white px-3 py-1.5 text-xs font-medium hover:brightness-110 transition text-center"
              >
                See plans →
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* DEVELOPER ZONE */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-1 rounded-full bg-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">Developer API</h2>
            <p className="text-xs text-muted-foreground">
              Programmatic access — one endpoint per tool, per-credit pricing
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="API tier"
            value={developer.tierName}
            sub={developer.hasKey ? "Active key" : "No key yet"}
          />
          <StatCard
            label="Credits remaining"
            value={developer.creditsRemaining.toLocaleString()}
            sub={`of ${developer.creditsIncluded.toLocaleString()} this month`}
            progress={pct}
          />
          <StatCard
            label="API calls"
            value={developer.apiCalls}
            sub="last 50 recorded"
          />
          <StatCard
            label="Watchlist"
            value={developer.watchlistCount}
            sub="accounts monitored"
          />
        </div>
        {!developer.hasKey && (
          <div className="rounded-xl border border-border bg-card/60 p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="text-sm">
              <div className="font-medium">You don&apos;t have an API key yet.</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Generate one in the API Keys tab — takes 5 seconds, no card required.
              </div>
            </div>
            <Link
              href="/account?tab=api-keys"
              className="rounded-md bg-gradient-ig text-white px-3 py-1.5 text-xs font-medium hover:brightness-110 transition"
            >
              Generate key →
            </Link>
          </div>
        )}
        {lowCredits && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="text-sm">
              <div className="font-medium text-amber-200">Credits running low</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                You&apos;ve used {Math.round(100 - pct)}% of this month&apos;s credits.
              </div>
            </div>
            <Link
              href="/docs#pricing"
              className="rounded-md border border-amber-400/40 text-amber-100 px-3 py-1.5 text-xs font-medium hover:bg-amber-500/10 transition"
            >
              Upgrade tier →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

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
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
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

function SubscriptionTab({
  subscription,
  unlocks,
  activeSub,
  planLabel,
}: {
  subscription: Subscription | null;
  unlocks: UnlockRow[];
  activeSub: boolean;
  planLabel: string;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card/60 p-5">
        <h3 className="font-medium mb-2">Subscription</h3>
        {subscription ? (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Plan:</span>{" "}
              <span className="font-medium">{subscription.plan}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Status:</span> {subscription.status}
            </p>
            {subscription.renewsAt && (
              <p>
                <span className="text-muted-foreground">Renews:</span>{" "}
                {new Date(subscription.renewsAt).toLocaleDateString()}
              </p>
            )}
            <p className="text-muted-foreground text-xs pt-2">
              Manage billing in your {subscription.provider} portal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You&apos;re on <span className="text-foreground font-medium">{planLabel}</span>.
              Upgrade to unlock every tool, remove teasers, and get priority support.
            </p>
            <Link
              href="/pricing"
              className="inline-block rounded-md bg-gradient-ig text-white px-4 py-2 text-sm font-medium hover:brightness-110 transition"
            >
              See plans →
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-5">
        <h3 className="font-medium mb-2">One-time unlocks</h3>
        {unlocks.length > 0 ? (
          <ul className="divide-y divide-border text-sm">
            {unlocks.map((u) => (
              <li key={u.id} className="py-3 flex justify-between gap-4">
                <span className="truncate">{u.scan_key}</span>
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No one-time unlocks yet. When you pay to unlock a specific report, it shows up here.
          </p>
        )}
      </div>

      {!activeSub && (
        <div className="rounded-xl border border-border bg-card/40 p-5 text-xs text-muted-foreground">
          <span className="text-foreground font-medium">Looking for API billing?</span> The
          Developer API has its own tiers and billing — see the{" "}
          <Link href="/account?tab=api-keys" className="underline">API Keys</Link> and{" "}
          <Link href="/docs" className="underline">Docs</Link> tabs. Web-app subscriptions and API
          subscriptions are billed separately.
        </div>
      )}
    </div>
  );
}

function ApiKeysTab({
  keys,
  busy,
  newKeyName,
  setNewKeyName,
  createKey,
  revokeKey,
}: {
  keys: ApiKeyRow[];
  busy: string | null;
  newKeyName: string;
  setNewKeyName: (v: string) => void;
  createKey: () => void;
  revokeKey: (id: string) => void;
}) {
  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card/60 p-5">
        <div className="text-sm font-medium mb-2">Create a new API key</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Production, Staging)"
            className="flex-1 h-10 rounded-md border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={createKey}
            disabled={busy === "create" || !newKeyName.trim()}
            className="h-10 px-4 rounded-md bg-gradient-ig text-white text-sm font-medium hover:brightness-110 disabled:opacity-60 transition"
          >
            {busy === "create" ? "Creating…" : "Generate key"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          The raw key is shown ONCE after creation. Copy it immediately — we only store a hash.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Active keys</h3>
        {active.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
            No active keys yet. Generate one above to start using the API.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card/60 overflow-hidden divide-y divide-border">
            {active.map((k) => (
              <div key={k.id} className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{k.name}</div>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">
                    {k.prefix}••••••••••••••••
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {k.tier} · {k.creditsRemaining.toLocaleString()} / {k.creditsIncluded.toLocaleString()} credits ·
                    created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt && ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => revokeKey(k.id)}
                  disabled={busy === k.id}
                  className="text-xs text-destructive border border-destructive/40 hover:bg-destructive/10 rounded-md px-3 py-1.5 transition disabled:opacity-60"
                >
                  {busy === k.id ? "Revoking…" : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {revoked.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 text-muted-foreground">Revoked keys</h3>
          <div className="rounded-xl border border-border bg-card/40 overflow-hidden divide-y divide-border">
            {revoked.map((k) => (
              <div key={k.id} className="p-4 opacity-60">
                <div className="text-sm">{k.name}</div>
                <div className="text-xs font-mono text-muted-foreground mt-0.5 line-through">
                  {k.prefix}••••••••••••••••
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Revoked {k.revokedAt ? new Date(k.revokedAt).toLocaleDateString() : "recently"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UsageTab({ rows }: { rows: UsageRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
        No API calls yet. Once you start using your key, the last 50 calls appear here.
      </div>
    );
  }
  const totalCredits = rows.reduce((sum, r) => sum + (r.credits_charged || 0), 0);
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Last {rows.length} calls · {totalCredits.toLocaleString()} credits total
      </div>
      <div className="rounded-xl border border-border bg-card/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left px-4 py-3">When</th>
              <th className="text-left px-4 py-3">Endpoint</th>
              <th className="text-left px-4 py-3">Target</th>
              <th className="text-right px-4 py-3">Credits</th>
              <th className="text-right px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/50 last:border-b-0">
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{r.endpoint}</td>
                <td className="px-4 py-2 text-xs">
                  {r.platform && r.handle ? `${r.platform}/${r.handle}` : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.credits_charged}</td>
                <td className="px-4 py-2 text-right text-xs">
                  <span
                    className={
                      r.response_code >= 200 && r.response_code < 300
                        ? "text-emerald-300"
                        : "text-red-300"
                    }
                  >
                    {r.response_code}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WatchlistTab({ rows }: { rows: WatchlistRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
        No accounts on your watchlist. Use{" "}
        <code className="bg-black/30 px-1.5 py-0.5 rounded text-xs">POST /v1/watchlist</code> to add
        accounts you want to monitor.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-card/60 p-4 flex items-center gap-3">
          <div className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-black/30 text-muted-foreground">
            {r.platform}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">@{r.handle}</div>
            {r.label && <div className="text-xs text-muted-foreground truncate">{r.label}</div>}
          </div>
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            added {new Date(r.created_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocsTab() {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-6 space-y-3">
      <h3 className="font-medium">API Documentation</h3>
      <p className="text-sm text-muted-foreground">
        Full reference with every endpoint, credit cost, code snippets, and error codes lives at:
      </p>
      <Link
        href="/docs"
        className="inline-block rounded-md bg-gradient-ig text-white px-4 py-2 text-sm font-medium hover:brightness-110 transition"
      >
        Open developer docs →
      </Link>
      <div className="text-xs text-muted-foreground pt-2">
        Auth header is <code className="bg-black/30 px-1 rounded">x-api-key</code>. All endpoints
        return JSON with an <code className="bg-black/30 px-1 rounded">ok</code> flag. See docs for
        error-code reference.
      </div>
    </div>
  );
}
