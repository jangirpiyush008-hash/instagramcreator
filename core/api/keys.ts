// API key generation + hashing.
//
// Format: `dc_live_<32 hex chars>` — 128 bits of entropy. `dc_` prefix
// disambiguates from Stripe's `sk_live_` (GitHub push protection flags
// Stripe-shaped strings, and we don't want operator confusion either).
// We store only the SHA-256 hash in the database; the raw key is shown
// to the user exactly ONCE at creation time and never again.

import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "dc_live_";
const KEY_RANDOM_LENGTH = 32; // hex chars → 128 bits

export interface GeneratedKey {
  raw: string;         // "sk_live_abc123..." — shown to user once
  hash: string;        // sha256(raw) — stored in DB
  visiblePrefix: string; // "sk_live_abc12345" — safe to display in the dashboard
}

export function generateApiKey(): GeneratedKey {
  const random = randomBytes(KEY_RANDOM_LENGTH / 2).toString("hex");
  const raw = `${KEY_PREFIX}${random}`;
  return {
    raw,
    hash: hashApiKey(raw),
    visiblePrefix: raw.slice(0, KEY_PREFIX.length + 8), // "sk_live_abc12345"
  };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function isValidKeyFormat(raw: string): boolean {
  if (!raw.startsWith(KEY_PREFIX)) return false;
  const suffix = raw.slice(KEY_PREFIX.length);
  return suffix.length === KEY_RANDOM_LENGTH && /^[a-f0-9]+$/i.test(suffix);
}
