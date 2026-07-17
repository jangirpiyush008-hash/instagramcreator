import type { Platform } from "../types";

// In-memory provider health + circuit breaker + recent-attempts log.
//
// Deliberately in-memory, not persisted. On Railway we run a single Node
// process per deploy, and if it restarts the breakers reset — that's fine,
// the first request to a still-broken provider will re-open the breaker
// within seconds. Persisting to Supabase would add write traffic to every
// request and buy nothing.
//
// The admin panel reads this via /api/admin/providers/health so we can
// visually confirm which provider is doing the work in production.

export type BreakerState = "closed" | "half_open" | "open";

interface ProviderState {
  state: BreakerState;
  consecutiveFails: number;
  totalSuccesses: number;
  totalFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  openedAt: number | null;
  // Rolling latency samples (last 20) — read-only snapshot for admin panel.
  latencySamples: number[];
}

interface AttemptLog {
  provider: string;
  method: string;
  platform: Platform;
  ok: boolean;
  latencyMs: number;
  error?: string;
  at: number;
}

const FAIL_THRESHOLD = 3;
const OPEN_MS = 10 * 60 * 1000; // 10 minutes
const RECENT_ATTEMPTS_CAP = 200;
const LATENCY_SAMPLES_CAP = 20;

const state = new Map<string, ProviderState>();
const recentAttempts: AttemptLog[] = [];

function ensure(name: string): ProviderState {
  const existing = state.get(name);
  if (existing) return existing;
  const fresh: ProviderState = {
    state: "closed",
    consecutiveFails: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    openedAt: null,
    latencySamples: [],
  };
  state.set(name, fresh);
  return fresh;
}

function pushLatency(s: ProviderState, latencyMs: number): void {
  s.latencySamples.push(latencyMs);
  if (s.latencySamples.length > LATENCY_SAMPLES_CAP) {
    s.latencySamples.shift();
  }
}

function pushAttempt(a: AttemptLog): void {
  recentAttempts.push(a);
  if (recentAttempts.length > RECENT_ATTEMPTS_CAP) {
    recentAttempts.shift();
  }
}

// Called by ChainAdapter before each attempt to decide whether to try
// this provider. Also handles half-open transition: if the breaker has
// been open for longer than OPEN_MS, we allow ONE request through as
// a health check.
export function getProviderHealth(name: string): { state: BreakerState } {
  const s = ensure(name);
  if (s.state === "open" && s.openedAt !== null) {
    if (Date.now() - s.openedAt >= OPEN_MS) {
      // Cooldown elapsed — allow one probe request.
      s.state = "half_open";
    }
  }
  return { state: s.state };
}

export function recordSuccess(
  name: string,
  method: string,
  platform: Platform,
  latencyMs: number,
): void {
  const s = ensure(name);
  s.consecutiveFails = 0;
  s.totalSuccesses += 1;
  s.lastSuccessAt = Date.now();
  s.state = "closed";
  s.openedAt = null;
  pushLatency(s, latencyMs);
  pushAttempt({
    provider: name,
    method,
    platform,
    ok: true,
    latencyMs,
    at: Date.now(),
  });
  // Terse log so we can grep prod: `[chain] served by <provider> in <ms>`.
  console.log(`[chain] served by ${name} — ${method} ${platform} in ${latencyMs}ms`);
}

export function recordFailure(
  name: string,
  method: string,
  platform: Platform,
  latencyMs: number,
  err: unknown,
): void {
  const s = ensure(name);
  s.consecutiveFails += 1;
  s.totalFailures += 1;
  s.lastFailureAt = Date.now();
  s.lastError = err instanceof Error ? err.message : String(err);
  pushLatency(s, latencyMs);
  if (s.consecutiveFails >= FAIL_THRESHOLD) {
    // Trip the breaker.
    s.state = "open";
    s.openedAt = Date.now();
    console.warn(
      `[chain] breaker OPEN for ${name} after ${s.consecutiveFails} consecutive fails — skipping for ${OPEN_MS / 60000}min`,
    );
  } else {
    console.warn(
      `[chain] ${name} failed ${method} (${s.consecutiveFails}/${FAIL_THRESHOLD}):`,
      s.lastError,
    );
  }
  pushAttempt({
    provider: name,
    method,
    platform,
    ok: false,
    latencyMs,
    error: s.lastError,
    at: Date.now(),
  });
}

// Snapshot of everything — for admin panel. Deep-copies arrays so
// downstream mutation can't scramble live state.
export function snapshotHealth(): {
  providers: Array<
    ProviderState & {
      name: string;
      p50LatencyMs: number | null;
      p95LatencyMs: number | null;
    }
  >;
  recent: AttemptLog[];
} {
  const providers = Array.from(state.entries()).map(([name, s]) => {
    const sorted = [...s.latencySamples].sort((a, b) => a - b);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] ?? null : null;
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] ?? null : null;
    return {
      name,
      ...s,
      latencySamples: [...s.latencySamples],
      p50LatencyMs: p50,
      p95LatencyMs: p95,
    };
  });
  return { providers, recent: [...recentAttempts] };
}

// Manual reset — for admin panel button "Reset breakers" after topping
// up a provider's balance. Called from POST /api/admin/providers/reset.
export function resetProvider(name: string): boolean {
  const s = state.get(name);
  if (!s) return false;
  s.state = "closed";
  s.consecutiveFails = 0;
  s.openedAt = null;
  console.log(`[chain] breaker manually reset for ${name}`);
  return true;
}
