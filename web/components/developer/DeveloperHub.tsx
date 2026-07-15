"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIERS } from "@/core/api/credits";

// Signed-in developer hub. Consolidates:
//   • Quick start with runnable terminal snippets
//   • API key management (create + reveal-once + revoke)
//   • API tier pricing + upgrade CTAs
//   • Endpoint & error-code reference (deeper live in /docs)
//
// Deliberately client-side for the key-management interactions.
// Server passes the initial keys list + user context down as props.

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  tier: string;
  creditsRemaining: number;
  creditsIncluded: number;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

interface Props {
  keys: ApiKeyRow[];
  newKey?: string;             // raw key shown ONCE after creation
  currentTierId: string;       // matches CONSUMER_TIERS id or "starter" default
}

export function DeveloperHub({ keys, newKey, currentTierId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("Default");

  async function createKey() {
    setBusy("create");
    try {
      const res = await fetch("/api/account/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Failed to create key");
        return;
      }
      router.push(`/developer?newKey=${encodeURIComponent(j.raw)}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? Any request using it will start failing immediately.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/account/keys/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Failed to revoke key");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);
  const primary = active[0];
  const primaryTier = primary?.tier ?? "starter";

  return (
    <div className="max-w-5xl space-y-10">
      {/* HERO */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Developer API · v1
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Build with the DecodeCreator API
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Analyze any public Instagram, TikTok or YouTube account programmatically.
          REST + JSON, <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">x-api-key</code>{" "}
          auth, credit-based pricing. All 12 tools + a bundled full-report endpoint.
        </p>
      </header>

      {/* NEW-KEY CALLOUT */}
      {newKey && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3">
          <div className="font-semibold text-amber-800 dark:text-amber-200">
            Your new API key — copy it now
          </div>
          <p className="text-xs text-muted-foreground">
            This is the ONLY time we&apos;ll show the full key. Store it in a password manager or
            an env var. If you lose it, revoke and generate a new one.
          </p>
          <code className="block rounded-lg bg-background border border-border px-4 py-3 text-sm font-mono break-all select-all">
            {newKey}
          </code>
        </div>
      )}

      {/* QUICK START */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Quick start</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Every request needs your API key in the{" "}
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">x-api-key</code> header.
          Base URL:{" "}
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">https://decodecreator.com</code>
        </p>

        <TerminalBlock lang="bash" title="1. Test with cURL">
{`curl -H "x-api-key: ${primary?.prefix ?? "dc_live_YOUR_KEY_HERE"}••••••••••••••••" \\
  "https://decodecreator.com/v1/scan/instagram/mkbhd?tool=engagement-rate"`}
        </TerminalBlock>

        <TerminalBlock lang="js" title="2. From Node.js">
{`const res = await fetch(
  "https://decodecreator.com/v1/scan/instagram/mkbhd?tool=engagement-rate",
  { headers: { "x-api-key": process.env.DC_KEY } }
);
const json = await res.json();
console.log(json.data.free.engagementRatePct);`}
        </TerminalBlock>

        <TerminalBlock lang="python" title="3. From Python">
{`import os, requests
r = requests.get(
  "https://decodecreator.com/v1/scan/instagram/mkbhd?tool=engagement-rate",
  headers={"x-api-key": os.environ["DC_KEY"]},
)
print(r.json()["data"]["free"]["engagementRatePct"])`}
        </TerminalBlock>
      </section>

      {/* API KEYS */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Your API keys</h2>

        <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
          <div className="text-sm font-medium">Generate a new key</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Key name (e.g. Production, Staging)"
              className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={createKey}
              disabled={busy === "create" || !name.trim()}
              className="h-10 px-4 rounded-md bg-gradient-ig text-white text-sm font-medium hover:brightness-110 disabled:opacity-60 transition"
            >
              {busy === "create" ? "Creating…" : "Generate key"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            The raw key is shown ONCE after creation. We store only a SHA-256 hash. Max 10 active keys per account.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">Active keys</h3>
          {active.length === 0 ? (
            <div className="rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
              No active keys yet. Generate one above to start using the API.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card/60 overflow-hidden divide-y divide-border">
              {active.map((k) => (
                <div key={k.id} className="p-4 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">
                      {k.prefix}••••••••••••••••
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {k.tier} · {k.creditsRemaining.toLocaleString()} / {k.creditsIncluded.toLocaleString()} credits ·
                      created {new Date(k.createdAt).toLocaleDateString()}
                      {k.lastUsedAt && ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button
                    onClick={() => revokeKey(k.id)}
                    disabled={busy === k.id}
                    className="text-xs text-destructive border border-destructive/40 hover:bg-destructive/10 rounded-md px-3 py-1.5 transition disabled:opacity-60"
                  >
                    {busy === k.id ? "Revoking…" : "Revoke"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {revoked.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Revoked keys</h3>
            <div className="rounded-xl border border-border bg-card/40 overflow-hidden divide-y divide-border">
              {revoked.map((k) => (
                <div key={k.id} className="p-4 opacity-60">
                  <div className="text-sm">{k.name}</div>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5 line-through">
                    {k.prefix}••••••••••••••••
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Revoked {k.revokedAt ? new Date(k.revokedAt).toLocaleDateString() : "recently"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* API TIERS (developer-only pricing) */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">API plans</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Separate from the consumer web-app plans. Billed monthly in USD or INR-equivalent.
          Enterprise volumes get custom terms — email{" "}
          <a href="mailto:support.decodecreator@gmail.com" className="underline hover:text-foreground">
            support
          </a>
          .
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(TIERS).map(([id, t]) => (
            <div
              key={id}
              className={
                "rounded-xl border p-4 " +
                (id === primaryTier || id === currentTierId
                  ? "border-primary/60 bg-primary/5"
                  : "border-border bg-card/60")
              }
            >
              <div className="flex items-baseline justify-between">
                <div className="text-sm font-medium">{t.name}</div>
                {(id === primaryTier || id === currentTierId) && (
                  <span className="text-[10px] uppercase tracking-wider text-primary">Current</span>
                )}
              </div>
              <div className="text-2xl font-semibold mt-1">
                {t.monthlyUsd > 0 ? `$${t.monthlyUsd}` : "Custom"}
                {t.monthlyUsd > 0 && <span className="text-sm text-muted-foreground font-normal">/mo</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t.credits > 0 ? `${t.credits.toLocaleString()} credits/mo` : "Custom volume"}
              </div>
              {t.overageUsd > 0 && (
                <div className="text-[11px] text-muted-foreground mt-2">
                  Overage: ${t.overageUsd.toFixed(3)}/credit
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ENDPOINTS quick reference */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-semibold tracking-tight">Endpoints</h2>
          <Link href="/docs" className="text-sm text-primary hover:underline">
            Full reference in /docs →
          </Link>
        </div>
        <EndpointRow
          method="GET"
          path="/v1/scan/{platform}/{handle}?tool={toolId}"
          summary="Run any of the 12 tools on any account. See /docs for the full tool list + credit costs per tool."
        />
        <EndpointRow
          method="GET"
          path="/v1/scan/{platform}/{handle}?tool=full-report"
          summary="Bundled call — runs every eligible tool. Primitives share our cache so provider cost stays low."
        />
        <EndpointRow
          method="POST"
          path="/v1/watchlist"
          summary="Add an account to your monitoring watchlist. Body: {platform, handle, label?}"
        />
        <EndpointRow
          method="GET"
          path="/v1/watchlist"
          summary="List watched accounts with their latest snapshot + follower delta since previous scan."
        />
        <EndpointRow
          method="DELETE"
          path="/v1/watchlist/{id}"
          summary="Remove an account from the watchlist. Free — no credits charged."
        />
        <EndpointRow
          method="GET"
          path="/v1/download?url={media_url}[&filename=X]"
          summary="Proxy an IG / TT / YT thumbnail or video URL through our infra (bypasses CDN hotlink blocks)."
        />
      </section>

      {/* RESPONSE ENVELOPE */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Response envelope</h2>
        <TerminalBlock lang="json" title="Success (200)">
{`{
  "ok": true,
  "tool": "engagement-rate",
  "platform": "instagram",
  "handle": "mkbhd",
  "credits": { "charged": 10, "remaining": 2980 },
  "cacheHit": false,
  "data": { "free": { /* … */ }, "locked": { /* … */ } }
}`}
        </TerminalBlock>
        <TerminalBlock lang="json" title="Error">
{`{
  "ok": false,
  "error": "Handle not found",
  "code": "not_found"
}`}
        </TerminalBlock>
        <p className="text-sm text-muted-foreground">
          Failed scans don&apos;t charge — we refund optimistically. See{" "}
          <Link href="/docs#errors" className="text-primary hover:underline">
            all error codes
          </Link>{" "}
          for the full list.
        </p>
      </section>

      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
        Need help integrating? Email{" "}
        <a href="mailto:support.decodecreator@gmail.com" className="underline hover:text-foreground">
          support.decodecreator@gmail.com
        </a>
        . SLA on Pro and above.
      </div>
    </div>
  );
}

// ── Terminal-styled code block ───────────────────────────────────────────
function TerminalBlock({
  lang,
  title,
  children,
}: {
  lang: string;
  title: string;
  children: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-[#0d0e14] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-2 text-[11px] text-white/60 uppercase tracking-wider">{title}</span>
        </div>
        <span className="text-[10px] text-white/40 font-mono uppercase">{lang}</span>
      </div>
      <pre className="p-4 overflow-x-auto text-xs font-mono text-emerald-200 leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ── Endpoint row (matches /docs styling but tighter) ────────────────────
function EndpointRow({ method, path, summary }: { method: string; path: string; summary: string }) {
  const methodColor: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    POST: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    DELETE: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  };
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={
            `text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${methodColor[method] ?? ""}`
          }
        >
          {method}
        </span>
        <code className="text-sm font-mono break-all">{path}</code>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{summary}</p>
    </div>
  );
}
