"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/web/lib/cn";
import type { Platform } from "@/core/types";
import type { DiscoveryHit } from "@/core/discover/search";

// Client-side Discover UI. Talks to /api/discover, renders results in a
// grid, supports filter panel + "load more". Pro-tier gate is handled
// server-side — if response has gated:true we show 5 results + an
// upsell card in place of the rest.

interface Props {
  initialPlatform: Platform;
  isSignedIn: boolean;
}

const PLATFORM_CFG: Record<Platform, { label: string; gradient: string; placeholder: string }> = {
  instagram: { label: "Instagram", gradient: "bg-gradient-ig", placeholder: "e.g. skincare, tech, travel" },
  tiktok: { label: "TikTok", gradient: "bg-gradient-tt", placeholder: "e.g. cooking, fitness, comedy" },
  youtube: { label: "YouTube", gradient: "bg-gradient-yt", placeholder: "e.g. gaming, education, vlogs" },
};

export function DiscoverPage({ initialPlatform, isSignedIn }: Props) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [query, setQuery] = useState("");
  const [followersMin, setFollowersMin] = useState("");
  const [followersMax, setFollowersMax] = useState("");
  const [erMin, setErMin] = useState("");
  const [results, setResults] = useState<DiscoveryHit[]>([]);
  const [gated, setGated] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<Record<string, "idle" | "saving" | "saved">>({});

  const runSearch = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const params = new URLSearchParams({ platform });
      if (query.trim()) params.set("q", query.trim());
      if (followersMin) params.set("followers_min", followersMin);
      if (followersMax) params.set("followers_max", followersMax);
      if (erMin) params.set("er_min", erMin);
      params.set("limit", "20");
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
  }, [platform, query, followersMin, followersMax, erMin]);

  const saveCreator = async (hit: DiscoveryHit) => {
    if (!isSignedIn) {
      // Punt to auth modal — same convention used elsewhere.
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
          Live search across all three platforms. Filter by follower count and
          engagement rate. Results are cached for 24 hours so repeat searches
          are instant.
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

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end mb-6">
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

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive mb-6">
          {error}
        </div>
      )}

      {/* Results header */}
      {results.length > 0 && (
        <div className="text-sm text-muted-foreground mb-4">
          Showing {results.length}
          {gated && total > results.length ? ` of ${total}+` : ""} results
        </div>
      )}

      {/* Results grid */}
      {results.length === 0 && !isPending && !error && (
        <EmptyState platform={platform} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((hit) => (
          <CreatorCard
            key={`${hit.platform}:${hit.handle}`}
            hit={hit}
            saveState={saveState[`${hit.platform}:${hit.handle}`] ?? "idle"}
            onSave={() => saveCreator(hit)}
          />
        ))}
      </div>

      {/* Gate upsell */}
      {gated && results.length > 0 && (
        <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <div className="text-sm text-primary font-semibold uppercase tracking-wider mb-2">
            Preview mode
          </div>
          <h3 className="text-xl font-semibold">
            Unlock all results with Pro
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
            You're seeing {results.length} of {total}+ matches. Pro unlocks the
            full result set, save-to-watchlist, and unlimited searches across
            all three platforms.
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
        <Stat label="Followers" value={fmtNum(hit.followers)} />
        <Stat
          label="ER"
          value={hit.engagementRate != null ? `${hit.engagementRate.toFixed(1)}%` : "—"}
        />
        <Stat
          label={hit.platform === "youtube" ? "Videos" : "Posts"}
          value={hit.postCount != null ? fmtNum(hit.postCount) : "—"}
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
        filters to narrow by follower size or engagement rate.
      </p>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}
