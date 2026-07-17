import type { Metadata } from "next";
import { snapshotHealth } from "@/core/data/provider-health";
import { ProviderHealthTable } from "@/web/components/admin/ProviderHealthTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Providers — Admin",
  robots: { index: false, follow: false, nocache: true },
};

// Live view of the data-provider chain. Shows every provider that has
// received a request during this Node process's lifetime, plus its
// circuit-breaker state and error/latency stats. When a provider goes
// dark (breaker OPEN) the row surfaces it here so you can top up its
// balance and hit "Reset breaker" to close it manually.
//
// State is process-local; a Railway redeploy resets it. That's the
// intended lifecycle — health data is a snapshot, not a source of truth.

export default async function AdminProvidersPage() {
  const snapshot = snapshotHealth();
  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Data providers</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Live chain state. Providers are tried in priority order; when one
          fails 3 times in a row, the breaker opens for 10 minutes and the
          chain skips it. Reset manually here after topping up a balance.
        </p>
      </header>

      {snapshot.providers.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No provider activity recorded yet in this process.
          <br />
          Run a scan and refresh this page.
        </div>
      ) : (
        <ProviderHealthTable
          providers={snapshot.providers.map((p) => ({
            name: p.name,
            state: p.state,
            consecutiveFails: p.consecutiveFails,
            totalSuccesses: p.totalSuccesses,
            totalFailures: p.totalFailures,
            lastSuccessAt: p.lastSuccessAt,
            lastFailureAt: p.lastFailureAt,
            lastError: p.lastError,
            openedAt: p.openedAt,
            p50LatencyMs: p.p50LatencyMs,
            p95LatencyMs: p.p95LatencyMs,
          }))}
        />
      )}

      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Recent attempts (last {snapshot.recent.length})
        </h2>
        {snapshot.recent.length === 0 ? (
          <div className="text-xs text-neutral-500">No attempts yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-2 py-2">When</th>
                  <th className="text-left px-2 py-2">Provider</th>
                  <th className="text-left px-2 py-2">Method</th>
                  <th className="text-left px-2 py-2">Platform</th>
                  <th className="text-right px-2 py-2">Latency</th>
                  <th className="text-left px-2 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {snapshot.recent
                  .slice()
                  .reverse()
                  .slice(0, 50)
                  .map((a, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 text-neutral-500 tabular-nums">
                        {new Date(a.at).toLocaleTimeString()}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{a.provider}</td>
                      <td className="px-2 py-1.5 font-mono text-neutral-600">{a.method}</td>
                      <td className="px-2 py-1.5 text-neutral-600">{a.platform}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {a.latencyMs}ms
                      </td>
                      <td className="px-2 py-1.5">
                        {a.ok ? (
                          <span className="text-emerald-600">✓ ok</span>
                        ) : (
                          <span className="text-red-600" title={a.error}>
                            ✗ {a.error?.slice(0, 40) ?? "error"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
