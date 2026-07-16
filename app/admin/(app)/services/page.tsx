import type { Metadata } from "next";
import { supabaseService } from "@/core/database/supabase";
import { getEffectiveCatalog } from "@/core/services/overrides";
import { ServicesCatalogUpload } from "@/web/components/admin/ServicesCatalogUpload";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Growth catalog — Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminServicesPage() {
  const supa = supabaseService();
  const services = await getEffectiveCatalog(supa).catch(() => []);

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Growth catalog</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Bulk-edit prices, quantities, and trial quotas by uploading a
          CSV / spreadsheet. Static catalog stays as the fallback; any
          field you set in overrides wins.
        </p>
      </header>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Bulk upload
        </h2>
        <ServicesCatalogUpload />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Current effective catalog ({services.length} services)
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2">Service</th>
                <th className="text-right px-3 py-2">$/1k</th>
                <th className="text-right px-3 py-2">Supplier ₹/1k</th>
                <th className="text-right px-3 py-2">Min qty</th>
                <th className="text-right px-3 py-2">Max qty</th>
                <th className="text-center px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                      {s.platform} · {s.category}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">${s.retailRateUsd}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-500">₹{s.supplierRateInr}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.qty.min.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.qty.max.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    {s.isActive ? (
                      <span className="text-emerald-500">✓</span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
