// Comment timestamp burst detection. Bought comments arrive in tight
// clusters — a comment-farm service processes an order in minutes; a
// hundred accounts drop pre-scripted comments in a narrow window and
// nothing after. Real engagement decays gradually over hours and days
// as the algorithm surfaces the post to more users.
//
// The signal is BURSTINESS vs the expected time distribution. We
// measure the fraction of comments landing inside the top-density
// window and compare against the total sample age. Farm patterns
// concentrate 70–100% of comments in a very short slice of the total
// commenting window; real engagement stretches out evenly or with a
// clear early-hours peak and a long tail.

import type { CommentItem } from "@/core/data/adapter";

export interface BurstSignal {
  available: boolean;             // false when timestamps are missing / unreliable
  totalComments: number;
  windowMinutes: number | null;   // span of the sample (first → last comment)
  peakWindowMinutes: number | null;  // narrow window that holds the most comments
  peakConcentrationPct: number | null; // % of comments in the peak window
  score: number;                  // 0-100 higher = more natural distribution
  flag: string | null;            // human-readable summary when suspicious
}

const PEAK_WINDOW_FRACTION = 0.1;   // peak window = 10% of total span

function toEpochMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function analyzeCommentBursts(comments: CommentItem[]): BurstSignal {
  if (comments.length < 8) {
    return {
      available: false,
      totalComments: comments.length,
      windowMinutes: null,
      peakWindowMinutes: null,
      peakConcentrationPct: null,
      score: 50,
      flag: null,
    };
  }

  const ts: number[] = [];
  for (const c of comments) {
    const t = toEpochMs(c.postedAt);
    if (t !== null) ts.push(t);
  }

  if (ts.length < 8) {
    return {
      available: false,
      totalComments: comments.length,
      windowMinutes: null,
      peakWindowMinutes: null,
      peakConcentrationPct: null,
      score: 50,
      flag: null,
    };
  }

  ts.sort((a, b) => a - b);
  const spanMs = ts[ts.length - 1]! - ts[0]!;
  const spanMin = spanMs / 60_000;

  // Guard against zero-span (all comments at same timestamp — usually
  // a data-provider quirk, not a real signal). Treat as unavailable.
  if (spanMin < 1) {
    return {
      available: false,
      totalComments: comments.length,
      windowMinutes: 0,
      peakWindowMinutes: null,
      peakConcentrationPct: null,
      score: 50,
      flag: null,
    };
  }

  const peakWindowMs = spanMs * PEAK_WINDOW_FRACTION;
  const peakWindowMin = peakWindowMs / 60_000;

  // Sliding-window peak-count: for every comment, count how many others
  // fall within [t, t + peakWindowMs]. Track the max.
  let maxCount = 0;
  for (let i = 0; i < ts.length; i++) {
    const start = ts[i]!;
    const end = start + peakWindowMs;
    let count = 0;
    for (let j = i; j < ts.length && ts[j]! <= end; j++) count += 1;
    if (count > maxCount) maxCount = count;
  }
  const concentrationPct = (maxCount / ts.length) * 100;

  // Scoring: a natural distribution lands roughly `peakWindowFraction`
  // of comments in the peak window (i.e. 10% here). Farm patterns push
  // 50%+ into the peak window. Legitimate viral surges do the same for
  // very short windows (all comments arrived after the reel took off),
  // so we only penalize hard when spanMin is short enough that all
  // comments look pre-scripted.
  const expectedPct = PEAK_WINDOW_FRACTION * 100;  // 10%
  const excess = concentrationPct - expectedPct;

  let score = 100;
  let flag: string | null = null;

  if (spanMin < 30 && concentrationPct >= 60) {
    // Very short overall span AND high concentration = classic farm.
    score = 20;
    flag = `${concentrationPct.toFixed(0)}% of comments landed in a ${peakWindowMin.toFixed(0)}-min window over a ${spanMin.toFixed(0)}-min total span — comment-farm burst pattern`;
  } else if (concentrationPct >= 70) {
    score = 45;
    flag = `${concentrationPct.toFixed(0)}% of comments cluster in the top ${(PEAK_WINDOW_FRACTION * 100).toFixed(0)}% of the timing window — unusually bursty`;
  } else if (excess >= 30) {
    score = 65;
    flag = `Comments cluster more tightly than expected (${concentrationPct.toFixed(0)}% in the peak window vs the ~${expectedPct.toFixed(0)}% baseline)`;
  } else if (excess >= 15) {
    score = 82;
  } else {
    score = 92;
  }

  return {
    available: true,
    totalComments: ts.length,
    windowMinutes: Number(spanMin.toFixed(1)),
    peakWindowMinutes: Number(peakWindowMin.toFixed(1)),
    peakConcentrationPct: Number(concentrationPct.toFixed(1)),
    score,
    flag,
  };
}
