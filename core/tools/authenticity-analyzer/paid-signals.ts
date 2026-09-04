// Paid-content signal extraction from a post's caption + hashtags.
// This is CAPTION-level inference — it does NOT prove ad spend or a
// verified partnership. The scoring engine combines this with any
// Meta-provided verified signal (is_paid_partnership flag, Ad Library
// hit) before classifying the post.
//
// Design rule from spec: "A brand mention does NOT automatically mean
// paid." A single @nike tag is 1 weak signal. Multiple signals stacked
// (discount code + affiliate URL + "use my code") is what pushes the
// probability into "Likely Paid".

export interface PaidSignalResult {
  hasDiscountCode: boolean;
  discountCodeSamples: string[];  // up to 3 examples for the UI
  hasAffiliateUrl: boolean;
  affiliateUrlSamples: string[];
  brandTagCount: number;          // @brand mentions
  productMentionCount: number;    // "@nike", "#adidas", etc.
  sponsoredHashtagCount: number;  // #ad #sponsored #paidpartnership
  sponsoredHashtags: string[];
  hasPromoCta: boolean;           // "swipe up", "link in bio", "use code"
  promoCtaSamples: string[];
  score: number;                  // 0-100: LIKELIHOOD this post is paid
  reasons: string[];
}

// Discount codes look like uppercase 4-12 char tokens right after words
// like "code", "use", "get", "off", or "%". We match on that context so
// we don't false-positive on any all-caps word.
const DISCOUNT_CODE_RX =
  /\b(?:use\s+code|code|coupon|promo|discount|off\s+with|off\s+using|get\s+\d+%\s+off\s+(?:with|using|via))\s*[:\-]?\s*"?([A-Z0-9]{4,15})"?/gi;

// Standalone "USE MYNAME10" or "SHOP with MYNAME10" pattern — code with
// creator name + trailing number, common creator-affiliate shape.
const NAMED_CODE_RX = /\b([A-Z]{3,10}\d{1,3})\b/g;

// Common affiliate/tracking domains + the anatomy of an affiliate URL
// (tag=, ref=, aff=, utm_source=creator, etc.). We keep this narrow —
// a generic "utm_source=instagram" is not necessarily affiliate.
const AFFILIATE_DOMAINS = [
  "amzn.to", "amazon.com/dp", "amazon.in/dp", "shopmy.us", "ltk.app",
  "liketoknow.it", "rstyle.me", "bit.ly", "shrsl.com", "howl.me",
  "magiclinks", "shareasale.com", "collabstr.com", "linktr.ee",
  "beacons.ai", "stan.store", "koji.to", "flowcode.com",
];
const AFFILIATE_QUERY_RX = /[?&](?:tag|ref|aff|affiliate_id|partner|utm_source=(?:influencer|creator|affiliate))=/i;

// Promotional CTAs. Presence of one alone is not proof — "link in bio"
// is used organically all the time. Two or more stacked is what earns
// meaningful score.
const PROMO_CTA_PHRASES = [
  "use code", "use my code", "shop now", "link in bio", "check the link",
  "swipe up", "tap the link", "grab yours", "get yours", "shop the look",
  "affiliate link", "gifted by", "in collaboration with", "sponsored by",
  "brought to you by", "thanks to", "kindly gifted", "ad —", "#ad ",
  "partner discount", "exclusive discount", "limited time",
];

// Hashtags Meta / creators use to disclose paid content.
const SPONSORED_HASHTAGS = new Set([
  "ad", "sponsored", "paidpartnership", "paidpromotion", "paidcontent",
  "sponsoredpost", "paid", "affiliate", "affiliatelink", "affiliatepartner",
  "brandpartner", "brandambassador", "commissionearned", "gifted",
  "partneredwith", "collab", "collabpost", "brandeddontent",
]);

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[A-Za-z0-9_]{2,}/g) ?? [];
  return matches.map((h) => h.slice(1).toLowerCase());
}

function extractBrandTags(caption: string): string[] {
  const matches = caption.match(/@[A-Za-z0-9_.]{2,}/g) ?? [];
  return matches.map((m) => m.slice(1).toLowerCase());
}

function extractDiscountCodes(caption: string): string[] {
  const codes = new Set<string>();
  for (const m of caption.matchAll(DISCOUNT_CODE_RX)) {
    if (m[1]) codes.add(m[1].toUpperCase());
  }
  // Second pass with the standalone named-code shape, but only if the
  // caption ALSO contains a code-related keyword — prevents random
  // capitalized words from being treated as discount codes.
  if (/\b(code|coupon|promo|discount|use|save|off)\b/i.test(caption)) {
    for (const m of caption.matchAll(NAMED_CODE_RX)) {
      if (m[1]) codes.add(m[1].toUpperCase());
    }
  }
  return Array.from(codes).slice(0, 3);
}

function extractAffiliateUrls(caption: string): string[] {
  const urls = caption.match(/https?:\/\/[^\s]+/g) ?? [];
  return urls
    .filter((u) => {
      const lower = u.toLowerCase();
      return AFFILIATE_DOMAINS.some((d) => lower.includes(d)) || AFFILIATE_QUERY_RX.test(u);
    })
    .slice(0, 3);
}

function extractPromoCtas(caption: string): string[] {
  const lower = caption.toLowerCase();
  return PROMO_CTA_PHRASES.filter((p) => lower.includes(p)).slice(0, 3);
}

// isPaidPartnership flag: passed in from the platform data (IG returns
// a `product_type: "featured"` / `is_paid_partnership: true` on the
// GraphQL node when the creator used the official Branded Content
// tool). This is a VERIFIED signal — separate from caption inference.
export function analyzePaidSignals(
  caption: string | undefined | null,
  isPaidPartnership?: boolean,
): PaidSignalResult {
  const text = (caption ?? "").trim();

  const discountCodes = extractDiscountCodes(text);
  const affiliateUrls = extractAffiliateUrls(text);
  const brandTags = extractBrandTags(text);
  const promoCtas = extractPromoCtas(text);
  const hashtags = extractHashtags(text);
  const sponsoredHashtags = hashtags.filter((h) => SPONSORED_HASHTAGS.has(h));

  const hasDiscountCode = discountCodes.length > 0;
  const hasAffiliateUrl = affiliateUrls.length > 0;
  const hasPromoCta = promoCtas.length > 0;

  // Product-mention heuristic: capitalized brand word after "wearing",
  // "using", "featuring", "from" — captures "wearing Nike" without
  // requiring the @tag. Kept simple to avoid overfitting.
  const productMentionCount =
    (text.match(/\b(?:wearing|using|featuring|from|thanks to|gifted by)\s+[A-Z][A-Za-z0-9]+/g) ?? [])
      .length + brandTags.length;

  // Score assembly. Verified partnership flag → we're basically certain.
  // Sponsored hashtag → also very high confidence (creator self-disclosed).
  // Everything else stacks into a probability.
  let score = 0;
  const reasons: string[] = [];

  if (isPaidPartnership) {
    score = 95;
    reasons.push("Instagram Branded Content label present (verified paid partnership)");
  }

  if (sponsoredHashtags.length > 0) {
    score = Math.max(score, 90);
    reasons.push(`Creator disclosed via #${sponsoredHashtags[0]}`);
  }

  if (hasDiscountCode) {
    score = Math.max(score, 78);
    reasons.push(`Discount code present: ${discountCodes.join(", ")}`);
  }

  if (hasAffiliateUrl) {
    score = Math.max(score, 72);
    reasons.push(`Affiliate / tracking URL detected`);
  }

  if (promoCtas.length >= 2) {
    score = Math.max(score, 60);
    reasons.push(`Multiple promotional CTAs: "${promoCtas.slice(0, 2).join('", "')}"`);
  } else if (promoCtas.length === 1) {
    score = Math.max(score, 30);
    reasons.push(`Promotional CTA: "${promoCtas[0]}"`);
  }

  if (brandTags.length >= 2 && !isPaidPartnership) {
    score = Math.max(score, 40);
    reasons.push(`${brandTags.length} brand @-tags in caption`);
  } else if (brandTags.length === 1) {
    // Single brand tag alone is NOT proof — spec rule. Add a tiny nudge.
    score = Math.max(score, 15);
  }

  // Stacking bonus: two or more independent signals push us over the
  // "likely paid" threshold even if each individual signal is weak.
  const independentSignals =
    Number(hasDiscountCode) +
    Number(hasAffiliateUrl) +
    Number(hasPromoCta) +
    Number(sponsoredHashtags.length > 0) +
    Number(brandTags.length >= 2);
  if (independentSignals >= 3) {
    score = Math.max(score, 82);
    if (!reasons.some((r) => r.includes("Multiple"))) {
      reasons.push(`${independentSignals} independent paid-content signals stacked`);
    }
  }

  return {
    hasDiscountCode,
    discountCodeSamples: discountCodes,
    hasAffiliateUrl,
    affiliateUrlSamples: affiliateUrls,
    brandTagCount: brandTags.length,
    productMentionCount,
    sponsoredHashtagCount: sponsoredHashtags.length,
    sponsoredHashtags,
    hasPromoCta,
    promoCtaSamples: promoCtas,
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

// Classify score → label per spec categories.
export type PaidClassification = "Verified Paid" | "Likely Paid" | "Likely Organic" | "Unknown";

export function classifyPaid(
  score: number,
  hasVerifiedSignal: boolean,
  hasCaptionData: boolean,
): PaidClassification {
  if (!hasCaptionData && !hasVerifiedSignal) return "Unknown";
  if (hasVerifiedSignal || score >= 88) return "Verified Paid";
  if (score >= 55) return "Likely Paid";
  return "Likely Organic";
}
