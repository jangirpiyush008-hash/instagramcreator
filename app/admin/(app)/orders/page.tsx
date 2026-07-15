import type { Metadata } from "next";
import { supabaseService } from "@/core/database/supabase";
import { OrderStatusActions } from "@/web/components/admin/OrderStatusActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Growth orders — Admin",
  robots: { index: false, follow: false, nocache: true },
};

// SMM growth-service orders list. Shows every order Reg'd in
// service_orders — email, item summary, amount, status, tx hash.
// Filter by status via ?status=paid|awaiting_payment|failed|... etc.

const STATUS_OPTS = [
  { id: "", label: "All" },
  { id: "awaiting_payment", label: "Awaiting payment" },
  { id: "verifying", label: "Verifying" },
  { id: "paid", label: "Paid" },
  { id: "fulfilling", label: "Fulfilling" },
  { id: "delivered", label: "Delivered" },
  { id: "failed", label: "Failed" },
  { id: "refunded", label: "Refunded" },
];

interface OrderItem {
  serviceId: string;
  name: string;
  qty: number;
  targetUrl: string;
  priceUsd: number;
}

interface OrderRow {
  id: string;
  order_ref: string;
  email: string;
  items: OrderItem[];
  total_usd: number;
  total_usdt: number;
  status: string;
  wallet_address: string;
  network: string;
  token: string;
  tx_hash: string | null;
  tx_verified_at: string | null;
  amount_received_usdt: number | null;
  from_address: string | null;
  created_at: string;
}

async function loadOrders(status: string): Promise<OrderRow[]> {
  const supa = supabaseService();
  let query = supa
    .from("service_orders")
    .select(
      "id, order_ref, email, items, total_usd, total_usdt, status, wallet_address, network, token, tx_hash, tx_verified_at, amount_received_usdt, from_address, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    console.error("[admin/orders] load failed:", error);
    return [];
  }
  return (data ?? []) as OrderRow[];
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "" } = await searchParams;
  const rows = await loadOrders(status).catch(() => []);
  const pending = rows.filter((r) => r.status === "awaiting_payment" || r.status === "verifying").length;

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Growth orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          USDT (BEP20) orders from the /services vertical. Payments are
          verified on-chain via BscScan — this page shows the current
          state of each one.
        </p>
        {pending > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
            <b>{pending}</b> order{pending === 1 ? "" : "s"} awaiting
            payment or in-flight verification.
          </div>
        )}
      </header>

      {/* Status filter */}
      <form className="flex gap-2 mb-4 flex-wrap" action="/admin/orders" method="get">
        {STATUS_OPTS.map((o) => (
          <button
            key={o.id}
            type="submit"
            name="status"
            value={o.id}
            className={
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors " +
              (status === o.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80")
            }
          >
            {o.label}
          </button>
        ))}
      </form>

      <div className="text-xs text-muted-foreground mb-3">
        {rows.length}{rows.length === 100 ? "+" : ""} order{rows.length === 1 ? "" : "s"}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="text-center py-16 text-sm text-muted-foreground">
            {status ? `No orders with status "${status}".` : "No orders yet."}
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-mono font-semibold text-sm">{r.order_ref}</div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <a href={`mailto:${r.email}`} className="underline">{r.email}</a>
                  {" · "}
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold tabular-nums">${r.total_usd.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {r.total_usdt.toFixed(2)} {r.token} · {r.network.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="rounded-lg bg-background/40 border border-border/40 p-3 text-xs space-y-1.5 mb-3">
              {r.items.map((it, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">{it.name}</div>
                    <div className="text-muted-foreground break-all">→ {it.targetUrl}</div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div>{it.qty.toLocaleString()} units</div>
                    <div className="text-muted-foreground">${it.priceUsd.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
              <Meta label="Tx hash" value={r.tx_hash ? shortHash(r.tx_hash) : "—"} link={r.tx_hash ? `https://bscscan.com/tx/${r.tx_hash}` : undefined} />
              <Meta label="From" value={r.from_address ? shortHash(r.from_address) : "—"} link={r.from_address ? `https://bscscan.com/address/${r.from_address}` : undefined} />
              <Meta label="Verified" value={r.tx_verified_at ? new Date(r.tx_verified_at).toLocaleTimeString() : "—"} />
              <Meta label="Received" value={r.amount_received_usdt != null ? `${r.amount_received_usdt.toFixed(2)} USDT` : "—"} />
            </div>

            {/* Actions */}
            <div className="mt-3 pt-3 border-t border-border/40">
              <OrderStatusActions orderRef={r.order_ref} status={r.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    awaiting_payment: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    verifying: "bg-blue-500/10 text-blue-500",
    paid: "bg-emerald-500/10 text-emerald-500",
    fulfilling: "bg-primary/10 text-primary",
    delivered: "bg-emerald-500/10 text-emerald-500",
    failed: "bg-destructive/10 text-destructive",
    refunded: "bg-muted text-muted-foreground",
  };
  return (
    <span className={"px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold " + (map[status] ?? "bg-muted text-muted-foreground")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Meta({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono truncate">
        {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">{value}</a> : value}
      </div>
    </div>
  );
}

function shortHash(h: string): string {
  return h.slice(0, 6) + "…" + h.slice(-4);
}
