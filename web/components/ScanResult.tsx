"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Platform, Region } from "@/core/types";
import type { ToolResult, SocialTool } from "@/core/tools/types";
import { getTool } from "@/core/tools/registry";
import { getView } from "./tools/registry";
import { PreviewBanner } from "./tools/primitives";
import { Paywall } from "./Paywall";

interface UsageInfo {
  tier: string;
  limit: number;
  used: number;
  window: "day" | "month";
  remaining: number;
}

interface ScanResponse {
  ok: true;
  entitled: boolean;
  result: ToolResult;
  scanKey: string;
  region: Region;
  isAuthed: boolean;
  usage?: UsageInfo;
}

interface ScanError {
  ok: false;
  error: string;
  code?: string;
  isAuthed?: boolean;
  currentTier?: string;
}

export function ScanResult({
  toolId,
  platform,
  handle,
}: {
  toolId: string;
  platform: Platform;
  handle: string;
}) {
  // Look up the tool inside the client — the SocialTool object holds a `run`
  // function, which can't be serialized across the server→client boundary, so
  // we accept only the id as a prop.
  const tool = getTool(toolId);
  if (!tool) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
        Unknown tool: {toolId}
      </div>
    );
  }
  const View = getView(tool.id);
  const shipped = tool.phase === 0;

  // Coming-soon tools render demo UI directly — no API call.
  if (!shipped) {
    return (
      <div className="space-y-6">
        <PreviewBanner phase={tool.phase as 1 | 2 | 3} />
        {View ? (
          <View platform={platform} handle={handle} entitled={false} />
        ) : (
          <div className="text-sm text-muted-foreground">No view registered for this tool.</div>
        )}
        <Paywall scanKey={`${platform}:${handle}:${tool.id}`} region="GLOBAL" isAuthed={false} />
      </div>
    );
  }

  // Live tool — fetch real data.
  return <LiveScan tool={tool} platform={platform} handle={handle} View={View} />;
}

function LiveScan({
  tool,
  platform,
  handle,
  View,
}: {
  tool: SocialTool;
  platform: Platform;
  handle: string;
  View: ReturnType<typeof getView>;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "data"; payload: ScanResponse }
    | { kind: "error"; message: string; code?: string }
  >({ kind: "loading" });
  // Optional per-tool params (e.g. engagement-rate post count). Views can
  // update these via the `onParamsChange` prop to trigger a re-fetch.
  const [params, setParams] = useState<Record<string, string | number | boolean>>({});
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const body: Record<string, unknown> = { platform, handle, toolId: tool.id };
    if (Object.keys(params).length > 0) body.params = params;
    fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const j = (await res.json()) as ScanResponse | ScanError;
        if (cancelled) return;
        if (!("ok" in j) || !j.ok) {
          setState({
            kind: "error",
            message: ("error" in j && j.error) || `Scan failed (${res.status})`,
            code: "code" in j ? j.code : undefined,
          });
          return;
        }
        setState({ kind: "data", payload: j });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ kind: "error", message: e instanceof Error ? e.message : "Network error" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, handle, tool.id, paramsKey]);

  if (state.kind === "loading") {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-muted animate-pulse rounded" />
        <div className="grid sm:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Backend is gated (no env / not implemented for this platform) — fall back to demo with banner.
  if (state.kind === "error") {
    // Private account: surface a clean message, no demo, no paywall.
    if (state.code === "private_account") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center space-y-3">
          <div className="text-4xl">🔒</div>
          <h3 className="text-xl font-semibold">This account is private</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            DecodeCreator only analyzes <span className="font-medium">public</span> accounts.
            We can't see private profiles' followers, posts, or engagement — that's by design.
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: try a different handle, or ask the account owner to make their profile public.
          </p>
        </div>
      );
    }
    // Upstream provider rate-limited us. Show honest message instead of
    // silently faking data — that was the whole point of adding this code.
    if (state.code === "provider_rate_limit") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center space-y-3">
          <div className="text-4xl">⏳</div>
          <h3 className="text-xl font-semibold">Upstream data provider is rate-limited</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {state.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-gradient-ig text-white px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      );
    }
    // Anonymous user hit a signed-in-only tool. Show a friendly sign-in gate,
    // not the generic error card.
    if (state.code === "auth_required") {
      return (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center space-y-3">
          <div className="text-4xl">🔐</div>
          <h3 className="text-xl font-semibold">Sign in to use this tool</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            This tool is available to signed-in users. Sign up free — 20 scans a month, no card required.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Link
              href={`/signup?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}`}
              className="rounded-md bg-gradient-ig text-white px-4 py-2 text-sm font-medium hover:brightness-110 transition"
            >
              Sign up free
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-border bg-card/60 px-4 py-2 text-sm hover:border-primary/50 transition"
            >
              See plans
            </Link>
          </div>
        </div>
      );
    }
    // Paid user on a plan that doesn't include this tool.
    if (state.code === "upgrade_required") {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center space-y-3">
          <div className="text-4xl">✨</div>
          <h3 className="text-xl font-semibold">Upgrade to unlock this tool</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {state.message}
          </p>
          <Link
            href="/pricing"
            className="inline-block rounded-md bg-gradient-ig text-white px-4 py-2 text-sm font-medium hover:brightness-110 transition"
          >
            See plans →
          </Link>
        </div>
      );
    }
    // Hit the daily/monthly cap. Different copy for anon vs signed-in.
    if (state.code === "rate_limit") {
      return (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center space-y-3">
          <div className="text-4xl">⏱️</div>
          <h3 className="text-xl font-semibold">You&apos;ve hit your scan limit</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {state.message}
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Link
              href="/pricing"
              className="rounded-md bg-gradient-ig text-white px-4 py-2 text-sm font-medium hover:brightness-110 transition"
            >
              See plans
            </Link>
            <Link
              href="?auth=signup"
              className="rounded-md border border-border bg-card/60 px-4 py-2 text-sm hover:border-primary/50 transition"
            >
              Sign up free
            </Link>
          </div>
        </div>
      );
    }
    // Account not found — the provider returned a different profile than
    // requested (fuzzy-match fallback), so we refused rather than show
    // wrong-account data.
    if (state.code === "not_found") {
      return (
        <div className="rounded-2xl border border-border bg-card/60 p-8 text-center space-y-3">
          <div className="text-4xl">🔍</div>
          <h3 className="text-xl font-semibold">Account not found</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {state.message}
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: copy the exact handle from the profile URL — capitalization and dots/underscores matter.
          </p>
        </div>
      );
    }
    const isComingSoon = state.code === "not_implemented";
    return (
      <div className="space-y-6">
        {isComingSoon ? (
          <PreviewBanner phase={2} />
        ) : (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm">
            <p className="font-medium text-destructive">Couldn't run this scan</p>
            <p className="text-muted-foreground mt-1">{state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm underline mt-3"
            >
              Try again
            </button>
          </div>
        )}
        {View && <View platform={platform} handle={handle} entitled={false} />}
        <Paywall scanKey={`${platform}:${handle}:${tool.id}`} region="GLOBAL" isAuthed={false} />
      </div>
    );
  }

  const { payload } = state;
  return (
    <div className="space-y-8">
      {payload.usage && <UsageBanner usage={payload.usage} isAuthed={payload.isAuthed} />}
      {View ? (
        <View
          platform={platform}
          handle={handle}
          entitled={payload.entitled}
          params={params}
          onParamsChange={setParams}
          data={{ ...payload.result.free, ...payload.result.locked }}
        />
      ) : (
        <div className="text-sm text-muted-foreground">No view registered for this tool.</div>
      )}
      {!payload.entitled && (
        <Paywall
          scanKey={payload.scanKey}
          region={payload.region}
          isAuthed={payload.isAuthed}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Generated {new Date(payload.result.generatedAt).toLocaleString()} · Public
        data only — the account is never notified.
      </p>
    </div>
  );
}

// Slim strip showing "X of Y scans used". Only rendered on tiers where
// the counter is meaningful (anon + free). Paid tiers have generous
// monthly caps, so we don't clutter their result view.
function UsageBanner({ usage, isAuthed }: { usage: UsageInfo; isAuthed: boolean }) {
  if (usage.tier !== "anon" && usage.tier !== "free") return null;
  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const isLast = usage.remaining <= 1;
  const isAnon = usage.tier === "anon";

  return (
    <div
      className={
        "rounded-xl border p-3 flex items-center gap-4 flex-wrap text-sm " +
        (isLast
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-border bg-card/60")
      }
    >
      <div className="flex-1 min-w-[200px]">
        <div className="font-medium">
          {usage.used} of {usage.limit} {isAnon ? "free scans today" : "scans this month"}
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
          <div
            className={
              "h-full rounded-full transition-all " +
              (isLast ? "bg-amber-400" : "bg-gradient-ig")
            }
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {isAnon && !isAuthed && (
        <Link
          href="?auth=signup"
          className="rounded-md bg-gradient-ig text-white px-3 py-1.5 text-xs font-medium hover:brightness-110 transition whitespace-nowrap"
        >
          Sign up · 20 free scans/mo
        </Link>
      )}
      {!isAnon && (
        <Link
          href="/pricing"
          className="rounded-md border border-primary/40 bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/20 transition whitespace-nowrap"
        >
          Upgrade for more →
        </Link>
      )}
    </div>
  );
}
