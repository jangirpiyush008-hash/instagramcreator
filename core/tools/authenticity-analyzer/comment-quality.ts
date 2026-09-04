// Comment-quality analysis — our strongest single tell for bought
// engagement. A creator can pay for likes and views, but authentic
// comments in the target creator's own language + niche are genuinely
// hard to fake at scale. Comment farms tend to produce:
//   - single-emoji comments (🔥, ❤️, 😍)
//   - generic praise ("nice", "great post", "amazing")
//   - repetitive text across posts (same string, different account)
//   - obviously botted usernames (name + long digit tail, random letters)
//
// This module is deliberately pure: takes a list of CommentItem and
// returns a scored breakdown. No network, no side effects. The scoring
// engine turns the breakdown into the final Engagement Quality score.

import type { CommentItem } from "@/core/data/adapter";

export interface CommentQualitySignal {
  totalComments: number;
  genericPct: number;        // "nice pic", "🔥", "❤️❤️❤️"
  emojiOnlyPct: number;      // 100% emoji / non-word chars
  repetitivePct: number;     // near-duplicates across the sample
  botNamePct: number;        // botty username shape
  avgLength: number;         // avg comment length in chars
  score: number;             // 0-100 higher = more authentic
  flags: string[];           // human-readable reasons the score dropped
}

// A single-line generic-praise vocabulary. Deliberately conservative —
// false positives here damage a real creator's score. We only match a
// comment as "generic" when the ENTIRE comment (post-normalization) is
// one of these tokens or a stack of them.
const GENERIC_TOKENS = new Set([
  "nice", "cool", "wow", "amazing", "great", "love", "loved",
  "awesome", "beautiful", "perfect", "yes", "yess", "yesss",
  "good", "great post", "nice post", "nice pic", "great pic",
  "so nice", "so cool", "so cute", "cute", "hot", "fire",
  "lit", "goat", "king", "queen", "legend", "iconic",
  "gorgeous", "stunning", "handsome", "pretty", "sexy",
  "❤", "❤️", "🔥", "😍", "🥰", "👏", "👍", "💯",
  "goals", "vibes", "mood", "same", "facts", "true",
  "nice one", "well done", "keep it up", "keep going",
]);

// A comment counts as "emoji-only" if after stripping whitespace it
// contains zero \p{L} (letter) codepoints. Handles ❤️❤️❤️, 🔥🔥🔥, mixed
// clusters, and single-character punctuation like "!" or "...".
function isEmojiOnly(text: string): boolean {
  const stripped = text.replace(/\s+/g, "");
  if (stripped.length === 0) return true;
  return !/\p{L}/u.test(stripped);
}

// Normalize for the "generic" bucket: lowercase, strip trailing
// punctuation and repeated characters ("nicee" → "nice"), strip
// leading @mentions ("@friend 🔥" → "🔥"), collapse whitespace.
function normalizeForGeneric(text: string): string {
  let s = text.toLowerCase().trim();
  // Strip leading @mentions — those are just tags to friends around a
  // real reaction, they don't make the reaction less generic.
  s = s.replace(/^(@\S+\s+)+/u, "");
  s = s.replace(/\s+/g, " ");
  // Collapse repeated letters: "niceeee" → "nice", "yessss" → "yes"
  s = s.replace(/(.)\1{2,}/gu, "$1");
  // Strip trailing punctuation
  s = s.replace(/[!.?,;:]+$/u, "");
  return s;
}

// Botty-username shapes we see in the wild. Deliberately conservative;
// false positives here look bad against real accounts.
function looksBotty(username: string): boolean {
  const u = username.replace(/^@/, "");
  // "name1234567" — word + 5+ digit tail
  if (/^[a-z]+\d{5,}$/i.test(u)) return true;
  // "aaaaa_bbbbb_ccccc" — three or more underscored word-clumps
  if ((u.match(/_/g) ?? []).length >= 3) return true;
  // Very long ID-shaped handle with no dots or vowels-heavy pattern
  if (u.length >= 16 && /^[a-z0-9_]+$/i.test(u) && !/[.]/.test(u)) {
    const vowels = (u.match(/[aeiou]/gi) ?? []).length;
    if (vowels / u.length < 0.15) return true;
  }
  return false;
}

// Repetition detector: how many comments are exact-string duplicates of
// another comment in the sample (after normalization)? Farm services
// hand the same script to hundreds of accounts.
function repetitionPct(normalized: string[]): number {
  if (normalized.length < 4) return 0;
  const counts = new Map<string, number>();
  for (const n of normalized) {
    if (n.length === 0) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let repeats = 0;
  for (const c of counts.values()) if (c >= 2) repeats += c;
  return (repeats / normalized.length) * 100;
}

export function analyzeCommentQuality(comments: CommentItem[]): CommentQualitySignal {
  const total = comments.length;
  if (total === 0) {
    return {
      totalComments: 0,
      genericPct: 0,
      emojiOnlyPct: 0,
      repetitivePct: 0,
      botNamePct: 0,
      avgLength: 0,
      score: 50, // neutral — insufficient data, don't reward or punish
      flags: ["No comments available to analyze"],
    };
  }

  let genericCount = 0;
  let emojiOnlyCount = 0;
  let botNameCount = 0;
  let lengthSum = 0;
  const normalized: string[] = [];

  for (const c of comments) {
    const text = (c.text ?? "").trim();
    lengthSum += text.length;
    if (isEmojiOnly(text)) emojiOnlyCount += 1;
    const norm = normalizeForGeneric(text);
    normalized.push(norm);
    if (GENERIC_TOKENS.has(norm)) genericCount += 1;
    if (looksBotty(c.username)) botNameCount += 1;
  }

  const genericPct = (genericCount / total) * 100;
  const emojiOnlyPct = (emojiOnlyCount / total) * 100;
  const botNamePct = (botNameCount / total) * 100;
  const repetitivePct = repetitionPct(normalized);
  const avgLength = lengthSum / total;

  // Score starts at 100 and drops per red flag. Weights tuned against
  // hand-labeled samples: repetition is the strongest bought-comment
  // tell, bot-shaped usernames second, generic third.
  let score = 100;
  const flags: string[] = [];

  if (repetitivePct >= 30) {
    score -= 35;
    flags.push(`${repetitivePct.toFixed(0)}% of comments are near-duplicates — comment-farm pattern`);
  } else if (repetitivePct >= 15) {
    score -= 18;
    flags.push(`${repetitivePct.toFixed(0)}% of comments repeat — mild farm signal`);
  }

  if (botNamePct >= 25) {
    score -= 25;
    flags.push(`${botNamePct.toFixed(0)}% of commenters have bot-shaped usernames`);
  } else if (botNamePct >= 12) {
    score -= 10;
    flags.push(`${botNamePct.toFixed(0)}% of commenters have bot-shaped usernames`);
  }

  if (genericPct + emojiOnlyPct >= 65) {
    score -= 22;
    flags.push(
      `${(genericPct + emojiOnlyPct).toFixed(0)}% of comments are generic praise or emoji-only`,
    );
  } else if (genericPct + emojiOnlyPct >= 45) {
    score -= 10;
    flags.push(
      `${(genericPct + emojiOnlyPct).toFixed(0)}% of comments are generic praise or emoji-only`,
    );
  }

  if (avgLength < 4 && total >= 10) {
    score -= 8;
    flags.push(`Average comment length is ${avgLength.toFixed(1)} chars — extremely shallow`);
  }

  score = Math.max(5, Math.min(100, score));

  return {
    totalComments: total,
    genericPct: Number(genericPct.toFixed(1)),
    emojiOnlyPct: Number(emojiOnlyPct.toFixed(1)),
    repetitivePct: Number(repetitivePct.toFixed(1)),
    botNamePct: Number(botNamePct.toFixed(1)),
    avgLength: Number(avgLength.toFixed(1)),
    score: Number(score.toFixed(1)),
    flags,
  };
}
