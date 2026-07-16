import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Order history — DecodeCreator",
  robots: { index: false, follow: false },
};

// Order history for a signed-in user. We match by email so guest
// orders placed BEFORE the user signed up are still discoverable
// once they log in with that email. Email match is case-insensitive
// (service_orders.email is lowercased at insert time).

interface OrderItem {
  serviceId?: string;
  name?: string;
  qty?: number;
  targetUrl?: string;
  priceUsd?: number;
}

interface OrderRow {
  order_ref: string;
  status: string;
  items: OrderItem[] | null;
  total_usd: number;
  total_usdt: number;
  amount_received_usdt: number | null;
  tx_hash: string | null;
  network: string | null;
  created_at: string;
  tx_verified_at: string | null;
}

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  awaiting_payment: { text: "Awaiting payment", tone: "bg-neutral-100 text-neutral-700" },
  verifying: { text: "Verifying", tone: "bg-blue-100 text-blue-700" },
  pending_manual: { text: "Processing (manual)", tone: "bg-amber-100 text-amber-800" },
  paid: { text: "Paid — queued", tone: "bg-emerald-100 text-emerald-700" },
  fulfilling: { text: "Delivering", tone: "bg-indigo-100 text-indigo-700" },
  delivered: { text: "Delivered ✓", tone: "bg-emerald-100 text-emerald-700" },
  failed: { text: "Failed", tone: "bg-red-100 text-red-700" },
  refunded: { text: "Refunded", tone: "bg-neutral-200 text-neutral-700" },
};

export default async function AccountOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/?auth=signin&next=/account/orders");
  const email = (user.email ?? "").toLowerCase();

  const supa = supabaseService();
  const { data, error } = await supa
    .from("service_orders")
    .select(
      "order_ref, status, items, total_usd, total_usdt, amount_received_usdt, tx_hash, network, created_at, tx_verified_at",
    )
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(200);

  const orders = (data ?? []) as OrderRow[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-5xl py-8 lg:py-10">
        <nav className="text-xs text-muted-foreground mb-3">
          <Link href="/account" className="hover:text-foreground">← My account</Link>
        </nav>
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">
              Growth services
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Your order history
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              All growth-service orders placed with{" "}
              <b className="text-foreground">{email}</b>{" "}
              — including guest orders from before you signed in.
            </p>
          </div>
          <Link
            href="/services"
            className="text-sm px-4 py-2 rounded-lg bg-gradient-ig text-white font-semibold hover:brightness-110 transition"
          >
            + New order
          </Link>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Couldn&apos;t load orders: {error.message}
          </div>
        )}

        {!error && orders.length === 0 && (
          <div className="rounded-xl border border-border bg-card/60 p-10 text-center">
            <div className="text-4xl mb-3">🗒️</div>
            <h2 className="text-lg font-semibold">No orders yet</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              When you place a growth-services order and pay with USDT, it
              shows up here — including all guest orders placed with this
              email.
            </p>
            <Link
              href="/services"
              className="inline-flex items-center gap-2 mt-6 rounded-full bg-gradient-ig text-white px-6 py-3 text-sm font-semibold hover:brightness-110 transition"
            >
              Browse services →
            </Link>
          </div>
        )}

        {!error && orders.length > 0 && (
          <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Items</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => {
                  const s = STATUS_LABEL[o.status] ?? { text: o.status, tone: "bg-neutral-100 text-neutral-700" };
                  const itemsList = Array.isArray(o.items) ? o.items : [];
                  const summary = itemsList
                    .map((it) => `${it.name ?? it.serviceId ?? "?"}${it.qty ? ` × ${it.qty.toLocaleString()}` : ""}`)
                    .join(" · ");
                  const isActive =
                    o.status === "awaiting_payment" || o.status === "pending_manual" || o.status === "verifying";
                  return (
                    <tr key={o.order_ref} className="hover:bg-muted/30">
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono text-xs font-semibold">{o.order_ref}</div>
                        {o.tx_hash && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 break-all max-w-[180px]">
                            {o.tx_hash.length > 20 ? `${o.tx_hash.slice(0, 8)}…${o.tx_hash.slice(-6)}` : o.tx_hash}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-xs leading-relaxed">
                          {summary || <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right tabular-nums">
                        <div className="font-semibold">${Number(o.total_usd).toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {Number(o.total_usdt).toFixed(2)} USDT
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold ${s.tone}`}>
                          {s.text}
                        </span>
                        {isActive && (
                          <div className="mt-1.5">
                            <Link
                              href={`/services/checkout?ref=${o.order_ref}`}
                              className="text-[10px] text-primary hover:underline font-medium"
                            >
                              Open →
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right text-xs text-muted-foreground tabular-nums">
                        {formatDate(o.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}
