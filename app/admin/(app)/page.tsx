import type { Metadata } from "next";
import Link from "next/link";
import { supabaseService } from "@/core/database/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin overview",
  robots: { index: false, follow: false, nocache: true },
};

// Overview KPI cards. Segment-scoped per owner request:
//   Consumers  → Total users + Active subscriptions (that's it — no
//                growth-orders, no api-keys, no wallet noise here)
//   Developers → Total developers + Active API keys + Wallet outstanding
// Growth orders info lives ONLY on /admin/orders now.

async function loadConsumerKpis() {
  const supa = supabaseService();
  const [{ count: users }, { count: activeSubs }] = await Promise.all([
    supa.from("profiles").select("id", { count: "exact", head: true }),
    supa
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);
  return { users: users ?? 0, activeSubs: activeSubs ?? 0 };
}

async function loadDeveloperKpis() {
  const supa = supabaseService();
  // Distinct users with at least one active key = the "developer" count.
  const [{ data: keyOwners }, { count: apiKeys }, { data: walletSum }] = await Promise.all([
    supa.from("api_keys").select("user_id").is("revoked_at", null),
    supa.from("api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null),
    supa
      .from("wallet_lots")
      .select("credits_remaining")
      .gt("credits_remaining", 0)
      .limit(1000),
  ]);
  const developerCount = new Set((keyOwners ?? []).map((k) => k.user_id)).size;
  const walletTotal = (walletSum ?? []).reduce(
    (acc, r) => acc + Number(r.credits_remaining ?? 0),
    0,
  );
  return { developerCount, apiKeys: apiKeys ?? 0, walletTotal };
}

async function loadGrowthKpis() {
  const supa = supabaseService();
  const [
    { count: awaiting },
    { count: paid },
    { count: delivered },
    { count: failed },
    { data: paidRev },
  ] = await Promise.all([
    supa
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["awaiting_payment", "verifying"]),
    supa
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["paid", "fulfilling"]),
    supa
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered"),
    supa
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    supa
      .from("service_orders")
      .select("total_usd")
      .in("status", ["paid", "fulfilling", "delivered"])
      .limit(1000),
  ]);
  const revenueUsd = (paidRev ?? []).reduce((acc, r) => acc + Number(r.total_usd ?? 0), 0);
  return {
    awaiting: awaiting ?? 0,
    paid: paid ?? 0,
    delivered: delivered ?? 0,
    failed: failed ?? 0,
    revenueUsd,
  };
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string }>;
}) {
  const { seg: segRaw = "consumers" } = await searchParams;
  const seg: "consumers" | "developers" | "growth" =
    segRaw === "developers" ? "developers" : segRaw === "growth" ? "growth" : "consumers";

  const [consumer, developer, growth] = await Promise.all([
    seg === "consumers" ? loadConsumerKpis().catch(() => null) : Promise.resolve(null),
    seg === "developers" ? loadDeveloperKpis().catch(() => null) : Promise.resolve(null),
    seg === "growth" ? loadGrowthKpis().catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {seg === "consumers" && "Web-app users and subscriptions."}
          {seg === "developers" && "API developers with active keys and outstanding wallet credits."}
          {seg === "growth" && "Growth-services (SMM vertical) order flow."}
        </p>
      </header>

      {seg === "consumers" && (
        consumer === null ? <ErrorCard /> : (
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-8 max-w-3xl">
            <KpiCard label="Total users" value={consumer.users.toLocaleString()} sub="signed-up accounts" />
            <KpiCard label="Active subscriptions" value={consumer.activeSubs.toLocaleString()} sub="paying consumers" />
          </div>
        )
      )}

      {seg === "developers" && (
        developer === null ? <ErrorCard /> : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            <KpiCard label="Developers" value={developer.developerCount.toLocaleString()} sub="users with active keys" />
            <KpiCard label="Active API keys" value={developer.apiKeys.toLocaleString()} sub="not revoked" />
            <KpiCard label="Wallet credits outstanding" value={developer.walletTotal.toLocaleString()} sub="unspent across all developers" />
          </div>
        )
      )}

      {seg === "growth" && (
        growth === null ? <ErrorCard /> : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            <KpiCard label="Awaiting payment" value={growth.awaiting.toLocaleString()} sub="pending USDT" highlight={growth.awaiting > 0} />
            <KpiCard label="Paid — needs delivery" value={growth.paid.toLocaleString()} sub="verify + fulfill" highlight={growth.paid > 0} />
            <KpiCard label="Delivered" value={growth.delivered.toLocaleString()} sub="lifetime" />
            <KpiCard label="Failed" value={growth.failed.toLocaleString()} sub="lifetime" />
            <KpiCard label="Revenue" value={`$${growth.revenueUsd.toFixed(2)}`} sub="paid orders total (USD)" />
          </div>
        )
      )}

      {/* Quick links — segment-appropriate */}
      <div className="grid sm:grid-cols-2 gap-3 max-w-3xl">
        {seg !== "growth" ? (
          <>
            <QuickCard
              href={`/admin/users?seg=${seg}`}
              title={seg === "consumers" ? "Manage consumers" : "Manage developers"}
              blurb="Full list, tier + credits, per-user detail with actions."
            />
            <QuickCard
              href={`/admin/users/new?seg=${seg}`}
              title="Add a user"
              blurb="Comp a customer, onboard a pilot, or invite by email."
            />
          </>
        ) : (
          <>
            <QuickCard
              href="/admin/orders?seg=growth&status=awaiting_payment"
              title="Awaiting payment"
              blurb="Orders where the customer hasn't submitted a tx hash yet."
            />
            <QuickCard
              href="/admin/orders?seg=growth&status=paid"
              title="Paid — needs delivery"
              blurb="Verify + mark fulfilled once the supplier panel delivers."
            />
          </>
        )}
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
          ? "border-amber-300 bg-amber-50"
          : "border-neutral-200 bg-white")
      }
    >
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1 text-neutral-900">{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

function QuickCard({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-neutral-200 bg-white p-5 hover:border-primary/50 transition-colors block"
    >
      <div className="font-semibold text-sm text-neutral-900">{title}</div>
      <div className="text-xs text-neutral-500 mt-1">{blurb}</div>
    </Link>
  );
}

function ErrorCard() {
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 mb-8">
      Couldn&apos;t load KPIs. Check that Supabase env vars are set and
      all migrations (through 0009) have run.
    </div>
  );
}
