"use client";

import { useState } from "react";
import { cn } from "@/web/lib/cn";

// Live provider health table. State is server-rendered, but the
// "Reset breaker" action is client-side (POST to /api/admin/providers/health)
// with an optimistic UI + page refresh.
//
// A refresh button at the top forces the page to re-server-render so
// operators can watch health tick without editing the URL.

export interface ProviderRow {
  name: string;
  state: "closed" | "half_open" | "open";
  consecutiveFails: number;
  totalSuccesses: number;
  totalFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  openedAt: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

const STATE_LABEL: Record<ProviderRow["state"], { text: string; tone: string }> = {
  closed: { text: "Healthy", tone: "bg-emerald-100 text-emerald-700" },
  half_open: { text: "Testing", tone: "bg-amber-100 text-amber-800" },
  open: { text: "Broken", tone: "bg-red-100 text-red-700" },
};

export function ProviderHealthTable({ providers }: { providers: ProviderRow[] }) {
  const [resetting, setResetting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const doReset = async (provider: string) => {
    setResetting(provider);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/providers/health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (body.ok) {
        setMessage(`Reset ${provider}. Refresh to see updated state.`);
        // Soft-refresh — router.refresh() would be cleaner but this
        // component is small enough that a full nav is fine.
        setTimeout(() => window.location.reload(), 800);
      } else {
        setMessage(`Reset failed: ${body.error ?? "unknown"}`);
      }
    } catch (e) {
      setMessage(`Network error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">
          Priority order (top = tried first). Circuit breaker: 3 fails → 10 min open.
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 hover:bg-neutral-50 transition-colors font-medium"
        >
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
          {message}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2">Provider</th>
              <th className="text-center px-3 py-2">State</th>
              <th className="text-right px-3 py-2">Success</th>
              <th className="text-right px-3 py-2">Fail</th>
              <th className="text-right px-3 py-2">P50 / P95</th>
              <th className="text-left px-3 py-2">Last activity</th>
              <th className="text-right px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {providers.map((p) => {
              const s = STATE_LABEL[p.state];
              const successRate =
                p.totalSuccesses + p.totalFailures > 0
                  ? (p.totalSuccesses / (p.totalSuccesses + p.totalFailures)) * 100
                  : null;
              const lastActivity = p.lastSuccessAt ?? p.lastFailureAt;
              return (
                <tr key={p.name} className="hover:bg-neutral-50">
                  <td className="px-3 py-2 font-mono font-semibold">{p.name}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold", s.tone)}>
                      {s.text}
                    </span>
                    {p.state === "open" && p.openedAt && (
                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        opened {formatRelative(p.openedAt)}
                      </div>
                    )}
                    {p.consecutiveFails > 0 && p.state !== "open" && (
                      <div className="text-[10px] text-amber-700 mt-0.5">
                        {p.consecutiveFails} recent fail{p.consecutiveFails === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {p.totalSuccesses.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-700">
                    {p.totalFailures.toLocaleString()}
                    {successRate !== null && (
                      <div className="text-[10px] text-neutral-500">
                        {successRate.toFixed(1)}% ok
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-600">
                    {p.p50LatencyMs !== null ? `${p.p50LatencyMs}ms` : "—"}
                    <span className="text-neutral-400"> / </span>
                    {p.p95LatencyMs !== null ? `${p.p95LatencyMs}ms` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">
                    {lastActivity ? formatRelative(lastActivity) : "—"}
                    {p.lastError && p.state !== "closed" && (
                      <div
                        className="text-[10px] text-red-600 truncate max-w-[220px]"
                        title={p.lastError}
                      >
                        {p.lastError}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.state === "open" ? (
                      <button
                        type="button"
                        onClick={() => doReset(p.name)}
                        disabled={resetting === p.name}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-md font-semibold transition-colors",
                          resetting === p.name
                            ? "bg-neutral-100 text-neutral-400 cursor-wait"
                            : "bg-neutral-900 text-white hover:bg-neutral-800",
                        )}
                      >
                        {resetting === p.name ? "Resetting…" : "Reset breaker"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatRelative(ms: number): string {
  const delta = Date.now() - ms;
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
