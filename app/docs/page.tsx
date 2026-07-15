import Link from "next/link";
import { TOOLS } from "@/core/tools/registry";
import { CREDIT_COSTS, DEFAULT_CREDIT_COST, WATCHLIST_READ_COST, DOWNLOAD_PROXY_COST, TIERS } from "@/core/api/credits";

export const metadata = {
  title: "API Docs — DecodeCreator",
  description:
    "Full reference for the DecodeCreator API. Analyze any public Instagram, TikTok, or YouTube account programmatically. REST + JSON, x-api-key auth, pay-per-credit.",
};

const BASE_URL = "https://decodecreator.com";

export default function DocsPage() {
  const toolsById = TOOLS.filter((t) => t.phase === 0).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <article className="container max-w-4xl py-12 space-y-14">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Developer API · v1
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">DecodeCreator API</h1>
        <p className="text-muted-foreground max-w-2xl">
          Analyze any public Instagram, TikTok, or YouTube account with one endpoint. REST + JSON,
          x-api-key auth, credit-based pricing. All 11 tools available programmatically.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/account?tab=api-keys" className="rounded-md bg-gradient-ig text-white px-4 py-2 hover:brightness-110 transition font-medium">
            Get your API key →
          </Link>
          <Link href="#quickstart" className="rounded-md border border-border bg-card/60 px-4 py-2 hover:border-primary/50 transition">
            Quickstart
          </Link>
          <Link href="#endpoints" className="rounded-md border border-border bg-card/60 px-4 py-2 hover:border-primary/50 transition">
            Endpoints
          </Link>
          <Link href="#errors" className="rounded-md border border-border bg-card/60 px-4 py-2 hover:border-primary/50 transition">
            Errors
          </Link>
        </div>
      </header>

      <section id="quickstart" className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Quickstart</h2>
        <p className="text-muted-foreground">
          Every request needs your API key in the <code className="mx-1 px-1.5 py-0.5 rounded bg-black/30 text-xs">x-api-key</code> header.
          Base URL: <code className="mx-1 px-1.5 py-0.5 rounded bg-black/30 text-xs">{BASE_URL}</code>
        </p>

        <CodeBlock lang="bash" label="Get engagement rate for @mkbhd on Instagram">
{`curl -H "x-api-key: dc_live_YOUR_KEY_HERE" \\
  "${BASE_URL}/v1/scan/instagram/mkbhd?tool=engagement-rate"`}
        </CodeBlock>

        <CodeBlock lang="js" label="Node.js (fetch)">
{`const res = await fetch(
  "${BASE_URL}/v1/scan/instagram/mkbhd?tool=engagement-rate",
  { headers: { "x-api-key": process.env.DC_KEY } }
);
const json = await res.json();
console.log(json.data.free.engagementRatePct);`}
        </CodeBlock>

        <CodeBlock lang="python" label="Python (requests)">
{`import os, requests
r = requests.get(
  "${BASE_URL}/v1/scan/instagram/mkbhd?tool=engagement-rate",
  headers={"x-api-key": os.environ["DC_KEY"]},
)
print(r.json()["data"]["free"]["engagementRatePct"])`}
        </CodeBlock>

        <p className="text-sm text-muted-foreground">
          Response envelope: every successful call returns{" "}
          <code className="mx-1 px-1.5 py-0.5 rounded bg-black/30 text-xs">
            {`{ ok: true, tool, platform, handle, credits: {charged, remaining}, data }`}
          </code>
          . On error, <code className="mx-1 px-1.5 py-0.5 rounded bg-black/30 text-xs">{`{ ok: false, error, code }`}</code>.
        </p>
      </section>

      <section id="endpoints" className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">Endpoints</h2>

        <EndpointRow
          method="GET"
          path="/v1/scan/{platform}/{handle}?tool={toolId}"
          summary="Run any analytics tool on any account. Serves every tool in the registry — see the table below."
        />
        <EndpointRow
          method="GET"
          path="/v1/scan/{platform}/{handle}?tool=full-report"
          summary="Bundled call — runs every eligible tool and returns keyed results. Primitives share our cache so provider cost is closer to 4-5 API calls than the sum of all tools."
        />
        <EndpointRow
          method="POST"
          path="/v1/watchlist"
          summary="Add an account to your monitoring watchlist. Body: {platform, handle, label?}"
        />
        <EndpointRow
          method="GET"
          path="/v1/watchlist"
          summary={`List watched accounts with their latest snapshot + follower delta. Costs ${WATCHLIST_READ_COST} credits.`}
        />
        <EndpointRow
          method="DELETE"
          path="/v1/watchlist/{id}"
          summary="Untrack a watched account. Free."
        />
        <EndpointRow
          method="GET"
          path="/v1/download?url={media_url}[&filename=X&stream=1]"
          summary={`Proxy a thumbnail or video URL through our infra (bypasses CDN hotlink blocks). Costs ${DOWNLOAD_PROXY_COST} credits.`}
        />
        <EndpointRow
          method="GET"
          path="/embed/{toolId}/{platform}/{handle}?theme=light|dark"
          summary="Iframe-safe rendering of any tool. Free (no API key needed). Suitable for embedding in your customer dashboards."
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Tools + credit costs</h2>
        <div className="rounded-xl border border-border bg-card/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Tool ID</th>
                <th className="text-left px-4 py-3">What it returns</th>
                <th className="text-left px-4 py-3">Platforms</th>
                <th className="text-right px-4 py-3">Credits</th>
              </tr>
            </thead>
            <tbody>
              {toolsById.map((t) => (
                <tr key={t.id} className="border-b border-border/50 last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs">{t.id}</td>
                  <td className="px-4 py-2">{t.name}</td>
                  <td className="px-4 py-2 text-xs">
                    {t.platforms.map((p) => (
                      <span key={p} className="mr-1 inline-block rounded bg-black/30 px-1.5 py-0.5">
                        {p}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {CREDIT_COSTS[t.id] ?? DEFAULT_CREDIT_COST}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border">
                <td className="px-4 py-2 font-mono text-xs">full-report</td>
                <td className="px-4 py-2">All tools bundled (cache-shared primitives)</td>
                <td className="px-4 py-2 text-xs">
                  <span className="mr-1 inline-block rounded bg-black/30 px-1.5 py-0.5">instagram</span>
                  <span className="mr-1 inline-block rounded bg-black/30 px-1.5 py-0.5">tiktok</span>
                  <span className="mr-1 inline-block rounded bg-black/30 px-1.5 py-0.5">youtube</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {CREDIT_COSTS["full-report"]}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Failed scans do NOT charge credits — you only pay for successful responses.
          Cache hits are charged the same (data is still yours; cache saves us provider cost).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Plans</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          {Object.entries(TIERS).map(([id, t]) => (
            <div key={id} className="rounded-xl border border-border bg-card/60 p-4">
              <div className="text-sm font-medium">{t.name}</div>
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

      <section id="errors" className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Error codes</h2>
        <div className="rounded-xl border border-border bg-card/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">HTTP</th>
                <th className="text-left px-4 py-3">What it means</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {[
                ["no_api_key", 401, "x-api-key header missing"],
                ["invalid_api_key", 401, "Key not recognised"],
                ["revoked_api_key", 401, "Key was revoked in the dashboard"],
                ["credits_exhausted", 402, "Monthly credit allowance exceeded"],
                ["bad_platform", 400, "Platform must be instagram / tiktok / youtube"],
                ["missing_tool", 400, "?tool= query param is required for /v1/scan"],
                ["not_available", 404, "That tool isn't supported for that platform"],
                ["not_found", 404, "Handle doesn't exist / provider returned different account"],
                ["private_account", 422, "Account is private — public data only"],
                ["provider_rate_limit", 503, "Upstream provider is throttling us; retry in a minute"],
                ["data_source", 502, "Upstream provider returned an error"],
                ["host_not_allowed", 400, "/v1/download URL is from an un-allowlisted CDN"],
              ].map(([code, http, meaning]) => (
                <tr key={String(code)}>
                  <td className="px-4 py-2 font-mono text-xs">{String(code)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{http}</td>
                  <td className="px-4 py-2 text-xs">{String(meaning)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 pt-6 border-t border-border">
        <h2 className="text-2xl font-semibold tracking-tight">Support</h2>
        <p className="text-sm text-muted-foreground">
          Bugs, feature requests, or enterprise questions — email{" "}
          <a href="mailto:support.decodecreator@gmail.com" className="underline">
            support.decodecreator@gmail.com
          </a>
          . SLA on Pro and above.
        </p>
      </section>
    </article>
  );
}

function EndpointRow({ method, path, summary }: { method: string; path: string; summary: string }) {
  const methodColor: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    POST: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    DELETE: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${methodColor[method] ?? ""}`}
        >
          {method}
        </span>
        <code className="text-sm font-mono break-all">{path}</code>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{summary}</p>
    </div>
  );
}

function CodeBlock({ lang, label, children }: { lang: string; label: string; children: string }) {
  return (
    <div className="rounded-xl border border-border bg-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-black/30">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-muted-foreground font-mono uppercase">{lang}</span>
      </div>
      <pre className="p-4 overflow-x-auto text-xs font-mono text-foreground leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}
