"use client";

import { useState } from "react";
import { cn } from "@/web/lib/cn";

// Parses a CSV/TSV (or spreadsheet copy-paste) into rows for
// /api/admin/services/upload. Owner's format (from the shared sheet):
//
//   Service | Price/quantity | New Price INR | Quantity | Free Trial Quota Quantity
//
// We accept variations: case-insensitive header match, tolerate extra
// columns, allow either commas or tabs as separators.

interface DiffRow {
  matchedServiceId: string | null;
  matchedName: string | null;
  incoming: Record<string, unknown>;
  changes?: Record<string, { from: unknown; to: unknown }>;
  status: "will_apply" | "unmatched" | "unchanged";
}

interface PreviewResponse {
  ok: boolean;
  error?: string;
  preview: boolean;
  counts?: { will_apply: number; unmatched: number; unchanged: number };
  diffs?: DiffRow[];
}

interface ApplyResponse {
  ok: boolean;
  error?: string;
  applied: number;
  counts: { will_apply: number; unmatched: number; unchanged: number };
}

const HEADER_ALIASES: Record<string, string> = {
  service: "service",
  "price/quantity": "price_per_1000_inr",
  price_per_1000_inr: "price_per_1000_inr",
  supplier: "price_per_1000_inr",
  "new price inr": "new_price_inr",
  new_price_inr: "new_price_inr",
  price: "new_price_inr",
  quantity: "quantity",
  qty: "quantity",
  min: "min_qty",
  min_qty: "min_qty",
  max: "max_qty",
  max_qty: "max_qty",
  step: "step_qty",
  step_qty: "step_qty",
  "free trial quota quantity": "free_trial_qty",
  free_trial_qty: "free_trial_qty",
  trial: "free_trial_qty",
  active: "is_active",
  is_active: "is_active",
};

// Parse text pasted from Google Sheets / Excel / CSV into row objects.
// Google Sheets copy-paste uses tabs; CSV uses commas. We detect on
// the first non-empty line.
function parseSheet(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const first = lines[0]!;
  const sep = first.includes("\t") ? "\t" : ",";

  const headers = first.split(sep).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(sep);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = HEADER_ALIASES[headers[j]!.toLowerCase()] ?? headers[j]!.toLowerCase();
      row[key] = (cells[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

// Coerce raw string cells to numbers where sensible. Prices like
// "426/1000" in the owner's sheet mean "426 INR per 1000 units" — we
// pull just the numerator.
function coerceRows(raw: Record<string, string>[]): Record<string, unknown>[] {
  return raw.map((r) => {
    const out: Record<string, unknown> = { service: r.service ?? "" };
    if (r.price_per_1000_inr) {
      const n = r.price_per_1000_inr.split("/")[0]?.replace(/[^0-9.]/g, "");
      const parsed = Number(n);
      if (Number.isFinite(parsed)) out.price_per_1000_inr = parsed;
    }
    if (r.new_price_inr) {
      const parsed = Number(r.new_price_inr.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed)) out.new_price_inr = parsed;
    }
    if (r.quantity) {
      const parsed = Number(r.quantity.replace(/[^0-9]/g, ""));
      if (Number.isFinite(parsed)) out.quantity = parsed;
    }
    if (r.min_qty) {
      const parsed = Number(r.min_qty.replace(/[^0-9]/g, ""));
      if (Number.isFinite(parsed)) out.min_qty = parsed;
    }
    if (r.max_qty) {
      const parsed = Number(r.max_qty.replace(/[^0-9]/g, ""));
      if (Number.isFinite(parsed)) out.max_qty = parsed;
    }
    if (r.step_qty) {
      const parsed = Number(r.step_qty.replace(/[^0-9]/g, ""));
      if (Number.isFinite(parsed)) out.step_qty = parsed;
    }
    if (r.free_trial_qty) {
      const parsed = Number(r.free_trial_qty.replace(/[^0-9]/g, ""));
      if (Number.isFinite(parsed)) out.free_trial_qty = parsed;
    }
    if (r.is_active) {
      const s = r.is_active.toLowerCase();
      out.is_active = s === "true" || s === "yes" || s === "1" || s === "y";
    }
    return out;
  });
}

export function ServicesCatalogUpload() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [applied, setApplied] = useState<ApplyResponse | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "apply">(null);
  const [err, setErr] = useState<string | null>(null);

  const doPreview = async () => {
    setErr(null);
    setApplied(null);
    setBusy("preview");
    try {
      const raw = parseSheet(text);
      if (raw.length === 0) {
        setErr("Couldn't parse. Include the header row (Service, Price/quantity, New Price INR, Quantity, Free Trial Quota Quantity) then data rows.");
        return;
      }
      const rows = coerceRows(raw);
      const res = await fetch("/api/admin/services/upload?preview=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = (await res.json()) as PreviewResponse;
      if (!body.ok) setErr(body.error ?? "Preview failed");
      else setPreview(body);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  const doApply = async () => {
    setErr(null);
    setBusy("apply");
    try {
      const raw = parseSheet(text);
      const rows = coerceRows(raw);
      const res = await fetch("/api/admin/services/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = (await res.json()) as ApplyResponse;
      if (!body.ok) setErr(body.error ?? "Apply failed");
      else {
        setApplied(body);
        setPreview(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-neutral-600 leading-relaxed">
        Paste from Google Sheets or Excel. Expected columns:{" "}
        <code className="px-1 py-0.5 rounded bg-neutral-100">Service</code>{" "}
        <code className="px-1 py-0.5 rounded bg-neutral-100">Price/quantity</code>{" "}
        <code className="px-1 py-0.5 rounded bg-neutral-100">New Price INR</code>{" "}
        <code className="px-1 py-0.5 rounded bg-neutral-100">Quantity</code>{" "}
        <code className="px-1 py-0.5 rounded bg-neutral-100">Free Trial Quota Quantity</code>.
        Service name matches on exact text (case-insensitive).
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder="Service\tPrice/quantity\tNew Price INR\tQuantity\tFree Trial Quota Quantity\n..."
        className="w-full font-mono text-xs rounded-lg border border-neutral-200 bg-neutral-50 p-3 outline-none focus-visible:border-primary/60"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={doPreview}
          disabled={!text.trim() || busy !== null}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-semibold transition-colors",
            !text.trim() || busy !== null
              ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
              : "bg-neutral-900 text-white hover:bg-neutral-800",
          )}
        >
          {busy === "preview" ? "Parsing…" : "Preview changes"}
        </button>
        {preview && preview.counts && preview.counts.will_apply > 0 && (
          <button
            type="button"
            onClick={doApply}
            disabled={busy !== null}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-semibold transition-colors",
              busy !== null
                ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:brightness-110",
            )}
          >
            {busy === "apply" ? "Applying…" : `Apply ${preview.counts.will_apply} change${preview.counts.will_apply === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
          {err}
        </div>
      )}

      {applied && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
          ✅ Applied <b>{applied.applied}</b> change{applied.applied === 1 ? "" : "s"}.
          {applied.counts.unmatched > 0 && (
            <> {applied.counts.unmatched} unmatched row(s) skipped.</>
          )}
        </div>
      )}

      {preview && preview.diffs && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <div className="mb-2 text-neutral-700">
            <b>{preview.counts?.will_apply ?? 0}</b> will change ·{" "}
            <b>{preview.counts?.unchanged ?? 0}</b> unchanged ·{" "}
            <b className="text-red-600">{preview.counts?.unmatched ?? 0}</b> unmatched
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {preview.diffs.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "rounded p-2 border font-mono text-[11px]",
                  d.status === "will_apply" && "border-emerald-300 bg-white",
                  d.status === "unchanged" && "border-neutral-200 bg-white text-neutral-500",
                  d.status === "unmatched" && "border-red-300 bg-red-50 text-red-800",
                )}
              >
                {d.status === "unmatched" ? (
                  <>
                    ✗ <b>{String(d.incoming.service ?? "")}</b> — no matching service in catalog
                  </>
                ) : (
                  <>
                    {d.status === "will_apply" ? "→ " : "= "}
                    <b>{d.matchedName}</b>
                    {d.changes && (
                      <div className="pl-4">
                        {Object.entries(d.changes).map(([k, v]) => (
                          <div key={k}>
                            {k}: <span className="text-neutral-500">{String(v.from)}</span>{" → "}
                            <span className="text-emerald-700 font-semibold">{String(v.to)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
