import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { Suspense } from "react";
import { ThemeToggle } from "@/web/components/ThemeToggle";
import { AuthModal } from "@/web/components/AuthModal";
import { CookieBanner, CookiePreferencesLink } from "@/web/components/CookieBanner";
import { GAPageview } from "@/web/components/GAPageview";

// Google Analytics 4 measurement ID. Public by design — appears in
// the rendered HTML on every visit. Wired to fire in Consent Mode v2
// mode: defaults to denied (set inline in <head> below), granted
// only after the user opts in via CookieBanner.
const GA_MEASUREMENT_ID = "G-8ENDR3SQJE";

export const metadata: Metadata = {
  title: "DecodeCreator — audience analytics for any public Instagram, TikTok or YouTube account",
  description:
    "Engagement, audience quality, fake-follower share, demographics — for any public Instagram, TikTok or YouTube account. Public data only, the account is never notified.",
  metadataBase: new URL("https://decodecreator.com"),
  openGraph: {
    title: "DecodeCreator — audience analytics for any public Instagram, TikTok or YouTube account",
    description: "Public-data analytics for creators and brands.",
    url: "https://decodecreator.com",
    siteName: "DecodeCreator",
  },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
      </head>
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border/60">
            <div className="container py-4 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
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
                */}
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
      </body>
    </html>
  );
}
