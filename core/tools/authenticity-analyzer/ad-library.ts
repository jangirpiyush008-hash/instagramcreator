// Meta Ad Library probe — best-effort check for whether an Instagram
// account currently runs Meta-served ads (including IG in-app "Boost"
// button, which routes through Ads Manager and IS logged in the Library
// by law). This is the ONLY external signal that can verify paid reach
// distribution — everything else is inference.
//
// Reality check: Meta's public Ad Library page is a heavy React SPA.
// A raw server-side fetch gets the shell only. Meta's async/internal
// endpoints require auth cookies and rotate frequently. So THIS PROBE
// WILL OFTEN RETURN null. The tool must treat null as "Data unavailable"
// and never fabricate a boost signal from missing data (spec rule).
//
// We do NOT throw on failure. We do NOT retry. We time out fast so a
// dead Ad Library never blocks the tool run. When it works, it works;
// when it doesn't, the tool degrades cleanly to caption-only paid-
// content inference and marks the Ad Library signal as "insufficient
// data" in the UI methodology.

export interface AdLibraryProbe {
  available: boolean;         // true when the probe actually returned data we could parse
  hasActiveAds: boolean | null;   // null when unavailable
  confidence: "verified" | "hinted" | "unknown";
  method: string;             // which detection path succeeded — for methodology display
  note?: string;              // human-readable degrade reason when available=false
}

// User-agent + Accept headers of a real Chromium — needed to get past
// Meta's most basic bot-shed. Even so, we should expect this to be
// insufficient for the full app shell most of the time.
const PROBE_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

const TIMEOUT_MS = 4500;

// Probe endpoint — public keyword search across all countries, all ad
// types, active status only. If the handle has active ads we usually
// see JSON blobs inlined into the HTML with page metadata.
function probeUrl(handle: string): string {
  const clean = encodeURIComponent(handle.replace(/^@/, "").trim());
  return (
    "https://www.facebook.com/ads/library/" +
    `?active_status=active&ad_type=all&country=ALL&q=${clean}&search_type=keyword_unordered&media_type=all`
  );
}

export async function probeAdLibrary(handle: string): Promise<AdLibraryProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(probeUrl(handle), {
      headers: PROBE_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      return {
        available: false,
        hasActiveAds: null,
        confidence: "unknown",
        method: "http-error",
        note: `Ad Library probe returned HTTP ${res.status} — insufficient data`,
      };
    }

    const html = await res.text();

    // Detection path 1: explicit "no results" copy in the shell.
    // Meta renders a "0 results" strap even on the JS-rendered shell,
    // typically as a literal string in the head SEO tags.
    if (/"total_count":\s*0/i.test(html) || /no results found/i.test(html)) {
      return {
        available: true,
        hasActiveAds: false,
        confidence: "verified",
        method: "meta-no-results",
      };
    }

    // Detection path 2: total_count present and > 0.
    const totalMatch = html.match(/"total_count":\s*(\d+)/);
    if (totalMatch && totalMatch[1]) {
      const total = Number(totalMatch[1]);
      if (Number.isFinite(total) && total > 0) {
        return {
          available: true,
          hasActiveAds: true,
          confidence: "verified",
          method: "meta-total-count",
        };
      }
    }

    // Detection path 3 (soft): the shell contains at least one ad-card
    // reference for the handle. Weak — could be someone else's ad
    // mentioning this handle — so we mark confidence as "hinted".
    const escaped = handle.replace(/^@/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cardHit = new RegExp(`"page_name":\\s*"[^"]*${escaped}`, "i");
    if (cardHit.test(html)) {
      return {
        available: true,
        hasActiveAds: true,
        confidence: "hinted",
        method: "page-name-match",
      };
    }

    // We got HTML back but nothing we could confidently parse. Treat
    // that as unavailable rather than "no ads" — false negatives on
    // this signal hurt more than "unknown" does.
    return {
      available: false,
      hasActiveAds: null,
      confidence: "unknown",
      method: "shell-only",
      note: "Ad Library returned the page shell but no parseable ad metadata — insufficient data",
    };
  } catch (e) {
    const isAbort = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
    return {
      available: false,
      hasActiveAds: null,
      confidence: "unknown",
      method: isAbort ? "timeout" : "network-error",
      note: isAbort
        ? "Ad Library probe timed out — insufficient data"
        : `Ad Library probe failed: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
