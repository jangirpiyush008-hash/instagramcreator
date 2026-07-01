# DecodeCreator — Chrome extension

MVP browser extension. Click the icon on any Instagram, TikTok, or YouTube
profile → instant engagement analytics. Uses the live `/api/scan` endpoint on
the deployed site — no separate backend.

## What it does today

- **Auto-detects** the profile from the current tab URL:
  - `instagram.com/{handle}` → IG
  - `tiktok.com/@{handle}` → TikTok
  - `youtube.com/@{handle}` (also `/c/name` and `/user/name`) → YouTube
- **One-shot fetch** of the engagement-rate tool result
- **Renders**: engagement rate %, benchmark label, followers, posts analyzed,
  avg likes, avg comments, verified badge
- **Manual entry** fallback when the current tab isn't a profile page
- **Full analysis** button opens the tool page on the deployed site

## What it does NOT do (yet)

- **No sign-in** — dev mode; the site is force-unlocked so no auth needed.
  Sign-in via `chrome.identity` will land when payments go live on the site.
- **No content-script overlay** — extension is popup-only. A floating badge
  showing ER% directly on profile pages is Phase 2.
- **No bulk download or Recent-Posts grid** — click "Full analysis →" to open
  those tools on the site.

## Loading locally (dev)

1. Open Chrome (or Brave/Arc) → `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. Pin the extension to the toolbar (puzzle icon → pin DecodeCreator)
6. Navigate to any IG/TT/YT profile → click the extension icon

You'll see quick stats within ~2 seconds. If nothing loads, open the popup's
DevTools (right-click popup → **Inspect**) — errors surface in the console.

## Icons

The extension currently loads **without any icon PNGs** — Chrome uses its
default puzzle-piece icon. This is fine for dev. Before publishing to the
Chrome Web Store, generate real PNGs from the source SVG:

```bash
npm install --no-save sharp
node extension/build-icons.mjs
```

That writes `icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`.
Then add this block back to `manifest.json`:

```json
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
```

…and inside `"action"`:

```json
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png"
    }
```

Reload the extension after editing the manifest. Alternatively, any online
SVG→PNG converter (cloudconvert.com, svgtopng.com) works — just export at
the four sizes above.

## Publishing to the Chrome Web Store

1. **Zip the folder**: from repo root run `cd extension && zip -r ../dc-extension.zip .`
2. Chrome Web Store Developer Dashboard → **New item** → upload `dc-extension.zip`
3. Fill in listing (name, description, screenshots)
4. One-time **$5 developer registration fee** (if you haven't paid before)
5. Submit for review — typically approved within 1-3 business days

Once approved, users can install directly from the Web Store. The
`host_permissions` in `manifest.json` is what the store's warning banner will
say — "This extension can read and change data on: instagramcreator-production
.up.railway.app and decodecreator.com". That's it — no reading of IG/TT/YT
pages, no invasive tracking.

## Config

The extension calls the site through `API_BASES` in `popup.js`. Order matters:
first reachable base wins. Once `decodecreator.com` DNS is live, move it to
the top of the array and the extension will prefer the branded domain.

```js
const API_BASES = [
  "https://instagramcreator-production.up.railway.app",
  "https://decodecreator.com",
];
```

## Files

- `manifest.json` — MV3 manifest
- `popup.html` — popup UI structure
- `popup.css` — dark theme matching the site (pink/purple gradient)
- `popup.js` — URL parser + scan orchestrator + render
- `icons/` — 16/32/48/128 PNGs (currently placeholders)

## What's next (Phase 2)

Small features that turn the extension from "quick check" into "always-on companion":

- **Content-script overlay**: inject a small floating badge with ER% and
  benchmark on IG/TT/YT profile pages, no click needed.
- **Sign-in with your DecodeCreator account** via `chrome.identity` — unlocks
  the same tier as the web app.
- **History**: recent scans list, one-click re-open.
- **Multi-tool switcher** in the popup — jump between ER, Real Follower
  Check, Recent Posts without leaving the extension.
- **Comparison mode**: pin two accounts, see stats side-by-side.
- **Watchlist**: track a shortlist of accounts for follower growth.
