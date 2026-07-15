"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Cookie consent banner. Three categories: necessary (always on),
// analytics (opt-in), marketing (opt-in). Persists the choice for
// 6 months, then re-prompts. Also emits Google Consent Mode v2
// signals so gtag / GA4 / Google Ads tags installed via next/script
// respect the choice.
//
// Category set MUST stay in sync with /cookies page copy.
//
// Storage: localStorage key `dc-consent` → JSON
//   { v: 1, analytics: bool, marketing: bool, ts: iso }
// If ts is older than 6 months we re-prompt (regulator expectation
// for "revisit consent after material time has passed").

const STORAGE_KEY = "dc-consent";
const CONSENT_VERSION = 1;
const RENEW_AFTER_MS = 1000 * 60 * 60 * 24 * 180; // 6 months

interface ConsentState {
  v: number;
  analytics: boolean;
  marketing: boolean;
  ts: string; // ISO timestamp
}

// Push a Google Consent Mode v2 update. Safe to call even if gtag
// isn't loaded yet — dataLayer is created if missing, and gtag.js
// (when it later loads with `wait_for_update`) replays the queue.
function pushConsentUpdate(state: { analytics: boolean; marketing: boolean }) {
  if (typeof window === "undefined") return;
  interface DataLayerItem { [k: string]: unknown }
  const w = window as unknown as { dataLayer?: DataLayerItem[] };
  w.dataLayer = w.dataLayer ?? [];
  // Google gtag calls this a "consent update" with a specific arg shape.
  // We push the raw event; gtag replays it once it loads. Same shape
  // works whether GA4, Google Ads, or nothing is installed.
  w.dataLayer.push({
    event: "consent_update",
    consent: {
      ad_storage: state.marketing ? "granted" : "denied",
      ad_user_data: state.marketing ? "granted" : "denied",
      ad_personalization: state.marketing ? "granted" : "denied",
      analytics_storage: state.analytics ? "granted" : "denied",
      // functionality + security stay granted (they're "strictly necessary")
      functionality_storage: "granted",
      security_storage: "granted",
    },
  });
}

function loadStored(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.v !== CONSENT_VERSION) return null;
    const age = Date.now() - Date.parse(parsed.ts);
    if (!Number.isFinite(age) || age > RENEW_AFTER_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save(state: Omit<ConsentState, "v" | "ts">) {
  if (typeof window === "undefined") return;
  const full: ConsentState = {
    v: CONSENT_VERSION,
    analytics: state.analytics,
    marketing: state.marketing,
    ts: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  } catch {
    // Storage may be blocked in incognito / by extensions — safe to skip;
    // banner will re-appear next visit but Google tags stay denied.
  }
  pushConsentUpdate(full);
}

// Respect a browser-level Global Privacy Control signal as a hard
// decline for both non-essential categories (still show banner so the
// user can explicitly opt in if they want).
function browserHasGPCDeny(): boolean {
  if (typeof navigator === "undefined") return false;
  interface NavGPC extends Navigator { globalPrivacyControl?: boolean }
  return (navigator as NavGPC).globalPrivacyControl === true;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      // Already answered — replay their choice to gtag on every page load
      // so tags loading later in the page respect the stored preference.
      pushConsentUpdate({ analytics: stored.analytics, marketing: stored.marketing });
      setAnalytics(stored.analytics);
      setMarketing(stored.marketing);
      // Listen for footer "Cookie preferences" click to reopen banner.
      const onOpen = () => setVisible(true);
      window.addEventListener("dc:open-cookie-preferences", onOpen);
      return () => window.removeEventListener("dc:open-cookie-preferences", onOpen);
    }
    // No prior choice — default DENIED for everything non-essential and
    // show the banner. If the browser signals GPC, keep the toggles OFF
    // so accepting requires a deliberate click on the analytics toggle.
    pushConsentUpdate({ analytics: false, marketing: false });
    if (browserHasGPCDeny()) {
      setAnalytics(false);
      setMarketing(false);
    }
    setVisible(true);

    const onOpen = () => setVisible(true);
    window.addEventListener("dc:open-cookie-preferences", onOpen);
    return () => window.removeEventListener("dc:open-cookie-preferences", onOpen);
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    save({ analytics: true, marketing: true });
    setAnalytics(true);
    setMarketing(true);
    setVisible(false);
  };

  const rejectAll = () => {
    save({ analytics: false, marketing: false });
    setAnalytics(false);
    setMarketing(false);
    setVisible(false);
  };

  const saveChoice = () => {
    save({ analytics, marketing });
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-2 bottom-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md z-50"
    >
      <div className="rounded-xl border border-border/70 bg-background/95 backdrop-blur shadow-lg p-4 space-y-3">
        <div className="space-y-2">
          <h2 className="font-semibold text-sm">Cookie preferences</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We use a sign-in cookie by default (always on). With your
            permission we&apos;d also like to use analytics to understand
            what to improve, and marketing tags to measure our ads. Off by
            default — you choose.{" "}
            <Link href="/cookies" className="underline">
              Details
            </Link>
            .
          </p>
        </div>

        {showDetails && (
          <div className="space-y-2 rounded-md bg-muted/50 p-3 text-xs">
            <Row
              label="Strictly necessary"
              hint="Sign-in, theme, consent record. Cannot be turned off."
              disabled
              checked
            />
            <Row
              label="Analytics"
              hint="Google Analytics, PostHog. Anonymized product usage."
              checked={analytics}
              onChange={setAnalytics}
            />
            <Row
              label="Marketing"
              hint="Google Ads conversion. Measures if our ads work."
              checked={marketing}
              onChange={setMarketing}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={rejectAll}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            {showDetails ? "Hide options" : "Customize"}
          </button>
          {showDetails ? (
            <button
              type="button"
              onClick={saveChoice}
              className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background font-medium hover:opacity-90 transition-opacity ml-auto"
            >
              Save my choice
            </button>
          ) : (
            <button
              type="button"
              onClick={acceptAll}
              className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background font-medium hover:opacity-90 transition-opacity ml-auto"
            >
              Accept all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 accent-primary"
      />
      <div className="flex-1">
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-muted-foreground text-[11px] leading-snug">
          {hint}
        </div>
      </div>
    </label>
  );
}

// Footer link → dispatches an event that reopens the banner without a
// page reload. Wire this into the footer of layout.tsx.
export function CookiePreferencesLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("dc:open-cookie-preferences"));
        }
      }}
    >
      Cookie preferences
    </button>
  );
}
