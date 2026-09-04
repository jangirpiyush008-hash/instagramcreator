// Language-mismatch analysis. A common tell for cheap engagement farms
// is that comments arrive in a single language that isn't the creator's
// own. An English-speaking creator whose comments are 70% Cyrillic /
// Devanagari / CJK generic praise with no matching audience niche is
// almost certainly buying engagement. Conversely — legitimate multi-
// language audiences DO happen (Bollywood creator getting Hindi + English
// + Arabic comments is normal); the signal only fires when we see a
// single non-caption-language dominating.
//
// This is intentionally lightweight: we don't ship a full ISO-639 model
// server-side. We bucket by Unicode script blocks — that's enough to
// detect Latin / Cyrillic / Devanagari / Arabic / CJK / Thai / Bengali
// / Tamil / Telugu / Kannada. Emoji + digits are ignored (no signal).

import type { CommentItem } from "@/core/data/adapter";

export type Script =
  | "latin"
  | "cyrillic"
  | "devanagari"
  | "bengali"
  | "tamil"
  | "telugu"
  | "kannada"
  | "arabic"
  | "cjk"
  | "hangul"
  | "thai"
  | "hebrew"
  | "greek"
  | "other";

export interface LanguageSignal {
  available: boolean;
  captionScript: Script | null;
  dominantCommentScript: Script | null;
  scriptDistribution: Partial<Record<Script, number>>;  // % per script, top 4
  dominantSharePct: number | null;
  mismatch: boolean;
  score: number;             // 0-100 higher = healthier
  flag: string | null;
}

// Classify a codepoint to its script bucket.
function scriptOf(cp: number): Script | null {
  // Skip control, whitespace, ASCII punctuation/digits.
  if (cp < 0x0041) return null;
  if (cp >= 0x0041 && cp <= 0x007a) return "latin";
  if (cp >= 0x00c0 && cp <= 0x024f) return "latin";  // Latin extended
  if (cp >= 0x0370 && cp <= 0x03ff) return "greek";
  if (cp >= 0x0400 && cp <= 0x04ff) return "cyrillic";
  if (cp >= 0x0590 && cp <= 0x05ff) return "hebrew";
  if (cp >= 0x0600 && cp <= 0x06ff) return "arabic";
  if (cp >= 0x0900 && cp <= 0x097f) return "devanagari";
  if (cp >= 0x0980 && cp <= 0x09ff) return "bengali";
  if (cp >= 0x0b80 && cp <= 0x0bff) return "tamil";
  if (cp >= 0x0c00 && cp <= 0x0c7f) return "telugu";
  if (cp >= 0x0c80 && cp <= 0x0cff) return "kannada";
  if (cp >= 0x0e00 && cp <= 0x0e7f) return "thai";
  if (cp >= 0x1100 && cp <= 0x11ff) return "hangul";
  if (cp >= 0x3040 && cp <= 0x30ff) return "cjk"; // hiragana/katakana
  if (cp >= 0x3130 && cp <= 0x318f) return "hangul";
  if (cp >= 0x3400 && cp <= 0x9fff) return "cjk";
  if (cp >= 0xac00 && cp <= 0xd7af) return "hangul";
  if (cp >= 0xff00 && cp <= 0xffef) return "cjk";
  return null;
}

// Return the majority script in a string, or null if there are no
// script-bearing characters (emoji-only / digits).
function dominantScript(text: string): Script | null {
  const counts = new Map<Script, number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const s = scriptOf(cp);
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best: Script | null = null;
  let bestCount = 0;
  for (const [s, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = s;
    }
  }
  return best;
}

export function analyzeCommentLanguage(
  comments: CommentItem[],
  caption: string | null | undefined,
): LanguageSignal {
  const captionScript = caption ? dominantScript(caption) : null;

  const total = comments.length;
  if (total < 10) {
    return {
      available: false,
      captionScript,
      dominantCommentScript: null,
      scriptDistribution: {},
      dominantSharePct: null,
      mismatch: false,
      score: 50,
      flag: null,
    };
  }

  const counts = new Map<Script, number>();
  let scored = 0;
  for (const c of comments) {
    const s = dominantScript(c.text);
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
    scored += 1;
  }

  if (scored < 10) {
    return {
      available: false,
      captionScript,
      dominantCommentScript: null,
      scriptDistribution: {},
      dominantSharePct: null,
      mismatch: false,
      score: 50,
      flag: null,
    };
  }

  let dominantCommentScript: Script | null = null;
  let dominantCount = 0;
  for (const [s, c] of counts) {
    if (c > dominantCount) {
      dominantCount = c;
      dominantCommentScript = s;
    }
  }

  const distribution: Partial<Record<Script, number>> = {};
  for (const [s, c] of counts) {
    distribution[s] = Number(((c / scored) * 100).toFixed(1));
  }

  const dominantSharePct = (dominantCount / scored) * 100;

  // Mismatch only when caption script is known and different from the
  // dominant comment script, AND the dominance is strong (>= 55%). This
  // avoids false-positives on multi-language audiences (Bollywood /
  // Latin-America / cross-diaspora creators legitimately mix scripts).
  const mismatch =
    captionScript !== null &&
    dominantCommentScript !== null &&
    captionScript !== dominantCommentScript &&
    dominantSharePct >= 55;

  let score = 100;
  let flag: string | null = null;

  if (mismatch && dominantSharePct >= 75) {
    score = 45;
    flag = `${dominantSharePct.toFixed(0)}% of comments are in ${dominantCommentScript} script while the caption is ${captionScript} — bought-engagement pattern`;
  } else if (mismatch) {
    score = 68;
    flag = `${dominantSharePct.toFixed(0)}% of comments are in ${dominantCommentScript} while the caption is ${captionScript} — possible audience-language mismatch`;
  }

  return {
    available: true,
    captionScript,
    dominantCommentScript,
    scriptDistribution: distribution,
    dominantSharePct: Number(dominantSharePct.toFixed(1)),
    mismatch,
    score,
    flag,
  };
}
