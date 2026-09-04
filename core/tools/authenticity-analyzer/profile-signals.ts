// Profile-level commercial-intent signals. Feeds into Paid Content
// probability as a BASELINE lift, not as evidence for any specific
// post. An account whose bio + business-category shape screams "PR /
// collabs / brand" starts with a higher prior that any given post
// might be commercial. This does NOT flag a specific post as paid on
// its own — post-level caption analysis still owns the per-post score.
//
// Rule from spec: never manufacture confidence. A bio saying "DM for
// collabs" doesn't mean the reel we're looking at IS paid. It shifts
// the prior a little; caption + Ad Library still decide the verdict.

import type { Profile } from "@/core/data/adapter";

export interface ProfileSignal {
  isBusinessAccount: boolean;
  businessCategory: string | null;
  bioCommercialHits: string[];      // phrases matched
  bioBrandOfficialHit: boolean;     // "@brand — Official", "The official X"
  commercialIntentScore: number;    // 0-100 how commercially oriented the profile looks
  reasons: string[];                 // human-readable summary lines
}

// Bio patterns that indicate commercial intent. Kept narrow to avoid
// false positives — every creator gets DMs, not every creator is running
// paid collabs.
const BIO_COMMERCIAL_PATTERNS: { rx: RegExp; label: string }[] = [
  { rx: /\bDM\s+(?:for\s+)?(?:collab|business|brand|paid|inqu)/i, label: "DM for collabs / business" },
  { rx: /\b(?:collabs?|partnerships?|brand\s+deals?)\b[:\-]?\s*(?:@|email|dm)/i, label: "Explicit collab/partnership offer" },
  { rx: /\bemail\s*(?:for\s+)?(?:business|inqu|collab|brand|work)/i, label: "Email for business/collabs" },
  { rx: /\b(?:PR|press)\s+(?:list|inquiries|kit|drop)/i, label: "PR list / press kit mention" },
  { rx: /\bmanager\s*[:\-]?\s*[a-z0-9._@]+/i, label: "Publicly listed manager contact" },
  { rx: /\b(?:brand\s+)?ambassador\b/i, label: "Brand ambassador declared" },
  { rx: /\baffiliate\b/i, label: "Affiliate declared in bio" },
  { rx: /\bfounder\s+(?:of|@)\b/i, label: "Founder — commercial account" },
  { rx: /\bshop\s+(?:my|our|the)?\s*link\b/i, label: "Shop-link CTA in bio" },
  { rx: /\bkit\b.*link/i, label: "Media kit link in bio" },
];

// Pattern that means: this account is the OFFICIAL account of a brand.
// A brand-owned account posting product content isn't buying influencer
// content — it's first-party. Treated separately from creator collab.
const BIO_BRAND_OFFICIAL_RX =
  /\b(?:the\s+)?official\b|™|\bcorporate\b|®|\bverified\s+brand\b|Ⓡ/i;

// Business categories that raise the commercial prior — retail, apparel,
// beauty, restaurants, health/wellness. Leave education / community /
// news / non-profit alone. Category strings mirror what IG's public
// GraphQL exposes on business accounts.
const COMMERCIAL_CATEGORIES = new Set(
  [
    "Retail company",
    "Clothing (brand)",
    "Clothing store",
    "Beauty, cosmetic & personal care",
    "Beauty",
    "Health/beauty",
    "Restaurant",
    "Bar",
    "Cafe",
    "Health & wellness website",
    "Product/service",
    "Shopping & retail",
    "E-commerce website",
    "Jewelry/watches",
    "Skincare service",
    "Salon",
    "Tobacco company",
    "Wine, beer & spirits store",
  ].map((s) => s.toLowerCase()),
);

// Categories that read as content/media rather than direct commerce.
// Creators here still take brand deals — we don't want to over-boost
// their prior just because they set a category.
const CONTENT_CATEGORIES = new Set(
  [
    "Video creator",
    "Public figure",
    "Digital creator",
    "Personal blog",
    "Blogger",
    "Musician/band",
    "Artist",
    "Journalist",
    "Podcast",
  ].map((s) => s.toLowerCase()),
);

export function analyzeProfileSignals(profile: Profile): ProfileSignal {
  const bio = (profile.bio ?? "").trim();
  const category = (profile.niche ?? "").trim();
  const catLower = category.toLowerCase();

  const isBusinessAccount = category.length > 0;  // Ensembledata only populates niche when IG marks account as business
  const businessCategory = category || null;

  const bioCommercialHits: string[] = [];
  for (const p of BIO_COMMERCIAL_PATTERNS) {
    if (p.rx.test(bio)) bioCommercialHits.push(p.label);
  }

  const bioBrandOfficialHit = BIO_BRAND_OFFICIAL_RX.test(bio);

  // Score assembly
  let score = 0;
  const reasons: string[] = [];

  if (bioCommercialHits.length >= 2) {
    score += 35;
    reasons.push(`Bio explicitly commercial: "${bioCommercialHits.slice(0, 2).join('", "')}"`);
  } else if (bioCommercialHits.length === 1) {
    score += 18;
    reasons.push(`Bio hints at commercial intent: "${bioCommercialHits[0]}"`);
  }

  if (bioBrandOfficialHit) {
    score += 25;
    reasons.push(
      "Bio identifies this as an official / brand-owned account — first-party posts are commercial by default, not influencer paid content",
    );
  }

  if (isBusinessAccount) {
    if (COMMERCIAL_CATEGORIES.has(catLower)) {
      score += 30;
      reasons.push(
        `Category "${businessCategory}" is a direct-commerce vertical — commercial intent is baseline`,
      );
    } else if (CONTENT_CATEGORIES.has(catLower)) {
      score += 8;
      reasons.push(
        `Category "${businessCategory}" is a creator category — brand deals possible but not baseline commercial`,
      );
    } else if (businessCategory) {
      score += 10;
      reasons.push(`Business account (category: ${businessCategory}) — mild commercial prior`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    isBusinessAccount,
    businessCategory,
    bioCommercialHits,
    bioBrandOfficialHit,
    commercialIntentScore: score,
    reasons,
  };
}
