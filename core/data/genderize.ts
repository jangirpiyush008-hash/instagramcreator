// Thin wrapper around genderize.io's public name→gender API.
//
// Docs: https://genderize.io/
//   Free tier: 100 names/day per IP (very tight)
//   Basic: $9/mo for 1,000/day
//   Pro:   $15/mo for 10,000/day
//
// Genderize accepts up to 10 names per request via repeated `name[]=X` query
// params. We batch our sample into groups of 10 to minimize request count.
//
// TODO (follow-up): cache classifications in Supabase — names are permanent,
// so cache hits reduce genderize calls dramatically once the site sees traffic.

export interface GenderizeResult {
  name: string;
  gender: "male" | "female" | null;
  probability: number;
  count: number;
}

interface RawGenderize {
  name: string;
  gender: "male" | "female" | null;
  probability: number;
  count: number;
}

const BATCH_SIZE = 10;
const CONFIDENCE_THRESHOLD = 0.65;

async function classifyBatch(names: string[], apiKey?: string): Promise<GenderizeResult[]> {
  const qs = new URLSearchParams();
  for (const n of names) qs.append("name[]", n);
  if (apiKey) qs.set("apikey", apiKey);
  const url = `https://api.genderize.io?${qs.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (res.status === 429) {
      // Silent fail — the tool degrades gracefully to "unknown" for these names.
      console.warn("[genderize] daily quota hit, remaining names skipped");
      return [];
    }
    if (!res.ok) {
      console.warn(`[genderize] batch failed with ${res.status}`);
      return [];
    }
    const j = (await res.json()) as RawGenderize[] | RawGenderize;
    // Single-name responses aren't wrapped in an array — normalise both shapes.
    const rows = Array.isArray(j) ? j : [j];
    return rows.map((r) => ({
      name: r.name,
      gender: r.gender,
      probability: r.probability,
      count: r.count,
    }));
  } catch (e) {
    console.warn("[genderize] fetch error:", e instanceof Error ? e.message : e);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// Classifies a list of first names. Skips confidence-threshold failures and
// returns an aggregate + a lookup for the caller to render per-name detail.
export async function classifyNames(
  firstNames: string[],
): Promise<{
  aggregate: { male: number; female: number; unknown: number };
  classified: GenderizeResult[];
  totalRequested: number;
}> {
  // Dedupe so we don't spend budget classifying the same name twice.
  const unique = Array.from(new Set(firstNames.map((n) => n.toLowerCase())));
  const apiKey = process.env.GENDERIZE_API_KEY;

  const results: GenderizeResult[] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const batchResults = await classifyBatch(batch, apiKey);
    results.push(...batchResults);
  }

  // Build a lookup for the aggregation pass so we can count each occurrence
  // in the original list (not deduped) — a name shared by 10 people should
  // count 10 times toward the split.
  const lookup = new Map(results.map((r) => [r.name, r]));
  let male = 0;
  let female = 0;
  let unknown = 0;
  for (const raw of firstNames) {
    const r = lookup.get(raw.toLowerCase());
    if (!r || r.gender === null || r.probability < CONFIDENCE_THRESHOLD) {
      unknown++;
    } else if (r.gender === "male") {
      male++;
    } else {
      female++;
    }
  }

  return {
    aggregate: { male, female, unknown },
    classified: results,
    totalRequested: firstNames.length,
  };
}

// Extracts a plausible first name from a display name. Skips empty strings,
// strips emoji + symbols, and keeps only the first alphabetic word so
// "Rahul Kumar 🇮🇳" → "Rahul", "😎Priya😎" → "Priya".
export function extractFirstName(displayName: string | undefined | null): string | null {
  if (!displayName) return null;
  const cleaned = displayName
    // Drop emoji + non-alphabetic characters, keep letters + spaces + hyphens
    .replace(/[^\p{L}\s\-']/gu, " ")
    .trim();
  if (!cleaned) return null;
  const first = cleaned.split(/\s+/)[0];
  if (!first || first.length < 2) return null;
  // Skip likely non-names: single letters, all-caps handles, numbers-only
  if (/^\d+$/.test(first)) return null;
  return first;
}
