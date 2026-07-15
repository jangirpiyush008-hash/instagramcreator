import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/web/components/ThemeToggle";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
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
              <nav className="text-sm flex items-center gap-3 sm:gap-4">
                <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
                  Pricing
                </Link>
                <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
                  API
                </Link>
                <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-gradient-ig text-white px-4 py-1.5 font-medium hover:brightness-110 transition"
                >
                  Start Trial
                </Link>
                <ThemeToggle />
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-border/60 text-xs text-muted-foreground">
            <div className="container py-6 flex flex-wrap gap-4 justify-between items-center">
              <span>© DecodeCreator. Public-data analytics for creators and brands. Instagram + TikTok + YouTube.</span>
              <nav className="flex gap-4">
                <Link href="/docs" className="hover:text-foreground transition-colors">API</Link>
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                <a href="mailto:support.decodecreator@gmail.com" className="hover:text-foreground transition-colors">Support</a>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
