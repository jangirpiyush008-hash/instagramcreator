import type { Metadata } from "next";
import Link from "next/link";
import { supabaseService } from "@/core/database/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin overview",
  robots: { index: false, follow: false, nocache: true },
};

// Overview KPI cards. All queries are COUNT-only so this page stays
// fast even at 10k+ rows. Numbers refresh on every visit — no cache.

async function loadKpis() {
  const supa = supabaseService();
  const [
    { count: users },
    { count: activeSubs },
    { count: apiKeys },
    { count: pendingOrders },
    { count: paidOrders },
    { data: walletSum },
  ] = await Promise.all([
    supa.from("profiles").select("id", { count: "exact", head: true }),
    supa
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supa
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .is("revoked_at", null),
    supa
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_payment"),
    supa
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["paid", "fulfilling", "delivered"]),
    // Sum of unspent wallet credits — approximation via SQL is best but
    // we don't have a view yet. Fetch aggregated sum via rpc-less
    // approach (client-side sum on limit 1000; fine for now).
    supa
      .from("wallet_lots")
      .select("credits_remaining")
      .gt("credits_remaining", 0)
      .limit(1000),
  ]);
  const walletTotal = (walletSum ?? []).reduce(
    (acc, r) => acc + Number(r.credits_remaining ?? 0),
    0,
  );
  return {
    users: users ?? 0,
    activeSubs: activeSubs ?? 0,
    apiKeys: apiKeys ?? 0,
    pendingOrders: pendingOrders ?? 0,
    paidOrders: paidOrders ?? 0,
    walletTotal,
  };
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string }>;
}) {
  const { seg = "consumers" } = await searchParams;
  const kpi = await loadKpis().catch((e) => {
    console.error("[admin/overview] load failed:", e);
    return null;
  });

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {seg === "consumers"
            ? "Web-app users, subscriptions, and scan usage across the platform."
            : "API developers, active keys, wallet balances, and order flow."}
        </p>
      </header>

      {kpi === null ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Couldn&apos;t load KPIs. Check that Supabase env vars are set and
          all migrations (through 0009) have run.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          <KpiCard label="Total users" value={kpi.users.toLocaleString()} sub="signed-up accounts" />
          <KpiCard
            label="Active subscriptions"
            value={kpi.activeSubs.toLocaleString()}
            sub="Consumer + API tiers"
          />
          <KpiCard
            label="Active API keys"
            value={kpi.apiKeys.toLocaleString()}
            sub="not revoked"
          />
          <KpiCard
            label="Wallet credits outstanding"
            value={kpi.walletTotal.toLocaleString()}
            sub="unspent across all users"
          />
          <KpiCard
            label="Growth orders pending"
            value={kpi.pendingOrders.toLocaleString()}
            sub="awaiting USDT payment"
            highlight={kpi.pendingOrders > 0}
          />
          <KpiCard
            label="Growth orders paid"
            value={kpi.paidOrders.toLocaleString()}
            sub="lifetime"
          />
        </div>
      )}

      {/* Quick links */}
      <div className="grid sm:grid-cols-3 gap-3">
        <QuickCard
          href={`/admin/users?seg=${seg}`}
          title={seg === "consumers" ? "Manage users" : "Manage developers"}
          blurb="Full list, tier + credits, per-user detail page."
        />
        <QuickCard
          href="/admin/orders"
          title="Growth orders"
          blurb="Verify payments, mark fulfilled, review failures."
        />
        <QuickCard
          href="/admin/login"
          title="Rotate password"
          blurb="Update ADMIN_PASSWORD env var in Railway to invalidate this session."
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-4 " +
        (highlight
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-card/50")
      }
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function QuickCard({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card/50 p-5 hover:border-primary/50 transition-colors block"
    >
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{blurb}</div>
    </Link>
  );
}
