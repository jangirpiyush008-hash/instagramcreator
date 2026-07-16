import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICES, type Service } from "./catalog";

// Load all service_overrides rows and merge them onto the static
// catalog. Called from every read path where the price/quantity might
// matter — the catalog page, the checkout re-price, the trial claim.
//
// Non-fatal on DB errors: if overrides can't be loaded (table missing,
// service role misconfigured), we just return the static catalog.
// Better a slightly stale price than a 500 page.

export interface ServiceOverride {
  service_id: string;
  retail_rate_usd: number | null;
  new_price_inr: number | null;
  min_qty: number | null;
  max_qty: number | null;
  step_qty: number | null;
  free_trial_quantity: number | null;
  is_active: boolean | null;
}

export async function loadOverridesMap(
  supa: SupabaseClient,
): Promise<Map<string, ServiceOverride>> {
  try {
    const { data, error } = await supa.from("service_overrides").select("*");
    if (error) {
      // 42P01 = table missing (migration not run yet) — silent.
      if (error.code !== "42P01") console.warn("[overrides] load failed:", error.message);
      return new Map();
    }
    const map = new Map<string, ServiceOverride>();
    for (const row of data ?? []) map.set(row.service_id, row as ServiceOverride);
    return map;
  } catch {
    return new Map();
  }
}

// Apply an override on a single service, returning a new Service object.
// Fields the override didn't set fall back to the static value.
export function applyOverride(svc: Service, ov: ServiceOverride | undefined): Service {
  if (!ov) return svc;
  return {
    ...svc,
    retailRateUsd: ov.retail_rate_usd ?? svc.retailRateUsd,
    qty: {
      min: ov.min_qty ?? svc.qty.min,
      max: ov.max_qty ?? svc.qty.max,
      step: ov.step_qty ?? svc.qty.step,
    },
    isActive: ov.is_active ?? svc.isActive,
  };
}

// One-shot: return the full catalog with overrides applied.
export async function getEffectiveCatalog(supa: SupabaseClient): Promise<Service[]> {
  const overrides = await loadOverridesMap(supa);
  return SERVICES.map((svc) => applyOverride(svc, overrides.get(svc.id)));
}

// Single-service lookup with override applied. Used by checkout/order
// pricing — the ONE place where a stale price would actually cost us
// money.
export async function getEffectiveServiceById(
  supa: SupabaseClient,
  id: string,
): Promise<Service | undefined> {
  const base = SERVICES.find((s) => s.id === id);
  if (!base) return undefined;
  const overrides = await loadOverridesMap(supa);
  return applyOverride(base, overrides.get(id));
}

// Free-trial quantity for a service — the override wins, otherwise 50.
export function freeTrialQuantityFor(svc: Service, ov: ServiceOverride | undefined): number {
  return ov?.free_trial_quantity ?? 50;
}
