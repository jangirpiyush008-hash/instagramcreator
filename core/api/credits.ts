// How many API credits each tool costs when called via /v1/scan.
//
// Costs are chosen from actual provider spend + a healthy margin:
//   - Pure-logic tools with no external API call: 1-3 credits
//   - Single primitive fetch (1 provider call): 5-8 credits
//   - Compound analytics (2 provider calls + math): 10-15 credits
//   - Deep sampling (follower list, name classification): 25 credits
//   - Full bundle (all 11 tools, cache-shared primitives): 80 credits
//
// A `1 credit = $0.001` retail conversion is our default when we bill.
// Actual sold pricing lives in the tier configuration — this file is
// just the meter.

export const CREDIT_COSTS: Record<string, number> = {
  // Free / cheap
  "banned-hashtag": 1,
  "username-checker": 3,

  // Single-primitive
  "hashtag-finder": 8,
  "unfollower-tracker": 5,
  "thumbnail-downloader": 8,

  // Compound analytics
  "engagement-rate": 10,
  "earnings-estimator": 10,
  "fake-follower": 10,
  "comment-picker": 12,
  "shadowban-checker": 12,

  // Deep / high-cost
  "recent-posts": 15,
  "gender-split": 25,

  // Bundled endpoint — runs every tool but shares primitives via cache, so
  // net provider spend is closer to 4-5 primitive calls than the sum of
  // the individual tool costs.
  "full-report": 80,
};

export const DEFAULT_CREDIT_COST = 10;

export function creditCost(toolId: string): number {
  return CREDIT_COSTS[toolId] ?? DEFAULT_CREDIT_COST;
}

// Watchlist and download endpoints have their own fixed costs.
export const WATCHLIST_ADD_COST = 0;    // free — user is asking us to track for future scans
export const WATCHLIST_READ_COST = 2;   // small charge per read to prevent abuse
export const DOWNLOAD_PROXY_COST = 5;   // per media stream

// Subscription tiers — swap in real pricing when we get the operator's
// committed numbers. `credits` = monthly bucket, `overage_price_usd` = cost
// per credit once the bucket is exhausted (5x the retail rate as a nudge).
export const TIERS = {
  starter: { name: "Starter", monthlyUsd: 29, credits: 3_000, overageUsd: 0.005 },
  pro: { name: "Pro", monthlyUsd: 99, credits: 15_000, overageUsd: 0.005 },
  scale: { name: "Scale", monthlyUsd: 299, credits: 60_000, overageUsd: 0.005 },
  enterprise: { name: "Enterprise", monthlyUsd: 0, credits: 0, overageUsd: 0.003 },
} as const;

export type Tier = keyof typeof TIERS;
