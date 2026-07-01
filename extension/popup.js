// DecodeCreator popup — the entire client for the MVP extension.
//
// Flow:
//   1. Read the active tab URL.
//   2. Try to infer (platform, handle) from that URL.
//   3. If we got a hit, call /api/scan (engagement-rate) and render.
//   4. If not, show the manual-entry form.
//
// Auth: none for the MVP. When we flip payments live on the site we'll wire
// chrome.identity + a signed-request header — deliberately deferred.

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

// Ordered — first reachable base wins. Swap the first entry to
// https://decodecreator.com once the domain is pointed at Railway.
const API_BASES = [
  "https://instagramcreator-production.up.railway.app",
  "https://decodecreator.com",
];

// -----------------------------------------------------------------------------
// URL → { platform, handle } parser
// -----------------------------------------------------------------------------

const PROFILE_MATCHERS = [
  {
    platform: "instagram",
    host: /(^|\.)instagram\.com$/i,
    // instagram.com/{handle}[/*] — but skip stories, p (posts), reel, explore, direct, accounts.
    parse(pathname) {
      const first = pathname.replace(/^\/+/, "").split("/")[0];
      if (!first) return null;
      const banned = new Set([
        "p", "reel", "reels", "stories", "explore", "direct", "accounts",
        "developer", "about", "developers", "web", "session", "tv",
      ]);
      if (banned.has(first.toLowerCase())) return null;
      return first;
    },
  },
  {
    platform: "tiktok",
    host: /(^|\.)tiktok\.com$/i,
    // tiktok.com/@handle
    parse(pathname) {
      const first = pathname.replace(/^\/+/, "").split("/")[0];
      if (!first || !first.startsWith("@")) return null;
      return first.slice(1);
    },
  },
  {
    platform: "youtube",
    host: /(^|\.)youtube\.com$/i,
    // youtube.com/@handle · /c/name · /user/name
    parse(pathname) {
      const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
      if (!parts.length) return null;
      const first = parts[0];
      if (first.startsWith("@")) return first.slice(1);
      if ((first === "c" || first === "user") && parts[1]) return parts[1];
      return null;
    },
  },
];

function detectFromUrl(rawUrl) {
  if (!rawUrl) return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  for (const m of PROFILE_MATCHERS) {
    if (!m.host.test(u.hostname)) continue;
    const handle = m.parse(u.pathname);
    if (handle) return { platform: m.platform, handle };
  }
  return null;
}

// -----------------------------------------------------------------------------
// API — POST /api/scan with fallback across bases
// -----------------------------------------------------------------------------

async function scan(platform, handle) {
  let lastErr = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          handle,
          toolId: "engagement-rate",
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        // Surface the API's own error (rate limit / not found / etc.).
        const err = new Error(j.error || `Scan failed (${res.status})`);
        err.code = j.code;
        throw err;
      }
      return { payload: j, base };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Network error");
}

// -----------------------------------------------------------------------------
// UI helpers
// -----------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

function showState(name) {
  for (const el of document.querySelectorAll(".dc-state")) {
    el.hidden = el.id !== `state-${name}`;
  }
}

function formatCount(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const PLATFORM_LABEL = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// -----------------------------------------------------------------------------
// Render
// -----------------------------------------------------------------------------

function renderData(platform, handle, payload, base) {
  const free = payload.result.free || {};
  $("d-handle").textContent = `@${handle}`;
  $("d-platform").textContent = PLATFORM_LABEL[platform] ?? platform;
  $("d-verified").hidden = !free.verified;
  $("d-er").textContent = `${(free.engagementRatePct ?? 0).toFixed(2)}%`;
  $("d-benchmark").textContent = free.benchmark ?? "—";
  $("d-followers").textContent = formatCount(free.followers);
  $("d-posts").textContent = String(free.postsAnalyzed ?? "—");
  $("d-likes").textContent = formatCount(free.avgLikes);
  $("d-comments").textContent = formatCount(free.avgComments);
  $("d-full").href = `${base}/${platform}/${encodeURIComponent(handle)}?tool=engagement-rate`;
  showState("data");
}

function renderError(message, code, retry) {
  $("err-title").textContent =
    code === "not_found" ? "Account not found"
    : code === "private_account" ? "This account is private"
    : code === "provider_rate_limit" ? "Data provider is rate-limited"
    : "Couldn't run this scan";
  $("err-message").textContent = message || "Please try again.";
  $("err-retry").onclick = retry;
  showState("error");
}

// -----------------------------------------------------------------------------
// Manual entry form (empty state)
// -----------------------------------------------------------------------------

function initManualForm() {
  let selected = "instagram";
  const pills = document.querySelectorAll(".dc-pill");
  pills.forEach((p) => {
    p.onclick = () => {
      selected = p.dataset.platform;
      pills.forEach((q) => {
        q.classList.toggle("dc-pill-active", q === p);
        q.setAttribute("data-platform", q.dataset.platform);
      });
    };
  });
  $("manual-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const handle = $("manual-handle").value.trim().replace(/^@+/, "");
    if (!handle) return;
    runScan(selected, handle);
  });
}

// -----------------------------------------------------------------------------
// Orchestration
// -----------------------------------------------------------------------------

async function runScan(platform, handle) {
  $("loading-handle").textContent = `@${handle}`;
  showState("loading");
  try {
    const { payload, base } = await scan(platform, handle);
    renderData(platform, handle, payload, base);
  } catch (e) {
    renderError(e.message, e.code, () => runScan(platform, handle));
  }
}

async function boot() {
  initManualForm();

  // activeTab lets us read the URL of the tab the popup was invoked from
  // without needing broad tabs permission.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs && tabs[0] && tabs[0].url;
    const hit = detectFromUrl(url);
    if (hit) {
      runScan(hit.platform, hit.handle);
    } else {
      showState("empty");
    }
  });
}

boot();
