import type { Platform } from "../types";
import type {
  CommenterInfo,
  CommentItem,
  DataAdapter,
  DemographicSplit,
  EarningsEstimate,
  FollowerAudit,
  FollowerLite,
  HashtagStatus,
  LiveCount,
  Post,
  Profile,
  ReachSignals,
  UnfollowerDelta,
  UsernameAvailability,
} from "./adapter";
import {
  DataUnavailableError,
  HandleNotFoundError,
  PrivateAccountError,
  ProviderRateLimitError,
} from "../utils/errors";
import { getProviderHealth, recordFailure, recordSuccess } from "./provider-health";

// ChainAdapter — the resilience layer. Given a priority list of adapters,
// it calls each in order until one succeeds. When an adapter throws a
// non-user-fixable error (network, provider quota, timeout, unknown), it
// records the failure against that adapter's circuit breaker and tries
// the next one. Only bubbles PrivateAccountError / HandleNotFoundError
// immediately — those are user input problems that no other provider
// would answer differently.
//
// Circuit breaker: 3 consecutive fails within 60s trips the breaker for
// 10 minutes. During open state the chain skips that adapter entirely,
// so we don't waste latency on a dead provider. Auto half-opens after
// the cooldown and lets one call through — success closes it, failure
// re-opens.
//
// Telemetry: every attempt is recorded to the in-memory provider-health
// map. The admin panel reads it via /api/admin/providers/health so we
// can eyeball which provider is doing the work.

export interface NamedAdapter {
  name: string;    // "ensembledata" | "hiker" | "rapidapi" | "mock"
  adapter: DataAdapter;
}

// Errors we treat as user-fixable — NEVER fall through to next adapter.
// The next adapter would return the exact same problem (or worse: fabricate
// data by fuzzy-matching a different handle).
function isUserFixable(e: unknown): boolean {
  return (
    e instanceof PrivateAccountError ||
    e instanceof HandleNotFoundError
  );
}

export class ChainAdapter implements DataAdapter {
  constructor(private readonly adapters: NamedAdapter[]) {
    if (adapters.length === 0) {
      throw new Error("ChainAdapter requires at least one adapter");
    }
  }

  private async chain<T>(
    method: string,
    platform: Platform,
    call: (a: DataAdapter) => Promise<T>,
  ): Promise<T> {
    let lastErr: unknown;
    let attempted = 0;
    for (const { name, adapter } of this.adapters) {
      const health = getProviderHealth(name);
      if (health.state === "open") {
        // Breaker is open — skip. If cooldown has elapsed, provider-health
        // will have already transitioned it to half-open before we check.
        continue;
      }
      attempted += 1;
      const startedAt = Date.now();
      try {
        const result = await call(adapter);
        const latencyMs = Date.now() - startedAt;
        recordSuccess(name, method, platform, latencyMs);
        return result;
      } catch (e) {
        if (isUserFixable(e)) {
          // Don't record as provider failure — the input is wrong, not
          // the provider. Bubble immediately so the user can fix it.
          throw e;
        }
        const latencyMs = Date.now() - startedAt;
        // DataUnavailableError means "this provider doesn't implement this
        // method" — not a failure, just a capability signal. Don't count
        // it against the circuit breaker; skip to the next provider silently.
        if (!(e instanceof DataUnavailableError)) {
          recordFailure(name, method, platform, latencyMs, e);
        }
        lastErr = e;
        // Continue to the next adapter.
      }
    }
    // Every adapter either failed or was skipped due to open breaker.
    if (attempted === 0) {
      // Every provider was in open state — surface as a clean rate-limit
      // signal so the user sees "temporarily unavailable, try again soon"
      // instead of a raw crash.
      throw new ProviderRateLimitError(
        "chain",
        `all providers cooling down for ${method}`,
      );
    }
    throw lastErr ?? new Error(`Chain: ${method} failed with no error captured`);
  }

  // ── DataAdapter methods — each delegates to chain() ──────────────────────

  getProfile(platform: Platform, handle: string): Promise<Profile> {
    return this.chain("getProfile", platform, (a) => a.getProfile(platform, handle));
  }

  getCommenterInfo(platform: Platform, username: string): Promise<CommenterInfo> {
    return this.chain("getCommenterInfo", platform, async (a) => {
      // getCommenterInfo is optional on DataAdapter. Adapters that don't
      // implement it fall through to the next candidate.
      if (typeof a.getCommenterInfo !== "function") {
        throw new Error("getCommenterInfo not implemented on this adapter");
      }
      return a.getCommenterInfo(platform, username);
    });
  }

  getRecentPosts(platform: Platform, handle: string, n: number): Promise<Post[]> {
    return this.chain("getRecentPosts", platform, (a) => a.getRecentPosts(platform, handle, n));
  }

  getFollowerSample(platform: Platform, handle: string, n: number): Promise<FollowerLite[]> {
    return this.chain("getFollowerSample", platform, (a) => a.getFollowerSample(platform, handle, n));
  }

  isHandleAvailable(platform: Platform, handle: string): Promise<UsernameAvailability> {
    return this.chain("isHandleAvailable", platform, (a) => a.isHandleAvailable(platform, handle));
  }

  getHashtagStatus(platform: Platform, hashtag: string): Promise<HashtagStatus> {
    return this.chain("getHashtagStatus", platform, (a) => a.getHashtagStatus(platform, hashtag));
  }

  getThumbnail(platform: Platform, handle: string) {
    return this.chain("getThumbnail", platform, (a) => a.getThumbnail(platform, handle));
  }

  estimateEarnings(platform: Platform, profile: Profile, posts: Post[]): Promise<EarningsEstimate> {
    return this.chain("estimateEarnings", platform, (a) => a.estimateEarnings(platform, profile, posts));
  }

  getLiveCount(platform: Platform, handle: string): Promise<LiveCount> {
    return this.chain("getLiveCount", platform, (a) => a.getLiveCount(platform, handle));
  }

  getReachSignals(platform: Platform, handle: string): Promise<ReachSignals> {
    return this.chain("getReachSignals", platform, (a) => a.getReachSignals(platform, handle));
  }

  getRecentComments(platform: Platform, handle: string, n: number): Promise<{ post: Post; comments: CommentItem[] }> {
    return this.chain("getRecentComments", platform, (a) => a.getRecentComments(platform, handle, n));
  }

  getDemographics(platform: Platform, handle: string): Promise<DemographicSplit> {
    return this.chain("getDemographics", platform, (a) => a.getDemographics(platform, handle));
  }

  getFollowerAudit(platform: Platform, handle: string, sample: number): Promise<FollowerAudit> {
    return this.chain("getFollowerAudit", platform, (a) => a.getFollowerAudit(platform, handle, sample));
  }

  getUnfollowerDelta(platform: Platform, handle: string): Promise<UnfollowerDelta> {
    return this.chain("getUnfollowerDelta", platform, (a) => a.getUnfollowerDelta(platform, handle));
  }
}
