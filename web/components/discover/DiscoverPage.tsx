"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/web/lib/cn";
import type { Platform } from "@/core/types";
import type { DiscoveryHit } from "@/core/discover/search";

// Client-side Discover UI. Talks to /api/discover, renders results in a
// grid, supports filter panel + client-side refinements.
//
// Filters — two categories:
//   Server-side (passed to /api/discover):
//     keyword, followers_min/max, er_min, limit, verified_only
//   Client-side refinements (applied to whatever the server returned):
//     location (bio flag/keyword match), language (script detection),
//     sort order.
//
// Why the client-side refinements are honest: HikerAPI + tikwm search
// endpoints don't expose location or language filters — that's Modash's
// pre-crawled DB moat, which we don't have (yet). Instead of hiding
// the filters entirely we surface them with a clear "beta — bio-signal
// only" hint so users know what they're getting.

interface Props {
  initialPlatform: Platform;
  isSignedIn: boolean;
}

const PLATFORM_CFG: Record<Platform, { label: string; gradient: string; placeholder: string }> = {
  instagram: { label: "Instagram", gradient: "bg-gradient-ig", placeholder: "e.g. skincare, tech, travel" },
  tiktok: { label: "TikTok", gradient: "bg-gradient-tt", placeholder: "e.g. cooking, fitness, comedy" },
  youtube: { label: "YouTube", gradient: "bg-gradient-yt", placeholder: "e.g. gaming, education, vlogs" },
};

// Location options — country name + flag + regex that matches EITHER
// the flag emoji OR the country name in the bio (case-insensitive).
const LOCATION_OPTS: { id: string; label: string; test?: (bio: string) => boolean }[] = [
  { id: "any", label: "Any location" },
  { id: "in", label: "🇮🇳 India", test: (b) => /🇮🇳|\bindia|\bmumbai|\bdelhi|\bbengaluru|\bbangalore|\bhyderabad|\bpune|\bchennai|\bkolkata/i.test(b) },
  { id: "us", label: "🇺🇸 USA", test: (b) => /🇺🇸|\busa\b|\bunited states\b|\bnew york\b|\bla\b|\blos angeles|\bnyc\b|\bcalifornia\b/i.test(b) },
  { id: "gb", label: "🇬🇧 UK", test: (b) => /🇬🇧|\buk\b|\bunited kingdom|\blondon\b|\bengland\b|\bmanchester\b/i.test(b) },
  { id: "ae", label: "🇦🇪 UAE", test: (b) => /🇦🇪|\buae\b|\bdubai\b|\babu dhabi\b/i.test(b) },
  { id: "ca", label: "🇨🇦 Canada", test: (b) => /🇨🇦|\bcanada\b|\btoronto\b|\bvancouver\b|\bmontreal\b/i.test(b) },
  { id: "au", label: "🇦🇺 Australia", test: (b) => /🇦🇺|\baustralia\b|\bsydney\b|\bmelbourne\b/i.test(b) },
  { id: "sg", label: "🇸🇬 Singapore", test: (b) => /🇸🇬|\bsingapore\b/i.test(b) },
  { id: "de", label: "🇩🇪 Germany", test: (b) => /🇩🇪|\bgermany|\bberlin\b|\bmunich\b/i.test(b) },
  { id: "br", label: "🇧🇷 Brazil", test: (b) => /🇧🇷|\bbrazil|\bbrasil/i.test(b) },
];

// Language options — script/keyword detection. Coarse but honest.
const LANGUAGE_OPTS: { id: string; label: string; test?: (bio: string) => boolean }[] = [
  { id: "any", label: "Any language" },
  // Hindi/Devanagari script
  { id: "hi", label: "Hindi", test: (b) => /[ऀ-ॿ]/.test(b) },
  // Arabic script
  { id: "ar", label: "Arabic", test: (b) => /[؀-ۿ]/.test(b) },
  // CJK — Chinese/Japanese/Korean chars
  { id: "cjk", label: "Chinese / Japanese / Korean", test: (b) => /[぀-ヿ一-鿿가-힯]/.test(b) },
  // Cyrillic (Russian / Ukrainian etc.)
  { id: "ru", label: "Cyrillic (RU/UA)", test: (b) => /[Ѐ-ӿ]/.test(b) },
  // Spanish keyword heuristic
  { id: "es", label: "Spanish", test: (b) => /\b(el|la|de|en|para|con|una|para)\b/i.test(b) && /\b(hola|amigos|creador|contenido|mexicano|espanol|español)\b/i.test(b) },
  // English is the fallback — check for ASCII-only + common English function words
  { id: "en", label: "English", test: (b) => /^[\x00-\x7F\s]+$/.test(b) && /\b(the|and|for|creator|founder|content)\b/i.test(b) },
];

const SORT_OPTS = [
  { id: "followers_desc", label: "Followers: high → low" },
  { id: "followers_asc", label: "Followers: low → high" },
  { id: "er_desc", label: "Engagement: high → low" },
  { id: "verified_first", label: "Verified first" },
] as const;
type SortId = (typeof SORT_OPTS)[number]["id"];

export function DiscoverPage({ initialPlatform, isSignedIn }: Props) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform);

  // Server-passed filters
  const [query, setQuery] = useState("");
  const [followersMin, setFollowersMin] = useState("");
  const [followersMax, setFollowersMax] = useState("");
  const [erMin, setErMin] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  // Client-side refinements
  const [locationId, setLocationId] = useState("any");
  const [languageId, setLanguageId] = useState("any");
  const [sortId, setSortId] = useState<SortId>("followers_desc");

  // Results
  const [results, setResults] = useState<DiscoveryHit[]>([]);
  const [gated, setGated] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<Record<string, "idle" | "saving" | "saved">>({});

  const runSearch = useCallback(() => {
    setError(null);
    setHasSearched(true);
    startTransition(async () => {
      const params = new URLSearchParams({ platform });
      if (query.trim()) params.set("q", query.trim());
      if (followersMin) params.set("followers_min", followersMin);
      if (followersMax) params.set("followers_max", followersMax);
      if (erMin) params.set("er_min", erMin);
      if (verifiedOnly) params.set("verified_only", "1");
      // Fetch a bigger page (50) since we're going to filter client-side
      // on location/language — need extra headroom so the final list
      // isn't decimated by strict bio matching.
      params.set("limit", "50");
      try {
        const res = await fetch(`/api/discover?${params.toString()}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as {
          ok: boolean;
          results?: DiscoveryHit[];
          gated?: boolean;
          total?: number;
          error?: string;
        };
        if (!body.ok) {
          setError(body.error ?? "Search failed");
          setResults([]);
          return;
        }
        setResults(body.results ?? []);
        setGated(!!body.gated);
        setTotal(body.total ?? body.results?.length ?? 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  }, [platform, query, followersMin, followersMax, erMin, verifiedOnly]);

  // Apply client-side refinements (location, language, sort) on top of
  // whatever the server returned. Recomputed on every state change,
  // no re-fetch.
  const displayed = useMemo(() => {
    const locOpt = LOCATION_OPTS.find((o) => o.id === locationId);
    const langOpt = LANGUAGE_OPTS.find((o) => o.id === languageId);

    let out = results;
    if (locOpt?.test) {
      out = out.filter((h) => locOpt.test!(`${h.bio ?? ""} ${h.displayName ?? ""}`));
    }
    if (langOpt?.test) {
      out = out.filter((h) => langOpt.test!(`${h.bio ?? ""} ${h.displayName ?? ""}`));
    }
    if (verifiedOnly) {
      out = out.filter((h) => h.isVerified);
    }

    // Sort — mutate a copy.
    out = [...out];
    if (sortId === "followers_desc") out.sort((a, b) => b.followers - a.followers);
    else if (sortId === "followers_asc") out.sort((a, b) => a.followers - b.followers);
    else if (sortId === "er_desc") out.sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));
    else if (sortId === "verified_first") {
      out.sort((a, b) => {
        if (a.isVerified === b.isVerified) return b.followers - a.followers;
        return a.isVerified ? -1 : 1;
      });
    }
    return out;
  }, [results, locationId, languageId, sortId, verifiedOnly]);

  const saveCreator = async (hit: DiscoveryHit) => {
    if (!isSignedIn) {
      window.location.href = "?auth=signup&next=/discover";
      return;
    }
    const key = `${hit.platform}:${hit.handle}`;
    setSaveState((s) => ({ ...s, [key]: "saving" }));
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: hit.platform,
          handle: hit.handle,
          label: hit.displayName ?? undefined,
        }),
      });
      if (res.ok) setSaveState((s) => ({ ...s, [key]: "saved" }));
      else setSaveState((s) => ({ ...s, [key]: "idle" }));
    } catch {
      setSaveState((s) => ({ ...s, [key]: "idle" }));
    }
  };

  const cfg = PLATFORM_CFG[platform];
  const refinementsActive =
    locationId !== "any" || languageId !== "any" || sortId !== "followers_desc";

  return (
    <div className="container py-8 lg:py-10 max-w-6xl">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">
          Discover
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Find creators across Instagram, TikTok &amp; YouTube
        </h1>
        <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
          Live search across all three platforms. Refine by follower size,
          engagement, verification, location, and language. Results are
          cached for 24h so repeat searches are instant.
        </p>
      </header>

      {/* Platform tabs */}
      <div className="inline-flex rounded-full border border-border bg-background/60 p-1 mb-5">
        {(Object.keys(PLATFORM_CFG) as Platform[]).map((p) => {
          const active = platform === p;
          const g = PLATFORM_CFG[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={active}
              className={cn(
                "px-4 sm:px-5 py-2 text-sm rounded-full transition-all font-medium",
                active
                  ? `${g.gradient} text-white shadow-md`
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {/* PRIMARY FILTERS — keyword + numeric range + verified + search */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end mb-4">
        <label className="block">
          <div className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wider">
            Keyword
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            placeholder={cfg.placeholder}
            className="h-11 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 transition-all"
          />
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wider">
            Followers (min–max)
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              inputMode="numeric"
              placeholder="10000"
              value={followersMin}
              onChange={(e) => setFollowersMin(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-11 w-28 rounded-lg border border-input bg-background/80 px-3 text-sm tabular-nums outline-none focus-visible:border-primary/60"
            />
            <span className="self-center text-muted-foreground">–</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="100000"
              value={followersMax}
              onChange={(e) => setFollowersMax(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-11 w-28 rounded-lg border border-input bg-background/80 px-3 text-sm tabular-nums outline-none focus-visible:border-primary/60"
            />
          </div>
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wider">
            ER ≥ %
          </div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="2.0"
            value={erMin}
            onChange={(e) => setErMin(e.target.value.replace(/[^0-9.]/g, ""))}
            className="h-11 w-24 rounded-lg border border-input bg-background/80 px-3 text-sm tabular-nums outline-none focus-visible:border-primary/60"
          />
        </label>
        <label className="flex items-center gap-2 h-11 px-3 rounded-lg border border-input bg-background/80 text-sm cursor-pointer hover:border-primary/50 transition-colors">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="accent-primary"
          />
          <span className="whitespace-nowrap">Verified ✓</span>
        </label>
        <button
          type="button"
          onClick={runSearch}
          disabled={isPending}
          className={cn(
            "h-11 px-6 rounded-lg font-medium text-white transition-all shadow-lg shadow-primary/20 disabled:opacity-60",
            cfg.gradient,
          )}
        >
          {isPending ? "Searching…" : "Search"}
        </button>
      </div>

      {/* REFINEMENT ROW — location, language, sort — client-side only */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <label className="block">
          <div className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            Location
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 normal-case tracking-normal">
              beta
            </span>
          </div>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60"
          >
            {LOCATION_OPTS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            Content language
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 normal-case tracking-normal">
              beta
            </span>
          </div>
          <select
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60"
          >
            {LANGUAGE_OPTS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wider">
            Sort by
          </div>
          <select
            value={sortId}
            onChange={(e) => setSortId(e.target.value as SortId)}
            className="h-10 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60"
          >
            {SORT_OPTS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {(locationId !== "any" || languageId !== "any") && (
        <div className="text-[11px] text-muted-foreground mb-3 px-1">
          🧪 Location/language filters match on bio text signals (flag
          emoji, country name, script). Creators who don&apos;t mention
          it in their bio may be skipped. Full location + language
          matching lands with the Modash-parity index (Pro upgrade).
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive mb-6">
          {error}
        </div>
      )}

      {/* Results header */}
      {displayed.length > 0 && (
        <div className="text-sm text-muted-foreground mb-4">
          Showing {displayed.length}
          {refinementsActive && results.length > displayed.length
            ? ` (${results.length - displayed.length} filtered out)`
            : ""}
          {gated && total > displayed.length ? ` · Pro unlocks the full ${total}+ result set` : ""}
        </div>
      )}

      {displayed.length === 0 && !isPending && !error && (
        hasSearched
          ? <NoResultsState platform={platform} query={query} refinementsActive={refinementsActive} onClearRefinements={() => { setLocationId("any"); setLanguageId("any"); }} />
          : <EmptyState platform={platform} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayed.map((hit) => (
          <CreatorCard
            key={`${hit.platform}:${hit.handle}`}
            hit={hit}
            saveState={saveState[`${hit.platform}:${hit.handle}`] ?? "idle"}
            onSave={() => saveCreator(hit)}
          />
        ))}
      </div>

      {/* Gate upsell */}
      {gated && displayed.length > 0 && (
        <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <div className="text-sm text-primary font-semibold uppercase tracking-wider mb-2">
            Preview mode
          </div>
          <h3 className="text-xl font-semibold">
            Unlock all results with Pro
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
            You&apos;re seeing {displayed.length} of {total}+ matches. Pro unlocks
            the full result set, save-to-watchlist, and unlimited searches
            across all three platforms.
          </p>
          <div className="mt-4">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-ig text-white px-6 py-2.5 text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-primary/20"
            >
              See Pro plans →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result card ─────────────────────────────────────────────────────────
function CreatorCard({
  hit,
  saveState,
  onSave,
}: {
  hit: DiscoveryHit;
  saveState: "idle" | "saving" | "saved";
  onSave: () => void;
}) {
  const cfg = PLATFORM_CFG[hit.platform];
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        {hit.profilePicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.profilePicUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-12 w-12 rounded-full object-cover border border-border shrink-0"
          />
        ) : (
          <div className={cn("h-12 w-12 rounded-full grid place-items-center text-white font-semibold shrink-0", cfg.gradient)}>
            {hit.handle.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="font-semibold truncate text-sm">
              @{hit.handle}
            </div>
            {hit.isVerified && (
              <span className="text-primary text-xs" title="Verified">✓</span>
            )}
          </div>
          {hit.displayName && (
            <div className="text-xs text-muted-foreground truncate">
              {hit.displayName}
            </div>
          )}
        </div>
      </div>

      {hit.bio && (
        <p className="text-xs text-foreground/70 line-clamp-2 mt-3 leading-snug">
          {hit.bio}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        <Stat label="Followers" value={hit.followers > 0 ? fmtNum(hit.followers) : "—"} />
        <Stat
          label="ER"
          value={hit.engagementRate != null ? `${hit.engagementRate.toFixed(1)}%` : "—"}
        />
        <Stat
          label={hit.platform === "youtube" ? "Videos" : "Posts"}
          value={hit.postCount != null && hit.postCount > 0 ? fmtNum(hit.postCount) : "—"}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          href={`/${hit.platform}/${encodeURIComponent(hit.handle)}`}
          className="flex-1 text-center text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          View profile
        </Link>
        <button
          type="button"
          onClick={onSave}
          disabled={saveState !== "idle"}
          className={cn(
            "flex-1 text-xs font-medium px-3 py-2 rounded-lg transition-colors",
            saveState === "saved"
              ? "bg-emerald-500/10 text-emerald-500"
              : saveState === "saving"
                ? "bg-muted text-muted-foreground"
                : `text-white ${cfg.gradient} hover:brightness-110`,
          )}
        >
          {saveState === "saved" ? "Saved ✓" : saveState === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 py-1.5">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState({ platform }: { platform: Platform }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
      <div className="text-4xl mb-3">🔍</div>
      <h3 className="font-semibold">Search for {PLATFORM_CFG[platform].label} creators</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Type a keyword above — creator names, categories, or topics work. Add
        filters to narrow by follower size, engagement, verification,
        location, or content language.
      </p>
    </div>
  );
}

function NoResultsState({
  platform,
  query,
  refinementsActive,
  onClearRefinements,
}: {
  platform: Platform;
  query: string;
  refinementsActive: boolean;
  onClearRefinements: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-10 text-center">
      <div className="text-4xl mb-3">🤷</div>
      <h3 className="font-semibold">No {PLATFORM_CFG[platform].label} creators matched</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        {refinementsActive ? (
          <>
            Nothing matched your location / language / sort filters
            {query.trim() ? <> for &ldquo;<b>{query.trim()}</b>&rdquo;</> : null}. Try
            clearing them or widening the search.
          </>
        ) : query.trim() ? (
          <>Nothing returned for &ldquo;<b>{query.trim()}</b>&rdquo;. Try a
          broader keyword or switch platform.</>
        ) : (
          <>Enter a keyword above to search.</>
        )}
      </p>
      {refinementsActive && (
        <button
          type="button"
          onClick={onClearRefinements}
          className="mt-4 text-xs px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Clear location + language filters
        </button>
      )}
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}
