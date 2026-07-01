"use client";

import { useEffect, useState } from "react";
import type { Platform, Region } from "@/core/types";
import type { ToolResult, SocialTool } from "@/core/tools/types";
import { getTool } from "@/core/tools/registry";
import { getView } from "./tools/registry";
import { PreviewBanner } from "./tools/primitives";
import { Paywall } from "./Paywall";

interface ScanResponse {
  ok: true;
  entitled: boolean;
  result: ToolResult;
  scanKey: string;
  region: Region;
  isAuthed: boolean;
}

interface ScanError {
  ok: false;
  error: string;
  code?: string;
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

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, handle, toolId: tool.id }),
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
  }, [platform, handle, tool.id]);

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
      {View ? (
        <View
          platform={platform}
          handle={handle}
          entitled={payload.entitled}
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
