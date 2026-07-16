"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/web/lib/cn";

// Minimal action bar for an order row. Two buttons for now:
//   - Mark as fulfilled → sets status to 'delivered' (use when you've
//     manually processed the SMM order at the supplier panel)
//   - Mark as failed → sets status to 'failed' (use for bad data /
//     unfulfillable orders — customer will need a refund out-of-band)
//
// Uses /api/admin/orders/[ref]/status. Kept dumb — no confirm dialog
// on purpose; every action is reversible by clicking the other button.

export function OrderStatusActions({
  orderRef,
  status,
}: {
  orderRef: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const setStatus = async (next: string) => {
    setBusy(next);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderRef}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!body.ok) setMsg(body.error ?? "Failed");
      else router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  // Which transitions make sense from the current state.
  const canManualPay = status === "awaiting_payment" || status === "verifying" || status === "failed";
  const canFulfill = status === "paid" || status === "fulfilling";
  const canFail = status !== "delivered" && status !== "refunded";

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      {canManualPay && (
        <button
          type="button"
          onClick={() => {
            if (!confirm("Manually mark this order as PAID? Use only when you've verified the customer's payment out-of-band (e.g. via Telegram screenshot + Binance app).")) return;
            setStatus("paid");
          }}
          disabled={!!busy}
          className={cn(
            "px-3 py-1.5 rounded-md font-medium transition-all",
            busy === "paid"
              ? "bg-muted text-muted-foreground cursor-wait"
              : "bg-blue-600 text-white hover:brightness-110",
          )}
        >
          {busy === "paid" ? "Marking…" : "Mark paid (manual)"}
        </button>
      )}
      {canFulfill && (
        <button
          type="button"
          onClick={() => setStatus("delivered")}
          disabled={!!busy}
          className={cn(
            "px-3 py-1.5 rounded-md font-medium transition-all",
            busy === "delivered"
              ? "bg-muted text-muted-foreground cursor-wait"
              : "bg-emerald-500 text-white hover:brightness-110",
          )}
        >
          {busy === "delivered" ? "Marking…" : "Mark delivered"}
        </button>
      )}
      {canFail && (
        <button
          type="button"
          onClick={() => setStatus("failed")}
          disabled={!!busy}
          className={cn(
            "px-3 py-1.5 rounded-md font-medium border border-destructive/40 text-destructive transition-colors hover:bg-destructive/5",
            busy === "failed" && "opacity-50 cursor-wait",
          )}
        >
          {busy === "failed" ? "Marking…" : "Mark failed"}
        </button>
      )}
      {status === "delivered" && (
        <span className="text-muted-foreground italic">Delivered — no further actions.</span>
      )}
      {msg && <span className="text-destructive">{msg}</span>}
    </div>
  );
}
