import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { Suspense } from "react";
import { ThemeToggle } from "@/web/components/ThemeToggle";
import { AuthModal } from "@/web/components/AuthModal";
import { CookieBanner, CookiePreferencesLink } from "@/web/components/CookieBanner";
import { GAPageview } from "@/web/components/GAPageview";
import { getCurrentUser } from "@/web/lib/supabase-server";
import { CartProvider } from "@/web/components/services/CartContext";

// Google Analytics 4 measurement ID. Public by design — appears in
// the rendered HTML on every visit. Wired to fire in Consent Mode v2
// mode: defaults to denied (set inline in <head> below), granted
// only after the user opts in via CookieBanner.
const GA_MEASUREMENT_ID = "G-8ENDR3SQJE";

// JSON-LD structured data. Fed to Google (rich results), Bing, and
// LLM search engines. All schema.org types. Kept as a single ld+json
// blob per Google's guidance for multi-entity pages.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://decodecreator.com/#organization",
      name: "DecodeCreator",
      url: "https://decodecreator.com",
      logo: "https://decodecreator.com/icon.png",
      description:
        "Public-data analytics for Instagram, TikTok, and YouTube accounts. Built for creators, brands, and agencies.",
      email: "support.decodecreator@gmail.com",
      sameAs: [] as string[],
    },
    {
      "@type": "WebSite",
      "@id": "https://decodecreator.com/#website",
      url: "https://decodecreator.com",
      name: "DecodeCreator",
      publisher: { "@id": "https://decodecreator.com/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate:
            "https://decodecreator.com/instagram/{search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://decodecreator.com/#app",
      name: "DecodeCreator",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Social Media Analytics",
      operatingSystem: "Web",
      url: "https://decodecreator.com",
      offers: [
        {
          "@type": "Offer",
          name: "Free tier",
          price: "0",
          priceCurrency: "USD",
          description: "2 free scans per day, no card required",
        },
        {
          "@type": "Offer",
          name: "Starter (monthly)",
          price: "9",
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Pro (monthly)",
          price: "29",
          priceCurrency: "USD",
        },
      ],
      featureList: [
        "Instagram engagement rate calculator",
        "TikTok engagement rate calculator",
        "YouTube channel analytics",
        "Fake follower detection",
        "Audience demographics (age + gender)",
        "Shadowban checker",
        "Follower growth trend",
        "Unfollower tracker",
        "Earnings estimator",
        "Bulk media downloader",
        "Giveaway comment picker",
        "Public REST API with wallet-based credit metering",
      ],
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.7",
        reviewCount: "53",
        bestRating: "5",
        worstRating: "1",
      },
    },
    {
      "@type": "FAQPage",
      "@id": "https://decodecreator.com/#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is DecodeCreator free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes — every visitor gets 2 free scans per day with no card required. Paid tiers start at ₹499/month (about $6/month) for higher quotas and more tools. The API is credit-based with a ₹500 minimum top-up.",
          },
        },
        {
          "@type": "Question",
          name: "How is DecodeCreator different from HypeAuditor, Modash, or Iconosquare?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Three differences: (1) transparent per-scan credit pricing — no 'contact sales for a quote'; (2) wallet credits valid for 12 months per top-up with no early expiry; (3) Instagram + TikTok + YouTube in one dashboard, not just Instagram. Honest signals — if a metric is inferred rather than measured, we tell you.",
          },
        },
        {
          "@type": "Question",
          name: "Does the scanned account know I'm looking at their profile?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. DecodeCreator only reads public data through licensed provider APIs. Nothing follows, DMs, likes, or leaves any trace on the source account. The scanned user is never notified.",
          },
        },
        {
          "@type": "Question",
          name: "Can I check private Instagram or TikTok accounts?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Private accounts return a 'private' response — we do not attempt to bypass any platform's privacy settings. This is a strict rule; we won't help circumvent an account block.",
          },
        },
        {
          "@type": "Question",
          name: "How accurate is the fake-follower check?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "It's a sampled, signal-based estimate. We look at follower activity patterns, profile completeness, engagement authenticity, and other public signals. Where the estimate is uncertain we say so — no 'AI-powered' claims where a heuristic is doing the work.",
          },
        },
        {
          "@type": "Question",
          name: "Is there a REST API I can integrate?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. GET https://decodecreator.com/v1/scan/{platform}/{handle}?tool={toolId} with an x-api-key header. Credits are metered per call and refunded on failure. Full docs at /docs.",
          },
        },
      ],
    },
  ],
};

// Rich, keyword-loaded metadata — this is where 80% of SEO
// value lives. Title template propagates to child pages so
// e.g. /pricing becomes "Pricing — DecodeCreator". Keywords are a
// weak signal for Google but strong for Bing/DuckDuckGo/Yandex and
// (increasingly) LLM search engines that scrape meta tags.
export const metadata: Metadata = {
  title: {
    default:
      "DecodeCreator — Instagram, TikTok & YouTube Analytics Tool | Free Engagement Rate, Fake Follower Check, Audience Demographics",
    template: "%s | DecodeCreator",
  },
  description:
    "Free Instagram, TikTok & YouTube analytics for creators, brands & agencies. Check engagement rate, fake followers, audience demographics (age + gender), shadowban status, growth trend, and earnings — for any public @handle. Public data only. HypeAuditor / Modash / Iconosquare alternative with wallet credits that don't expire.",
  metadataBase: new URL("https://decodecreator.com"),
  keywords: [
    // Core intent
    "instagram engagement rate calculator",
    "tiktok engagement rate calculator",
    "youtube analytics tool",
    "instagram audit tool",
    "check fake followers instagram",
    "fake follower checker tiktok",
    "instagram audience demographics",
    "instagram shadowban checker",
    "instagram follower quality",
    "influencer analytics tool",
    "influencer vetting tool",
    "creator analytics dashboard",
    "instagram profile analyzer",
    "tiktok profile analyzer",
    "youtube channel analytics free",
    "youtube shorts analytics",
    "instagram engagement benchmark",
    "instagram follower growth tracker",
    "unfollower tracker instagram",
    "earnings estimator instagram",
    "influencer earnings calculator",
    "instagram audience age gender",
    "instagram bulk download",
    "youtube video downloader",
    "giveaway comment picker",
    "banned hashtag checker",
    "instagram username checker",
    "instagram api",
    "tiktok api",
    "youtube data api",
    // Competitor / alternative queries (high-intent commercial searches)
    "hypeauditor alternative",
    "modash alternative",
    "iconosquare alternative",
    "social blade alternative",
    "phlanx alternative",
    "ninja outreach alternative",
    "later alternative for analytics",
    "sprout social alternative",
    "hikerapi alternative",
    "gramscraper alternative",
    "klear alternative",
    "grin alternative",
    "creator iq alternative",
    "upfluence alternative",
    "heepsy alternative",
    "influencity alternative",
    // Long-tail
    "how to check instagram engagement rate",
    "how to detect fake followers on instagram",
    "how to check if account is shadowbanned",
    "instagram engagement rate by follower size",
    "average engagement rate instagram 2026",
    "influencer marketing analytics platform",
    "creator earnings per post calculator",
  ],
  authors: [{ name: "DecodeCreator", url: "https://decodecreator.com/about" }],
  creator: "DecodeCreator",
  publisher: "DecodeCreator",
  category: "SaaS Analytics",
  alternates: {
    canonical: "https://decodecreator.com",
  },
  openGraph: {
    title:
      "DecodeCreator — Instagram, TikTok & YouTube Analytics for Creators, Brands & Agencies",
    description:
      "Free public-data analytics: engagement rate, fake follower check, audience demographics, shadowban signals, earnings estimate. All 3 platforms in one dashboard.",
    url: "https://decodecreator.com",
    siteName: "DecodeCreator",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DecodeCreator — IG / TikTok / YouTube analytics for public accounts",
    description:
      "Engagement rate, fake follower check, audience demographics, shadowban signals — for any public handle. Free tier + credit-based API.",
    creator: "@decodecreator",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  formatDetection: {
    email: false,
    telephone: false,
  },
  applicationName: "DecodeCreator",
  referrer: "origin-when-cross-origin",
};

// Two theme-color entries so browser chrome (address bar, status bar)
// matches whichever theme is active.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a12" },
  ],
};

// Runs BEFORE React hydrates. Reads the persisted theme (or the OS
// preference on first visit) and stamps `.dark` on <html> so we never
// flash the wrong palette. Kept inline — a separate <script src=> would
// be a network round-trip against the whole point.
const themeInitScript = `
(function () {
  try {
    var s = window.localStorage.getItem('theme');
    var t = s === 'dark' || s === 'light'
      ? s
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (_) {}
})();
`;

// Google Consent Mode v2 defaults. Must fire BEFORE any gtag.js loads
// so Google's tags see "denied" until the CookieBanner (or a stored
// choice replay) updates the consent. We set dataLayer + gtag inline
// so this survives without next/script coming to the rescue.
const consentDefaultsScript = `
window.dataLayer = window.dataLayer || [];
function gtag(){ window.dataLayer.push(arguments); }
window.gtag = window.gtag || gtag;
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'granted',
  security_storage: 'granted',
  wait_for_update: 500
});
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Cheap session check so the logo can point to /account (dashboard)
  // for signed-in users and / (homepage) for everyone else. Also
  // hides the Sign in / Start Trial buttons when the user is already
  // authenticated — they'd otherwise re-trigger the auth modal.
  const currentUser = await getCurrentUser().catch(() => null);
  const isSignedIn = !!currentUser;
  const logoHref = isSignedIn ? "/account" : "/";
  return (
    <html lang="en">
      <head>
        {/*
          Order matters: consent defaults must run BEFORE any gtag.js
          loads elsewhere on the page (headers, third-party scripts).
          Keeping it above the theme script — theme has no dependency
          on ad libs and gtag would race if we put ad libs first.
        */}
        <script dangerouslySetInnerHTML={{ __html: consentDefaultsScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/*
          JSON-LD structured data. Fed to Google (Organization card,
          FAQ rich results, sitelink search box) + LLM search engines.
          Single blob keeps Google's parser happy; the @graph array
          holds multiple entities.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>
        <CartProvider>
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border/60">
            <div className="container py-4 flex items-center justify-between">
              <Link href={logoHref} className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="h-7 w-7 rounded-lg bg-gradient-ig" aria-hidden />
                <span>DecodeCreator</span>
              </Link>
              <nav className="text-sm flex items-center gap-2 sm:gap-3">
                {/*
                  Nav links use font-medium + darker text-foreground/80 (instead
                  of text-muted-foreground) so they read as proper CTAs, not
                  incidental helper links. The API link is auth-gated — it
                  bounces through /developer which redirects to sign-in when
                  the user isn't authenticated.
                */}
                <Link
                  href="/discover"
                  className="text-foreground/80 hover:text-foreground font-medium px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors hidden sm:inline-block"
                >
                  Discover
                </Link>
                {/*
                  NOTE: /services (SMM growth vertical) is intentionally
                  NOT linked from the main navigation. It's a hidden
                  URL — accessible directly at /services but not
                  discoverable from decodecreator.com's UI. Keeps the
                  main analytics brand cleanly separated from the SMM
                  vertical for compliance reasons.
                */}
                <Link
                  href="/pricing"
                  className="text-foreground/80 hover:text-foreground font-medium px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors hidden sm:inline-block"
                >
                  Pricing
                </Link>
                <Link
                  href="/developer"
                  className="text-foreground/80 hover:text-foreground font-medium px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors hidden sm:inline-block"
                >
                  API
                </Link>
                {/*
                  Auth links use ?auth=… so any page can open the modal
                  without navigating. AuthModal (rendered at the bottom of
                  <body>) picks up the param and renders. /login and /signup
                  URLs still work as fallbacks for direct visits or emails.
                  Hidden when the user is already signed in — clicking
                  them would just re-open the modal on top of the app.
                */}
                {!isSignedIn ? (
                  <>
                    <Link
                      href="?auth=signin"
                      className="text-foreground/80 hover:text-foreground font-medium px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="?auth=signup"
                      className="rounded-full bg-gradient-ig text-white px-4 py-1.5 font-semibold hover:brightness-110 transition shadow-md shadow-primary/20"
                    >
                      Start Trial
                    </Link>
                  </>
                ) : (
                  /*
                    Signed-in users no longer need a separate "Dashboard"
                    button in the header — the logo already redirects
                    them there, and the user pill inside the dashboard
                    opens their profile. Keeping the header lean.
                    "My Profile" is one click via the pill on any
                    /account page. Outside /account (e.g. on marketing
                    pages), we surface it here so the profile is never
                    more than one click away.
                  */
                  <Link
                    href="/account?tab=profile"
                    className="rounded-full bg-gradient-ig text-white px-4 py-1.5 font-semibold hover:brightness-110 transition shadow-md shadow-primary/20"
                  >
                    My Profile
                  </Link>
                )}
                <ThemeToggle />
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border/60 text-xs text-muted-foreground">
            <div className="container py-6 flex flex-wrap gap-x-4 gap-y-3 justify-between items-center">
              <span>© DecodeCreator. Public-data analytics for creators and brands. Instagram + TikTok + YouTube.</span>
              <nav className="flex flex-wrap gap-x-4 gap-y-2">
                <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
                <Link href="/docs" className="hover:text-foreground transition-colors">API</Link>
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                <Link href="/refund" className="hover:text-foreground transition-colors">Refund</Link>
                <Link href="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
                <CookiePreferencesLink className="hover:text-foreground transition-colors cursor-pointer" />
                <a href="mailto:support.decodecreator@gmail.com" className="hover:text-foreground transition-colors">Support</a>
              </nav>
            </div>
          </footer>
        </div>
        {/*
          Auth modal is mounted once globally — controlled by ?auth=signin /
          ?auth=signup in the URL. Wrapping in Suspense because AuthModal
          uses useSearchParams which suspends during SSR bailouts.
        */}
        <Suspense fallback={null}>
          <AuthModal />
        </Suspense>
        <CookieBanner />
        {/*
          Google Analytics 4. Strategy `afterInteractive` means the
          gtag.js request starts once the page becomes interactive —
          doesn't block first paint. The inline consent-defaults script
          in <head> already fired by this point, so gtag reads
          `analytics_storage: denied` on load and won't set cookies
          until CookieBanner pushes an update.

          GAPageview lives BELOW the Script tag so gtag() is defined
          by the time route-change useEffect fires.
        */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){ dataLayer.push(arguments); }
            window.gtag = window.gtag || gtag;
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              // We handle page_view manually via <GAPageview> so App
              // Router client-side navs are counted; disable auto to
              // avoid double-counting the initial landing.
              send_page_view: false,
              anonymize_ip: true
            });
          `}
        </Script>
        <Suspense fallback={null}>
          <GAPageview measurementId={GA_MEASUREMENT_ID} />
        </Suspense>
        </CartProvider>
      </body>
    </html>
  );
}
