import type { MetadataRoute } from "next";
import { TOOLS } from "@/core/tools/registry";
import type { Platform } from "@/core/types";

// Sitemap.xml — served at /sitemap.xml. Next.js auto-registers this
// convention when the file is named sitemap.ts in the app root.
//
// Strategy:
//   - Homepage + all top-level static pages at high priority
//   - Every (platform × tool) landing page at medium priority — these
//     are the SEO-heavy pages targeting "instagram engagement rate
//     calculator", "tiktok fake follower checker" etc.
//   - Popular handle examples per platform to seed the crawler with
//     real result pages. Keep the list tight — Google penalises
//     over-inflated sitemaps.

const SITE_URL = "https://decodecreator.com";

// Curated seed handles per platform. Each is a well-known public
// creator/brand — safe to index. Adds ~30 pages to the sitemap; small
// enough to stay under any per-file limit.
const SEED_HANDLES: Record<Platform, string[]> = {
  instagram: ["mkbhd", "nike", "natgeo", "cristiano", "kyliejenner", "beyonce", "leomessi", "kimkardashian", "therock", "selenagomez"],
  tiktok: ["mrbeast", "khaby.lame", "charlidamelio", "bellapoerre", "willsmith", "gordonramsayofficial", "zachking", "billieeilish"],
  youtube: ["mrbeast", "mkbhd", "pewdiepie", "veritasium", "kurzgesagt", "linustechtips"],
};

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();
  const entries: MetadataRoute.Sitemap = [];

  // Top-level static pages
  const staticPages: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
    { path: "/", priority: 1.0, changeFrequency: "daily" },
    { path: "/discover", priority: 0.95, changeFrequency: "daily" },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
    { path: "/developer", priority: 0.9, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.4, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.4, changeFrequency: "monthly" },
    { path: "/refund", priority: 0.4, changeFrequency: "monthly" },
    { path: "/cookies", priority: 0.4, changeFrequency: "monthly" },
  ];
  for (const p of staticPages) {
    entries.push({
      url: `${SITE_URL}${p.path}`,
      lastModified: now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    });
  }

  // Tool × platform landing pages (SEO gold — target the "instagram
  // engagement rate calculator" queries)
  const platforms: Platform[] = ["instagram", "tiktok", "youtube"];
  for (const tool of TOOLS) {
    for (const platform of platforms) {
      if (!tool.platforms.includes(platform)) continue;
      const slug = tool.seo.slug ?? tool.id;
      // These pages have no /{platform}/{tool} static route today, but
      // /{platform}/{handle}/{tool} does — omit these landing-only
      // entries until a static /{platform}/tools/{slug} page ships.
      // For now include the deep-linked example URLs below instead.
      void slug;
    }
  }

  // Seeded example pages — one live result per popular handle. Great
  // for indexing because the page has real data and unique content.
  for (const platform of platforms) {
    for (const handle of SEED_HANDLES[platform]) {
      entries.push({
        url: `${SITE_URL}/${platform}/${encodeURIComponent(handle)}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7,
      });
      // Per-tool deep link for the top 3 tools per handle — the
      // long-tail queries "mkbhd engagement rate" etc.
      const topTools = ["engagement-rate-calculator", "real-follower-check", "audience-demographics"];
      for (const toolSlug of topTools) {
        entries.push({
          url: `${SITE_URL}/${platform}/${encodeURIComponent(handle)}/${toolSlug}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.5,
        });
      }
    }
  }

  return entries;
}
