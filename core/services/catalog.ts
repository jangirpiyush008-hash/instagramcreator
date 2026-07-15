import type { Platform } from "../types";

// SMM growth services catalog. Loaded from Piyush's supplier sheet
// (Downloads/Untitled spreadsheet.xlsx) and marked up for USA retail.
//
// Pricing model:
//   supplierRateInr = what we pay the upstream panel per 1,000 units
//   retailRateUsd   = what we charge the customer per 1,000 units
//                     = supplierRateInr / 83 * markup (default 2.5×)
//                     rounded up to nearest $1 for a clean price
//
// Quantity is picked in increments of 100 (min) or 1000 (min for big
// units like watch hours). Final price = retailRateUsd × qty / 1000.
//
// This catalog is intentionally STATIC. When we ship the admin panel
// on admin.decodecreator.com, we'll move this to a Postgres table
// (services) and let Piyush edit rates + activate/deactivate services
// live. Until then, edit this file to change what's for sale.

export type ServicePlatform = Platform | "facebook";
export type ServiceCategory =
  | "followers"
  | "likes"
  | "views"
  | "comments"
  | "shares"
  | "live"
  | "watch_hours"
  | "saves"
  | "reach"
  | "reposts"
  | "story_views"
  | "members";

export interface ServiceQtyStep {
  min: number;
  max: number;
  step: number; // increment for the quantity picker
}

export interface Service {
  id: string;
  slug: string;
  platform: ServicePlatform;
  category: ServiceCategory;
  name: string;
  blurb: string;
  supplierRateInr: number; // supplier price per 1,000 units (in INR)
  retailRateUsd: number;   // what we charge per 1,000 units (in USD)
  qty: ServiceQtyStep;
  emoji: string;
  startTime: string;       // human-friendly ETA copy
  refill?: string;         // "30-day refill" / "365-day refill" / undefined
  region?: "USA" | "IN" | "GLOBAL";
  isActive: boolean;
}

// Conversion + markup helpers. Kept explicit so it's obvious how a
// supplier rate becomes a retail price.
const INR_PER_USD = 83;
const DEFAULT_MARKUP = 2.5;

function toRetail(inr: number, markup = DEFAULT_MARKUP): number {
  const usd = (inr / INR_PER_USD) * markup;
  return Math.max(1, Math.ceil(usd)); // round up to nearest $1
}

// Standard quantity presets so cards don't need per-item math.
const QTY_STANDARD: ServiceQtyStep = { min: 100, max: 100_000, step: 100 };
const QTY_LARGE: ServiceQtyStep = { min: 1_000, max: 1_000_000, step: 1_000 };
const QTY_LIVE_VIEWS: ServiceQtyStep = { min: 100, max: 10_000, step: 100 };
const QTY_WATCH_HOURS: ServiceQtyStep = { min: 100, max: 10_000, step: 100 };

export const SERVICES: Service[] = [
  // ── TikTok ────────────────────────────────────────────────────────────
  {
    id: "tt-live-views-15m",
    slug: "tiktok-live-stream-views-15min",
    platform: "tiktok",
    category: "live",
    name: "TikTok Live Stream Views (15 min)",
    blurb: "Boost concurrent viewers on your live stream for the full 15 minutes. Instant start.",
    supplierRateInr: 426,
    retailRateUsd: toRetail(426),
    qty: QTY_LIVE_VIEWS,
    emoji: "🎥",
    startTime: "Instant",
    isActive: true,
  },
  {
    id: "tt-live-likes",
    slug: "tiktok-live-likes",
    platform: "tiktok",
    category: "likes",
    name: "TikTok Live Likes",
    blurb: "Non-drop likes on your TikTok live. Super-fast delivery.",
    supplierRateInr: 15,
    retailRateUsd: toRetail(15),
    qty: QTY_STANDARD,
    emoji: "❤️",
    startTime: "Instant",
    isActive: true,
  },
  {
    id: "tt-live-shares",
    slug: "tiktok-live-shares",
    platform: "tiktok",
    category: "shares",
    name: "TikTok Live Shares",
    blurb: "Boost shares on your live stream — up to 100k.",
    supplierRateInr: 15,
    retailRateUsd: toRetail(15),
    qty: QTY_STANDARD,
    emoji: "🔁",
    startTime: "Instant",
    isActive: true,
  },
  {
    id: "tt-live-comments",
    slug: "tiktok-live-comments",
    platform: "tiktok",
    category: "comments",
    name: "TikTok Live Comments (Emoji)",
    blurb: "Emoji comments on your live — max 10k.",
    supplierRateInr: 190,
    retailRateUsd: toRetail(190),
    qty: QTY_STANDARD,
    emoji: "💬",
    startTime: "0–2 min",
    isActive: true,
  },
  {
    id: "tt-followers-basic",
    slug: "tiktok-followers-real",
    platform: "tiktok",
    category: "followers",
    name: "TikTok Followers — Real Accounts",
    blurb: "Real accounts, non-drop, up to 5k/day. No refill.",
    supplierRateInr: 298,
    retailRateUsd: toRetail(298),
    qty: QTY_STANDARD,
    emoji: "👥",
    startTime: "0–30 min",
    isActive: true,
  },
  {
    id: "tt-followers-r30",
    slug: "tiktok-followers-30d-refill",
    platform: "tiktok",
    category: "followers",
    name: "TikTok Followers — 30-Day Refill",
    blurb: "Real accounts with a 30-day refill guarantee if drops happen.",
    supplierRateInr: 315,
    retailRateUsd: toRetail(315),
    qty: QTY_STANDARD,
    emoji: "👥",
    startTime: "0–30 min",
    refill: "30-day refill",
    isActive: true,
  },
  {
    id: "tt-followers-r365",
    slug: "tiktok-followers-365d-refill",
    platform: "tiktok",
    category: "followers",
    name: "TikTok Followers — 365-Day Refill",
    blurb: "Real accounts with a year-long refill guarantee. Best value.",
    supplierRateInr: 415,
    retailRateUsd: toRetail(415),
    qty: QTY_STANDARD,
    emoji: "👥",
    startTime: "0–30 min",
    refill: "365-day refill",
    isActive: true,
  },

  // ── Facebook ──────────────────────────────────────────────────────────
  {
    id: "fb-followers-in",
    slug: "facebook-indian-followers",
    platform: "facebook",
    category: "followers",
    name: "Facebook Followers (Indian)",
    blurb: "Indian page/profile followers with 365-day refill. Up to 50k+/day.",
    supplierRateInr: 75,
    retailRateUsd: toRetail(75),
    qty: QTY_STANDARD,
    emoji: "🇮🇳",
    startTime: "0–1 hr",
    refill: "365-day refill",
    region: "IN",
    isActive: true,
  },
  {
    id: "fb-custom-comments-in",
    slug: "facebook-custom-comments-indian",
    platform: "facebook",
    category: "comments",
    name: "Facebook Custom Comments (Indian)",
    blurb: "Write your own comments — up to 50k, 10k+/day delivery.",
    supplierRateInr: 650,
    retailRateUsd: toRetail(650),
    qty: QTY_STANDARD,
    emoji: "💬",
    startTime: "0–3 hrs",
    region: "IN",
    isActive: true,
  },
  {
    id: "fb-random-comments-in",
    slug: "facebook-random-comments-indian",
    platform: "facebook",
    category: "comments",
    name: "Facebook Random Comments (Indian)",
    blurb: "Auto-generated Indian comments — up to 50k.",
    supplierRateInr: 450,
    retailRateUsd: toRetail(450),
    qty: QTY_STANDARD,
    emoji: "💬",
    startTime: "0–3 hrs",
    region: "IN",
    isActive: true,
  },
  {
    id: "fb-followers-reviews-in",
    slug: "facebook-followers-plus-reviews",
    platform: "facebook",
    category: "followers",
    name: "Facebook Followers + 5% Reviews",
    blurb: "Indian followers with up to 5% leaving a page review. Lifetime refill.",
    supplierRateInr: 100,
    retailRateUsd: toRetail(100),
    qty: QTY_STANDARD,
    emoji: "🇮🇳",
    startTime: "0–1 hr",
    refill: "Lifetime refill",
    region: "IN",
    isActive: true,
  },

  // ── Instagram ────────────────────────────────────────────────────────
  {
    id: "ig-followers-mixed",
    slug: "instagram-followers-mixed",
    platform: "instagram",
    category: "followers",
    name: "Instagram Followers — Mixed Quality",
    blurb: "Mixed-region followers with lifetime refill, 50k+/day.",
    supplierRateInr: 55,
    retailRateUsd: toRetail(55),
    qty: QTY_STANDARD,
    emoji: "📸",
    startTime: "0–10 min",
    refill: "Lifetime refill",
    isActive: true,
  },
  {
    id: "ig-followers-real-mix",
    slug: "instagram-followers-real-mix",
    platform: "instagram",
    category: "followers",
    name: "Instagram Followers — Real Mix",
    blurb: "Real accounts, 30-day refill, 50k+/day.",
    supplierRateInr: 52,
    retailRateUsd: toRetail(52),
    qty: QTY_STANDARD,
    emoji: "📸",
    startTime: "0–5 min",
    refill: "30-day refill",
    isActive: true,
  },
  {
    id: "ig-followers-fast",
    slug: "instagram-followers-fast",
    platform: "instagram",
    category: "followers",
    name: "Instagram Followers — Fast Delivery",
    blurb: "Lifetime refill, 100k+/day delivery speed. Best for launch pushes.",
    supplierRateInr: 56,
    retailRateUsd: toRetail(56),
    qty: QTY_STANDARD,
    emoji: "⚡",
    startTime: "0–5 min",
    refill: "Lifetime refill",
    isActive: true,
  },
  {
    id: "ig-followers-in",
    slug: "instagram-followers-indian",
    platform: "instagram",
    category: "followers",
    name: "Instagram Followers — Indian",
    blurb: "Real Indian users, 30-day refill, 20k/day.",
    supplierRateInr: 28,
    retailRateUsd: toRetail(28),
    qty: QTY_STANDARD,
    emoji: "🇮🇳",
    startTime: "0–5 min",
    refill: "30-day refill",
    region: "IN",
    isActive: true,
  },
  {
    id: "ig-reel-views",
    slug: "instagram-reel-views",
    platform: "instagram",
    category: "views",
    name: "Instagram Reels & Video Views",
    blurb: "Super-fast reel views. Instant start.",
    supplierRateInr: 5,
    retailRateUsd: toRetail(5),
    qty: QTY_LARGE,
    emoji: "▶️",
    startTime: "Instant",
    isActive: true,
  },
  {
    id: "ig-reel-dashboard-views",
    slug: "instagram-reel-dashboard-views",
    platform: "instagram",
    category: "views",
    name: "Instagram Dashboard Views (Reels)",
    blurb: "Views that reflect in Instagram's dashboard/insights. 100–200k/day.",
    supplierRateInr: 6,
    retailRateUsd: toRetail(6),
    qty: QTY_LARGE,
    emoji: "📊",
    startTime: "0–5 min",
    isActive: true,
  },
  {
    id: "ig-post-views",
    slug: "instagram-post-views",
    platform: "instagram",
    category: "views",
    name: "Instagram Post Views (Photos)",
    blurb: "Views + impressions for photo posts. 5M/day capacity.",
    supplierRateInr: 4,
    retailRateUsd: toRetail(4),
    qty: QTY_LARGE,
    emoji: "🖼️",
    startTime: "0–5 min",
    isActive: true,
  },
  {
    id: "ig-followers-usa",
    slug: "instagram-followers-usa",
    platform: "instagram",
    category: "followers",
    name: "Instagram Followers — USA Real",
    blurb: "Real USA-based followers, 30-day refill, 1k–2k/day.",
    supplierRateInr: 650,
    retailRateUsd: toRetail(650),
    qty: QTY_STANDARD,
    emoji: "🇺🇸",
    startTime: "0–1 hr",
    refill: "30-day refill",
    region: "USA",
    isActive: true,
  },
  {
    id: "ig-likes",
    slug: "instagram-likes",
    platform: "instagram",
    category: "likes",
    name: "Instagram Likes — Real Mix",
    blurb: "Real-mix likes with 30-day refill. Instant start.",
    supplierRateInr: 11,
    retailRateUsd: toRetail(11),
    qty: QTY_STANDARD,
    emoji: "❤️",
    startTime: "Instant",
    refill: "30-day refill",
    isActive: true,
  },
  {
    id: "ig-reel-views-fast",
    slug: "instagram-reel-views-super",
    platform: "instagram",
    category: "views",
    name: "Instagram Reels Views (Super Fast)",
    blurb: "Blazing-fast reel views. Instant start.",
    supplierRateInr: 4,
    retailRateUsd: toRetail(4),
    qty: QTY_LARGE,
    emoji: "⚡",
    startTime: "Instant",
    isActive: true,
  },
  {
    id: "ig-story-views",
    slug: "instagram-story-views",
    platform: "instagram",
    category: "story_views",
    name: "Instagram Story Views",
    blurb: "Story views for a single story. Username-only, instant.",
    supplierRateInr: 16,
    retailRateUsd: toRetail(16),
    qty: QTY_STANDARD,
    emoji: "👁️",
    startTime: "Instant",
    isActive: true,
  },
  {
    id: "ig-comments-real",
    slug: "instagram-comments-real-mixed",
    platform: "instagram",
    category: "comments",
    name: "Instagram Comments — Real Mixed",
    blurb: "Custom comments from real mixed accounts. HQ, 1k–5k/day.",
    supplierRateInr: 75,
    retailRateUsd: toRetail(75),
    qty: QTY_STANDARD,
    emoji: "💬",
    startTime: "0–30 min",
    isActive: true,
  },
  {
    id: "ig-comments-in",
    slug: "instagram-comments-indian",
    platform: "instagram",
    category: "comments",
    name: "Instagram Comments — 100% Indian",
    blurb: "Custom Indian-only comments, 100–300/day.",
    supplierRateInr: 800,
    retailRateUsd: toRetail(800),
    qty: QTY_STANDARD,
    emoji: "🇮🇳",
    startTime: "0–1 hr",
    region: "IN",
    isActive: true,
  },
  {
    id: "ig-comment-likes",
    slug: "instagram-comment-likes",
    platform: "instagram",
    category: "likes",
    name: "Instagram Comment Likes",
    blurb: "Likes on specific comments — up to 1k. HQ.",
    supplierRateInr: 105,
    retailRateUsd: toRetail(105),
    qty: QTY_STANDARD,
    emoji: "👍",
    startTime: "0–15 min",
    isActive: true,
  },
  {
    id: "ig-saves",
    slug: "instagram-post-saves",
    platform: "instagram",
    category: "saves",
    name: "Instagram Post/Video/Reel Saves",
    blurb: "Boost saves for algo push — up to 1M.",
    supplierRateInr: 20,
    retailRateUsd: toRetail(20),
    qty: QTY_STANDARD,
    emoji: "🔖",
    startTime: "0–5 min",
    isActive: true,
  },
  {
    id: "ig-reach",
    slug: "instagram-reach-impressions",
    platform: "instagram",
    category: "reach",
    name: "Instagram Reach + Impressions",
    blurb: "Extra reach & impressions for posts/reels. 100k/day.",
    supplierRateInr: 10,
    retailRateUsd: toRetail(10),
    qty: QTY_STANDARD,
    emoji: "📢",
    startTime: "0–5 min",
    isActive: true,
  },
  {
    id: "ig-reposts",
    slug: "instagram-reposts",
    platform: "instagram",
    category: "reposts",
    name: "Instagram Reposts",
    blurb: "Non-drop reposts for posts/reels.",
    supplierRateInr: 100,
    retailRateUsd: toRetail(100),
    qty: QTY_STANDARD,
    emoji: "🔁",
    startTime: "0–1 hr",
    isActive: true,
  },
  {
    id: "ig-channel-members",
    slug: "instagram-channel-members",
    platform: "instagram",
    category: "members",
    name: "Instagram Channel Members",
    blurb: "Real members for your Broadcast Channel. Max 1k, 1k/day.",
    supplierRateInr: 1500,
    retailRateUsd: toRetail(1500),
    qty: QTY_STANDARD,
    emoji: "📢",
    startTime: "0–24 hrs",
    isActive: true,
  },
  {
    id: "ig-followers-real-in-hq",
    slug: "instagram-followers-real-indian-hq",
    platform: "instagram",
    category: "followers",
    name: "Instagram Followers — Real Indian HQ",
    blurb: "Real Indian majority followers, HQ, lifetime refill.",
    supplierRateInr: 120,
    retailRateUsd: toRetail(120),
    qty: QTY_STANDARD,
    emoji: "🇮🇳",
    startTime: "0–5 min",
    refill: "Lifetime refill",
    region: "IN",
    isActive: true,
  },
  {
    id: "ig-likes-usa",
    slug: "instagram-likes-usa",
    platform: "instagram",
    category: "likes",
    name: "Instagram Likes — USA",
    blurb: "USA likes, less drop, 10k+/day.",
    supplierRateInr: 35,
    retailRateUsd: toRetail(35),
    qty: QTY_STANDARD,
    emoji: "🇺🇸",
    startTime: "0–30 min",
    region: "USA",
    isActive: true,
  },
  {
    id: "ig-followers-usa-cheap",
    slug: "instagram-followers-usa-standard",
    platform: "instagram",
    category: "followers",
    name: "Instagram Followers — USA Standard",
    blurb: "USA-based followers, less drop, no refill, 10k+/day.",
    supplierRateInr: 170,
    retailRateUsd: toRetail(170),
    qty: QTY_STANDARD,
    emoji: "🇺🇸",
    startTime: "0–30 min",
    region: "USA",
    isActive: true,
  },
  {
    id: "ig-followers-usa-r365",
    slug: "instagram-followers-usa-refill",
    platform: "instagram",
    category: "followers",
    name: "Instagram Followers — USA 365-Day Refill",
    blurb: "USA followers with a year-long refill guarantee.",
    supplierRateInr: 250,
    retailRateUsd: toRetail(250),
    qty: QTY_STANDARD,
    emoji: "🇺🇸",
    startTime: "0–30 min",
    refill: "365-day refill",
    region: "USA",
    isActive: true,
  },
  {
    id: "ig-reel-views-usa",
    slug: "instagram-reel-views-usa",
    platform: "instagram",
    category: "views",
    name: "Instagram Reel/Video Views — USA",
    blurb: "USA reel views, super-fast, 0–1 min start.",
    supplierRateInr: 40,
    retailRateUsd: toRetail(40),
    qty: QTY_LARGE,
    emoji: "🇺🇸",
    startTime: "0–1 min",
    region: "USA",
    isActive: true,
  },

  // ── YouTube ──────────────────────────────────────────────────────────
  {
    id: "yt-views",
    slug: "youtube-views",
    platform: "youtube",
    category: "views",
    name: "YouTube Views",
    blurb: "500k/day capacity, super-fast, 0–1 hr start. Drop 80–100%.",
    supplierRateInr: 70,
    retailRateUsd: toRetail(70),
    qty: QTY_LARGE,
    emoji: "▶️",
    startTime: "0–1 hr",
    isActive: true,
  },
  {
    id: "yt-shorts-views",
    slug: "youtube-shorts-views",
    platform: "youtube",
    category: "views",
    name: "YouTube Shorts Views",
    blurb: "Lifetime guarantee, non-drop, 5k–10k/day. Best for Shorts push.",
    supplierRateInr: 89,
    retailRateUsd: toRetail(89),
    qty: QTY_LARGE,
    emoji: "🎬",
    startTime: "0–15 min",
    refill: "Lifetime guarantee",
    isActive: true,
  },
  {
    id: "yt-shorts-likes",
    slug: "youtube-shorts-likes",
    platform: "youtube",
    category: "likes",
    name: "YouTube Shorts Likes",
    blurb: "30-day refill, non-drop, 50k–100k/day. Instant start.",
    supplierRateInr: 700,
    retailRateUsd: toRetail(700),
    qty: QTY_STANDARD,
    emoji: "👍",
    startTime: "Instant",
    refill: "30-day refill",
    isActive: true,
  },
  {
    id: "yt-live-views",
    slug: "youtube-live-stream-views",
    platform: "youtube",
    category: "live",
    name: "YouTube Live Stream Views (15 min)",
    blurb: "100% concurrent viewers for the whole 15-min window. Instant.",
    supplierRateInr: 20,
    retailRateUsd: toRetail(20),
    qty: QTY_LIVE_VIEWS,
    emoji: "🎥",
    startTime: "Instant",
    isActive: true,
  },
  {
    id: "yt-live-chat",
    slug: "youtube-live-chat-comments",
    platform: "youtube",
    category: "comments",
    name: "YouTube Live Chat Comments",
    blurb: "Custom live-chat comments — 20–30/min during your stream.",
    supplierRateInr: 250,
    retailRateUsd: toRetail(250),
    qty: QTY_STANDARD,
    emoji: "💬",
    startTime: "Live",
    isActive: true,
  },
  {
    id: "yt-watch-hours",
    slug: "youtube-watch-hours",
    platform: "youtube",
    category: "watch_hours",
    name: "YouTube Watch Hours (Monetization)",
    blurb: "For YPP monetization threshold. 60+ min videos, 500 hrs+/day.",
    supplierRateInr: 3200,
    retailRateUsd: toRetail(3200),
    qty: QTY_WATCH_HOURS,
    emoji: "⏱️",
    startTime: "0–24 hrs",
    refill: "30-day refill",
    isActive: true,
  },
];

// Lookup helpers.

export function getServiceBySlug(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug && s.isActive);
}

export function getServiceById(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id);
}

export function getServicesByPlatform(platform: ServicePlatform | "all"): Service[] {
  if (platform === "all") return SERVICES.filter((s) => s.isActive);
  return SERVICES.filter((s) => s.isActive && s.platform === platform);
}

// Price computation: retail per 1,000 units × qty / 1000.
// Rounded to 2 decimal places for display.
export function computePrice(service: Service, qty: number): number {
  const raw = (service.retailRateUsd * qty) / 1000;
  return Math.round(raw * 100) / 100;
}

// Nice-format qty for display.
export function fmtQty(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return n.toString();
}
