"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/web/lib/cn";

// Initiates a REAL Razorpay refund via POST /api/admin/refund.
// Takes a payment_id (pay_XXX from Razorpay dashboard, wallet_lots
// razorpay_payment_id column, or the Payment History section on the
// user detail page) and optional amount + note. Empty amount = full.
//
// Pre-fills from ?payment_id=pay_XXX + ?amount_inr=NNN in the URL
// so the "Refund this" link on Payment History rows can pass the
// payment through. Also auto-scrolls into view when a prefill happens.
//
// Because refunds are irreversible we show a confirm banner before
// the button becomes clickable.

export function RefundForm() {
  const search = useSearchParams();
  const [paymentId, setPaymentId] = useState("");
  const [amountInr, setAmountInr] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: "ok"; refundId?: string; amount?: number; status?: string }
    | { kind: "err"; text: string }
    | null
  >(null);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = { payment_id: paymentId.trim() };
      if (amountInr.trim()) body.amount_paise = Math.floor(parseFloat(amountInr) * 100);
      if (note.trim()) body.notes = note.trim();
      const res = await fetch("/api/admin/refund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await res.json();
      if (!b.ok) {
        setResult({ kind: "err", text: b.error ?? "Refund failed" });
      } else {
        setResult({ kind: "ok", refundId: b.refund_id, amount: b.amount, status: b.status });
        // Reset form (but keep the paymentId in case admin wants to
        // do a second partial refund or paste it elsewhere).
        setAmountInr("");
        setNote("");
        setConfirmed(false);
      }
    } catch (e) {
      setResult({ kind: "err", text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusy(false);
    }
  };

  // Pre-fill from URL query params (set by the Payment History rows)
  // and scroll into view. Only runs when the values actually change so
  // manual edits from the user aren't overwritten on every re-render.
  useEffect(() => {
    const pid = search.get("payment_id");
    const amt = search.get("amount_inr");
    if (pid && /^pay_[A-Za-z0-9]{8,}$/.test(pid)) {
      setPaymentId(pid);
      if (amt) setAmountInr(amt);
      // Delay slightly so the section is definitely rendered.
      setTimeout(() => {
        document.getElementById("refund-form-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.get("payment_id"), search.get("amount_inr")]);

  const canSubmit =
    /^pay_[A-Za-z0-9]{8,}$/.test(paymentId.trim()) &&
    confirmed &&
    !busy;

  return (
    <div id="refund-form-section" className="space-y-3">
      <label className="block">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          Razorpay payment ID
        </div>
        <input
          type="text"
          value={paymentId}
          onChange={(e) => { setPaymentId(e.target.value); setConfirmed(false); }}
          placeholder="pay_XXXXXXXX"
          className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-mono outline-none focus-visible:border-primary/60"
        />
        <div className="text-[11px] text-neutral-500 mt-1">
          From Razorpay dashboard or the user&apos;s wallet history
          (source column shows the payment ID for topups).
        </div>
      </label>

      <label className="block">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          Amount (INR) — blank = full refund
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={amountInr}
          onChange={(e) => { setAmountInr(e.target.value.replace(/[^0-9.]/g, "")); setConfirmed(false); }}
          placeholder="500"
          className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm tabular-nums outline-none focus-visible:border-primary/60"
        />
      </label>

      <label className="block">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          Note (attached to Razorpay refund)
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Duplicate charge / customer request / etc."
          className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus-visible:border-primary/60"
        />
      </label>

      <label className="flex items-start gap-2 text-xs text-neutral-700 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 accent-red-600"
        />
        <span>
          I understand this is irreversible and will move money back to
          the customer&apos;s bank/card via Razorpay.
        </span>
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={cn(
          "w-full h-10 rounded-lg text-sm font-semibold transition-all",
          !canSubmit
            ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
            : "bg-red-600 text-white hover:bg-red-700",
        )}
      >
        {busy ? "Initiating…" : "Refund via Razorpay"}
      </button>

      {result && result.kind === "ok" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-700">
          ✅ Refund initiated. Refund ID:{" "}
          <code className="font-mono">{result.refundId}</code> · Status:{" "}
          <b>{result.status}</b>
          {result.amount != null && <> · Amount: ₹{(result.amount / 100).toFixed(2)}</>}
          <div className="mt-1 text-[11px]">
            Money typically arrives at the customer&apos;s bank in 5–7 business days.
          </div>
        </div>
      )}
      {result && result.kind === "err" && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700">
          ❌ {result.text}
        </div>
      )}
    </div>
  );
}
