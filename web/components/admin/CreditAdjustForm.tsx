"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/web/lib/cn";

// Small form to add/subtract wallet credits from a user. Posts to
// /api/admin/users/[id]/credits. On success, refreshes the page so
// the balance + lot list re-fetch.

export function CreditAdjustForm({
  userId,
  currentBalance,
}: {
  userId: string;
  currentBalance: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [op, setOp] = useState<"add" | "sub">("add");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const submit = async () => {
    const n = parseInt(amount, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setMsg({ kind: "err", text: "Enter a positive integer" });
      return;
    }
    const delta = op === "add" ? n : -n;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delta, note: note || undefined }),
      });
      const body = await res.json();
      if (!body.ok) {
        setMsg({ kind: "err", text: body.error ?? "Adjustment failed" });
      } else {
        setMsg({
          kind: "ok",
          text: body.partial
            ? `Partial: applied ${body.applied} of ${Math.abs(delta)} (insufficient balance)`
            : `Applied ${delta > 0 ? "+" : ""}${delta} credits`,
        });
        setAmount("");
        setNote("");
        // Reload the page so the lot list + KPI refresh.
        router.refresh();
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Current balance: <b className="text-foreground tabular-nums">{currentBalance.toLocaleString()}</b> credits
      </div>
      <div className="flex gap-2">
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as "add" | "sub")}
          className="h-10 rounded-lg border border-input bg-background/80 px-2 text-sm outline-none focus-visible:border-primary/60"
        >
          <option value="add">Add</option>
          <option value="sub">Subtract</option>
        </select>
        <input
          type="text"
          inputMode="numeric"
          placeholder="1000"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          className="h-10 flex-1 rounded-lg border border-input bg-background/80 px-3 text-sm tabular-nums outline-none focus-visible:border-primary/60"
        />
      </div>
      <input
        type="text"
        placeholder="Note (visible in wallet history)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={submitting || !amount}
        className={cn(
          "w-full h-10 rounded-lg text-sm font-semibold transition-all",
          submitting || !amount
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-foreground text-background hover:opacity-90",
        )}
      >
        {submitting ? "Applying…" : op === "add" ? "Add credits" : "Subtract credits"}
      </button>
      {msg && (
        <div className={cn("text-xs", msg.kind === "ok" ? "text-emerald-500" : "text-destructive")}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
