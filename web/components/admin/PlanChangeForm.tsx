"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/web/lib/cn";

// Activate / change / cancel a consumer subscription. Bypasses
// Razorpay (this is an owner comp — the sub row is stamped with
// provider='admin' so it's distinguishable from real payments).

interface Props {
  userId: string;
  currentPlan: string | null;
}

const PLANS = [
  { id: "free", label: "Free (cancel active)" },
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "scale", label: "Scale" },
];

export function PlanChangeForm({ userId, currentPlan }: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState(currentPlan ?? "starter");
  const [months, setMonths] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan,
          months: parseInt(months || "1", 10),
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setMsg({ kind: "err", text: body.error ?? "Change failed" });
      } else {
        setMsg({
          kind: "ok",
          text:
            plan === "free"
              ? "Cancelled active subscription"
              : `Activated ${plan} for ${body.months} month(s)`,
        });
        router.refresh();
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-neutral-500">
        Current: <b className="text-neutral-900">{currentPlan ?? "Free / none"}</b>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Plan</div>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus-visible:border-primary/60"
          >
            {PLANS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className={cn("block", plan === "free" && "opacity-50 pointer-events-none")}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Months</div>
          <input
            type="text"
            inputMode="numeric"
            value={months}
            onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ""))}
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm tabular-nums outline-none focus-visible:border-primary/60"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className={cn(
          "w-full h-10 rounded-lg text-sm font-semibold transition-all",
          busy
            ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
            : "bg-neutral-900 text-white hover:bg-neutral-800",
        )}
      >
        {busy ? "Applying…" : plan === "free" ? "Cancel subscription" : `Activate ${plan}`}
      </button>
      {msg && (
        <div className={cn("text-xs", msg.kind === "ok" ? "text-emerald-600" : "text-red-600")}>
          {msg.text}
        </div>
      )}
      <div className="text-[11px] text-neutral-500 leading-relaxed pt-1">
        Comp / admin-activated subs bypass Razorpay (marked{" "}
        <code className="font-mono text-[10px] px-1 py-0.5 rounded bg-neutral-100">provider=admin</code>).
        Choose &quot;Free&quot; to cancel a real Razorpay subscription — that stops future auto-renewals in Supabase; issue any refund below.
      </div>
    </div>
  );
}
