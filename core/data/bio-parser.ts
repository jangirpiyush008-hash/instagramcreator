// Extract gender + age signals from a public profile bio string.
// Zero external calls — pure regex + curated keyword lookup. Fast, cheap,
// reversible.
//
// Signal strengths:
//   Pronouns (she/her, he/him, they/them)   → ground truth when present.
//     ~15-30% of Gen-Z bios include them explicitly.
//   Gendered self-descriptors (mom, wife, dad, husband)  → very reliable.
//     ~10-20% of adult bios include them.
//   Age hints (23 y/o, born 1998, birthday 15/6)   → reliable when present.
//     ~5-10% of bios include them.
//
// This runs BEFORE any face-based analysis in the enrichment pipeline —
// bio evidence is stronger than face inference because it's self-declared.

export interface BioSignals {
  // Gender inferred from bio text. Null when nothing recognisable.
  inferredGender: "male" | "female" | "nonbinary" | null;
  genderConfidence: "high" | "medium" | "low" | null;
  genderEvidence: string[]; // human-readable snippet like "pronouns: she/her"

  // Age bracket inferred from explicit age mentions.
  inferredAgeBracket: "18-24" | "25-34" | "35-44" | "45+" | null;
  inferredAgeExact: number | null;
  ageEvidence: string[];
}

// ────────────────────────────────────────────────────────────────────────
// Pronoun patterns. Order matters — 'they/them' checked first so it doesn't
// get overridden by later scans that might match 'them' as a false positive.
const PRONOUN_PATTERNS: Array<{ regex: RegExp; gender: "male" | "female" | "nonbinary"; label: string }> = [
  // Non-binary — check first
  { regex: /\bthey\s*\/\s*them\b/i, gender: "nonbinary", label: "they/them" },
  { regex: /\bhe\s*\/\s*they\b/i, gender: "nonbinary", label: "he/they" },
  { regex: /\bshe\s*\/\s*they\b/i, gender: "nonbinary", label: "she/they" },
  { regex: /\bthey\s*\/\s*he\b/i, gender: "nonbinary", label: "they/he" },
  { regex: /\bthey\s*\/\s*she\b/i, gender: "nonbinary", label: "they/she" },
  { regex: /\benby\b/i, gender: "nonbinary", label: "enby" },
  { regex: /\bnonbinary\b/i, gender: "nonbinary", label: "non-binary" },
  { regex: /\bnon-binary\b/i, gender: "nonbinary", label: "non-binary" },
  // Binary
  { regex: /\bshe\s*\/\s*her\b/i, gender: "female", label: "she/her" },
  { regex: /\bshe\s*\/\s*hers\b/i, gender: "female", label: "she/hers" },
  { regex: /\bher\s*\/\s*hers\b/i, gender: "female", label: "her/hers" },
  { regex: /\bhe\s*\/\s*him\b/i, gender: "male", label: "he/him" },
  { regex: /\bhe\s*\/\s*his\b/i, gender: "male", label: "he/his" },
  { regex: /\bhim\s*\/\s*his\b/i, gender: "male", label: "him/his" },
];

// Self-descriptor keywords. Match on word boundaries only so 'mom' doesn't
// hit 'momentum'. Weighted "high" for unambiguous (mom, husband, bride)
// and "medium" for softer (wifey, hubby, princess — which can also be
// used ironically by any gender).
const GENDERED_TERMS: Array<{ regex: RegExp; gender: "male" | "female"; confidence: "high" | "medium"; label: string }> = [
  // Female — high
  { regex: /\bmom\b/i, gender: "female", confidence: "high", label: "mom" },
  { regex: /\bmomma\b/i, gender: "female", confidence: "high", label: "momma" },
  { regex: /\bmommy\b/i, gender: "female", confidence: "high", label: "mommy" },
  { regex: /\bmother\b/i, gender: "female", confidence: "high", label: "mother" },
  { regex: /\bmum\b/i, gender: "female", confidence: "high", label: "mum" },
  { regex: /\bwife\b/i, gender: "female", confidence: "high", label: "wife" },
  { regex: /\bhusband to\b/i, gender: "female", confidence: "high", label: "husband to (implies wife)" },
  { regex: /\bbride\b/i, gender: "female", confidence: "high", label: "bride" },
  { regex: /\bbride-to-be\b/i, gender: "female", confidence: "high", label: "bride-to-be" },
  { regex: /\bgirl(?:friend)?\b/i, gender: "female", confidence: "medium", label: "girlfriend" },
  { regex: /\bwifey\b/i, gender: "female", confidence: "medium", label: "wifey" },
  { regex: /\bqueen\b/i, gender: "female", confidence: "medium", label: "queen" },
  { regex: /\bboss\s*babe\b/i, gender: "female", confidence: "high", label: "boss babe" },
  { regex: /\bfemale\b/i, gender: "female", confidence: "high", label: "female" },
  // Male — high
  { regex: /\bdad\b/i, gender: "male", confidence: "high", label: "dad" },
  { regex: /\bdaddy\b/i, gender: "male", confidence: "medium", label: "daddy" },
  { regex: /\bfather\b/i, gender: "male", confidence: "high", label: "father" },
  { regex: /\bhusband\b/i, gender: "male", confidence: "high", label: "husband" },
  { regex: /\bwife to\b/i, gender: "male", confidence: "high", label: "wife to (implies husband)" },
  { regex: /\bgroom\b/i, gender: "male", confidence: "high", label: "groom" },
  { regex: /\bboyfriend\b/i, gender: "male", confidence: "medium", label: "boyfriend" },
  { regex: /\bhubby\b/i, gender: "male", confidence: "medium", label: "hubby" },
  { regex: /\bmale\b/i, gender: "male", confidence: "high", label: "male" },
  { regex: /\bking\b/i, gender: "male", confidence: "medium", label: "king" }, // often ironic — kept as medium
  { regex: /\bmr\.\s+/i, gender: "male", confidence: "medium", label: "Mr." },
  { regex: /\bmrs\.\s+/i, gender: "female", confidence: "high", label: "Mrs." },
  { regex: /\bms\.\s+/i, gender: "female", confidence: "medium", label: "Ms." },
];

// Age patterns. Order: most specific first.
const AGE_PATTERNS: RegExp[] = [
  /\b(\d{1,2})\s*(?:y[/.\s]?o|years?\s+old|yr[s]?)\b/i,       // "23 y/o", "23 years old", "23 yrs"
  /\b(?:age|aged)[\s:]+(\d{1,2})\b/i,                        // "age: 27", "aged 27"
  /\bborn\s+(?:in\s+)?(?:19|20)(\d{2})\b/i,                  // "born 1998" or "born in 1998" → derive age
  /(?:^|\s)(\d{1,2})(?:\s*(?:🎂|🎉))/,                        // "27 🎂" or "27 🎉"
];

const CURRENT_YEAR = 2026;

function bracketForAge(age: number): "18-24" | "25-34" | "35-44" | "45+" | null {
  if (age < 18 || age > 90) return null;
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  return "45+";
}

// ────────────────────────────────────────────────────────────────────────

export function parseBio(bio: string | undefined | null): BioSignals {
  const empty: BioSignals = {
    inferredGender: null,
    genderConfidence: null,
    genderEvidence: [],
    inferredAgeBracket: null,
    inferredAgeExact: null,
    ageEvidence: [],
  };
  if (!bio || typeof bio !== "string") return empty;
  const text = bio.trim();
  if (text.length === 0) return empty;

  // ── Gender: pronouns > gendered terms ─────────────────────────────
  let gender: "male" | "female" | "nonbinary" | null = null;
  let confidence: "high" | "medium" | "low" | null = null;
  const genderEvidence: string[] = [];

  for (const p of PRONOUN_PATTERNS) {
    if (p.regex.test(text)) {
      gender = p.gender;
      confidence = "high";
      genderEvidence.push(`pronouns: ${p.label}`);
      break;
    }
  }

  if (!gender) {
    // Fall back to gendered self-descriptors. If we hit conflicting terms
    // (rare, e.g. "mom of 4 married to my husband"), the FIRST high-
    // confidence match wins; medium-confidence terms tie-break by count.
    let bestMedium: { gender: "male" | "female"; count: number } | null = null;
    for (const t of GENDERED_TERMS) {
      if (t.regex.test(text)) {
        genderEvidence.push(t.label);
        if (t.confidence === "high") {
          gender = t.gender;
          confidence = "high";
          break;
        }
        if (!bestMedium) bestMedium = { gender: t.gender, count: 1 };
        else if (bestMedium.gender === t.gender) bestMedium.count += 1;
      }
    }
    if (!gender && bestMedium) {
      gender = bestMedium.gender;
      confidence = "medium";
    }
  }

  // ── Age ────────────────────────────────────────────────────────────
  let ageExact: number | null = null;
  const ageEvidence: string[] = [];

  for (const p of AGE_PATTERNS) {
    const m = text.match(p);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) {
        // 'born YYYY' pattern returns last 2 digits → prepend century
        if (p.source.includes("born")) {
          const fullYear = n >= 50 ? 1900 + n : 2000 + n;
          const age = CURRENT_YEAR - fullYear;
          if (age >= 13 && age <= 90) {
            ageExact = age;
            ageEvidence.push(`born ${fullYear} → age ~${age}`);
            break;
          }
        } else if (n >= 13 && n <= 90) {
          ageExact = n;
          ageEvidence.push(`explicit: ${n}`);
          break;
        }
      }
    }
  }

  return {
    inferredGender: gender,
    genderConfidence: confidence,
    genderEvidence,
    inferredAgeBracket: ageExact !== null ? bracketForAge(ageExact) : null,
    inferredAgeExact: ageExact,
    ageEvidence,
  };
}
