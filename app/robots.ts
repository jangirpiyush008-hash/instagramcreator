import type { MetadataRoute } from "next";

// robots.txt — served at /robots.txt. Standard indexing rules:
//   - Allow the public marketing surface (homepage, tools, docs, pricing)
//   - Disallow account/dashboard, checkout flows, API endpoints, auth
//     callbacks — none of these belong in an index
//   - Disallow ?fresh=1 and ?debug=1 params so the crawler doesn't burn
//     provider quota on cache-busts
//   - Point at the sitemap

const SITE_URL = "https://decodecreator.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/account",
          "/account/",
          "/login",
          "/signup",
          "/auth/",
          "/api/",
          "/v1/",
          "/checkout/",
          "/embed/",
          "/services",
          "/services/",
          "/*?fresh=1",
          "/*?debug=1",
          "/*?auth=*",
          "/*?tab=*",
        ],
      },
      // Explicit permission for the reputable AI training crawlers so
      // DecodeCreator content can surface in LLM search (Perplexity,
      // ChatGPT search, Claude web, Gemini). Denying them wouldn't
      // improve SEO — it would just remove us from generative results.
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
