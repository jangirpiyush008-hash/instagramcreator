"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Fires a manual page_view event to gtag on every App Router client-side
// navigation. Without this, GA4 only counts the initial full-page load —
// every subsequent Link click looks like the same session with zero
// engagement.
//
// gtag itself is loaded by <Script> in the root layout. This component
// only pushes events; if consent is denied, Consent Mode v2 turns the
// event into a cookieless ping (still counts a visit, no identifiers).

export function GAPageview({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    interface WithGtag { gtag?: (...args: unknown[]) => void }
    const gtag = (window as unknown as WithGtag).gtag;
    if (typeof gtag !== "function") return;

    const query = searchParams?.toString();
    const page_path = query ? `${pathname}?${query}` : pathname;

    gtag("event", "page_view", {
      page_path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: measurementId,
    });
  }, [pathname, searchParams, measurementId]);

  return null;
}
