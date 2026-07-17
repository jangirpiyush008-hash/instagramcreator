"use client";

import { useEffect, useState } from "react";
import type { Platform } from "@/core/types";
import { ScanResult } from "@/web/components/ScanResult";
import { normalizeHandle, isValidHandle } from "@/core/utils/handle";
import { useHandle, usePlatform } from "./PlatformContext";
import { creditCost } from "@/core/api/credits";

// Inline workspace for a single tool. Rendered inside DashboardShell's
// main area when the user picks a tool from the sidebar. No navigation —
// user enters a handle, hits fetch, ScanResult renders below.
//
// Platform comes from PlatformContext (top-bar toggle). Popular suggestions
// are curated per platform so a TikTok tab doesn't suggest @mkbhd IG.

const POPULAR_BY_PLATFORM: Record<Platform, string[]> = {
  instagram: ["mkbhd", "nike", "natgeo"],
  tiktok: ["khaby.lame", "charlidamelio", "mrbeast"],
  youtube: ["mkbhd", "mrbeast", "veritasium"],
};

interface Props {
  toolId: string;
  toolName: string;
  intentLabel: string;
  blurb: string;
  supportedPlatforms: Platform[];
}

export function ToolWorkspace({
  toolId,
  toolName,
  intentLabel,
  blurb,
  supportedPlatforms,
}: Props) {
  const platform = usePlatform();
  const { handle: sharedHandle, setHandle } = useHandle();
  const [handleInput, setHandleInput] = useState(sharedHandle ?? "");
  // The handle that actually gets sent — we set it on submit so ScanResult
  // only mounts (and fetches) when the user asks for it, not on every
  // keystroke. When the user pre-scanned via Overview master-search, we
  // auto-submit here so the tool renders immediately on tab switch (uses
  // the primitive cache — no extra API cost).
  const [submittedHandle, setSubmittedHandle] = useState<string | null>(
    sharedHandle ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  // React to Overview → tool switches: if the shared handle changes while
  // this workspace is mounted, re-run against the new handle. Also
  // hydrates on first mount when the shared handle came from localStorage.
  useEffect(() => {
    if (sharedHandle && sharedHandle !== submittedHandle) {
      setHandleInput(sharedHandle);
      setSubmittedHandle(sharedHandle);
    }
    // We deliberately don't depend on submittedHandle — clearing it
    // shouldn't force a re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedHandle]);

  const supported = supportedPlatforms.includes(platform);
  const cost = creditCost(toolId);
  const popular = POPULAR_BY_PLATFORM[platform];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const h = normalizeHandle(handleInput);
    if (!h || !isValidHandle(h)) {
      setError("Enter a valid handle (letters, numbers, dots, dashes, underscores).");
      return;
    }
    setSubmittedHandle(h);
    // Promote this handle to the shell-wide shared handle so if the user
    // switches tools next, the new tool already has it pre-filled.
    setHandle(h);
  }

  function tryPopular(h: string) {
    const clean = normalizeHandle(h);
    setHandleInput(h);
    setSubmittedHandle(clean);
    setHandle(clean);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* HEADER */}
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-foreground/60 font-semibold">
          {toolName}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{intentLabel}</h1>
        <p className="text-foreground/70 text-sm">{blurb}</p>
      </header>

      {/* SEARCH WORKSPACE */}
      {supported ? (
        <div className="rounded-2xl border border-border bg-card/70 p-5 sm:p-6 space-y-4">
          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" aria-hidden>
                🔍
              </span>
              <input
                type="text"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                placeholder={`Enter ${labelFor(platform)} username (e.g., ${popular[0] ?? "creator"})`}
                className="w-full h-12 rounded-lg border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!handleInput.trim()}
              className="h-12 px-6 rounded-lg bg-gradient-ig text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60 transition"
            >
              Fetch →
            </button>
          </form>

          <div className="flex items-center justify-between flex-wrap gap-3 text-xs">
            <div className="text-foreground/60">
              Costs <span className="font-semibold text-foreground/80">{cost} credit{cost === 1 ? "" : "s"}</span> per successful scan
            </div>
            <div className="flex items-center gap-2">
              <span className="text-foreground/60">Popular:</span>
              {popular.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => tryPopular(h)}
                  className="rounded-md bg-muted/70 hover:bg-muted px-2 py-1 text-foreground/80 transition"
                >
                  @{h}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-sm space-y-2">
          <div className="font-semibold text-amber-800 dark:text-amber-200">
            Not available on {labelFor(platform)}
          </div>
          <p className="text-foreground/70">
            {toolName} only runs on: {supportedPlatforms.map(labelFor).join(", ")}. Switch platforms
            using the toggle at the top of the page.
          </p>
        </div>
      )}

      {/* RESULT — renders on submit. Uses the existing ScanResult
          component so we get the same views, gating, and error handling
          the public /platform/handle/toolSlug page has. */}
      {supported && submittedHandle && (
        <div className="pt-2" key={`${platform}-${submittedHandle}`}>
          <ScanResult
            toolId={toolId}
            platform={platform}
            handle={submittedHandle}
          />
        </div>
      )}
    </div>
  );
}

function labelFor(p: Platform): string {
  if (p === "instagram") return "Instagram";
  if (p === "tiktok") return "TikTok";
  return "YouTube";
}
