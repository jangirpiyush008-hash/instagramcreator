import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { supabaseService } from "@/core/database/supabase";
import { SERVICES } from "@/core/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/services/upload
//
// Accepts JSON body (parsed from a CSV or spreadsheet on the client):
//   { rows: [{ service, price_per_1000_inr?, new_price_inr?,
//              quantity?, free_trial_qty?, retail_rate_usd?,
//              min_qty?, max_qty?, step_qty?, is_active? }] }
//
// The client parses the spreadsheet (which has these columns per the
// owner's format:
//   Service | Price/quantity | New Price INR | Quantity | Free Trial Quota Quantity
// ) and posts the parsed rows as JSON. We match each row to a
// service by NAME (case-insensitive) and upsert into service_overrides.
//
// Two modes controlled by ?preview=1:
//   - preview: compute the diff (matched vs unmatched vs unchanged)
//     and return it — no DB writes. Admin reviews before applying.
//   - apply: write to service_overrides.
//
// Design choice: keep static catalog.ts as the source of truth for
// service SHAPE (id/slug/emoji/platform/etc.); overrides only carry
// numeric fields the admin actually needs to bulk-edit.

interface IncomingRow {
  service?: string;                // service name from the sheet (fuzzy match)
  price_per_1000_inr?: number;     // supplier rate — informational only
  new_price_inr?: number;          // admin's new INR price (per 1000)
  quantity?: number;               // default quantity (used as min_qty)
  free_trial_qty?: number;
  retail_rate_usd?: number;        // if set, wins over new_price_inr conversion
  min_qty?: number;
  max_qty?: number;
  step_qty?: number;
  is_active?: boolean;
}

interface DiffRow {
  matchedServiceId: string | null;
  matchedName: string | null;
  incoming: IncomingRow;
  changes?: Record<string, { from: unknown; to: unknown }>;
  status: "will_apply" | "unmatched" | "unchanged";
}

// Match a row's `service` string to a catalog Service by name (case-
// insensitive, allowing minor whitespace differences).
function findByName(name: string) {
  const norm = name.trim().toLowerCase().replace(/\s+/g, " ");
  return SERVICES.find((s) => s.name.toLowerCase().replace(/\s+/g, " ") === norm);
}

const INR_PER_USD = 83;

export async function POST(req: Request) {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ ok: false, error: "Admin auth required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const preview = url.searchParams.get("preview") === "1";

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const rows = (raw as { rows?: IncomingRow[] })?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing rows[] in body" }, { status: 400 });
  }

  const supa = supabaseService();

  // Load current overrides so we can diff (and skip no-op writes).
  const { data: existing } = await supa.from("service_overrides").select("*");
  const existingMap = new Map<string, Record<string, unknown>>();
  for (const row of existing ?? []) existingMap.set(row.service_id, row);

  const diffs: DiffRow[] = [];

  for (const row of rows) {
    const name = (row.service ?? "").trim();
    if (!name) {
      diffs.push({ matchedServiceId: null, matchedName: null, incoming: row, status: "unmatched" });
      continue;
    }
    const svc = findByName(name);
    if (!svc) {
      diffs.push({ matchedServiceId: null, matchedName: name, incoming: row, status: "unmatched" });
      continue;
    }

    // Build the desired override state from the row. If new_price_inr
    // is set but retail_rate_usd isn't, derive USD (rounded up to nearest $1).
    const desired: Record<string, unknown> = {};
    if (row.retail_rate_usd != null && Number.isFinite(row.retail_rate_usd)) {
      desired.retail_rate_usd = Math.ceil(Number(row.retail_rate_usd));
    } else if (row.new_price_inr != null && Number.isFinite(row.new_price_inr)) {
      desired.retail_rate_usd = Math.max(1, Math.ceil(Number(row.new_price_inr) / INR_PER_USD));
    }
    if (row.new_price_inr != null && Number.isFinite(row.new_price_inr)) {
      desired.new_price_inr = Math.round(Number(row.new_price_inr));
    }
    if (row.quantity != null && Number.isFinite(row.quantity)) {
      // "Quantity" in the sheet is treated as the min quantity for the picker.
      desired.min_qty = Math.max(1, Math.floor(Number(row.quantity)));
    }
    if (row.min_qty != null) desired.min_qty = Math.max(1, Math.floor(Number(row.min_qty)));
    if (row.max_qty != null) desired.max_qty = Math.max(1, Math.floor(Number(row.max_qty)));
    if (row.step_qty != null) desired.step_qty = Math.max(1, Math.floor(Number(row.step_qty)));
    if (row.free_trial_qty != null) {
      desired.free_trial_quantity = Math.max(0, Math.floor(Number(row.free_trial_qty)));
    }
    if (typeof row.is_active === "boolean") desired.is_active = row.is_active;

    if (Object.keys(desired).length === 0) {
      diffs.push({ matchedServiceId: svc.id, matchedName: svc.name, incoming: row, status: "unchanged" });
      continue;
    }

    // Compute changes vs current state (existing override OR static).
    const current = existingMap.get(svc.id) ?? {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(desired)) {
      const currentVal =
        current[k] ??
        (k === "retail_rate_usd"
          ? svc.retailRateUsd
          : k === "min_qty"
            ? svc.qty.min
            : k === "max_qty"
              ? svc.qty.max
              : k === "step_qty"
                ? svc.qty.step
                : k === "is_active"
                  ? svc.isActive
                  : null);
      if (currentVal !== v) changes[k] = { from: currentVal, to: v };
    }

    if (Object.keys(changes).length === 0) {
      diffs.push({ matchedServiceId: svc.id, matchedName: svc.name, incoming: row, status: "unchanged" });
      continue;
    }

    diffs.push({
      matchedServiceId: svc.id,
      matchedName: svc.name,
      incoming: row,
      changes,
      status: "will_apply",
    });
  }

  const willApply = diffs.filter((d) => d.status === "will_apply");
  const unmatched = diffs.filter((d) => d.status === "unmatched");
  const unchanged = diffs.filter((d) => d.status === "unchanged");

  if (preview) {
    return NextResponse.json({
      ok: true,
      preview: true,
      counts: { will_apply: willApply.length, unmatched: unmatched.length, unchanged: unchanged.length },
      diffs,
    });
  }

  // Apply: upsert every will_apply row.
  const upserts = willApply.map((d) => {
    const patch: Record<string, unknown> = { service_id: d.matchedServiceId, updated_by: "admin_bulk_upload" };
    for (const [k, v] of Object.entries(d.changes ?? {})) patch[k] = v.to;
    return patch;
  });

  if (upserts.length === 0) {
    return NextResponse.json({
      ok: true,
      applied: 0,
      counts: { will_apply: 0, unmatched: unmatched.length, unchanged: unchanged.length },
    });
  }

  const { error } = await supa
    .from("service_overrides")
    .upsert(upserts as never, { onConflict: "service_id" });
  if (error) {
    console.error("[admin/services/upload] upsert failed:", error.code, error.message);
    return NextResponse.json(
      { ok: false, error: `Upsert failed: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    applied: upserts.length,
    counts: { will_apply: upserts.length, unmatched: unmatched.length, unchanged: unchanged.length },
    diffs,
  });
}
