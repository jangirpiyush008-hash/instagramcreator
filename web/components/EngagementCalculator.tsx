"use client";

import { useMemo, useState } from "react";
import { cn } from "@/web/lib/cn";

// Standalone engagement rate calculator — no API calls, pure math.
// Different formula per platform because each network measures reach
// differently:
//
//   Instagram: ER = (avg likes + avg comments) / followers × 100
//     — followers-based because IG's algorithm mostly serves your
//       followers; reach ≈ followers for the average creator.
//
//   TikTok:   ER = (avg likes + avg comments + avg shares) / avg views × 100
//     — views-based because TikTok's FYP shows content to non-followers
//       at massive scale, so followers is a bad reach denominator.
//       Shares (repost/send) are counted — they're a strong TikTok signal.
//
//   YouTube:  ER = (likes + comments) / views × 100
//     — views-based because YouTube is search + suggested-driven; most
//       views come from non-subscribers on any given video. Subscribers
//       aren't in the formula for the same reason TikTok drops followers.
//
// Benchmarks below are rough industry averages compiled from Later,
// HypeAuditor, Modash, and Influencer Marketing Hub 2024–2025 reports.
// We surface them so a user can interpret their own number.

type Platform = "instagram" | "tiktok" | "youtube";

interface PlatformConfig {
  id: Platform;
  label: string;
  gradient: string;
  denominator: "followers" | "views";
  fields: { key: string; label: string; hint: string }[];
  formulaLabel: string;
  computer: (v: Record<string, number>) => number | null;
  benchmarks: { label: string; min: number; max: number }[];
}

const CONFIGS: PlatformConfig[] = [
  {
    id: "instagram",
    label: "Instagram",
    gradient: "bg-gradient-ig",
    denominator: "followers",
    fields: [
      { key: "followers", label: "Followers", hint: "Total followers on the account" },
      { key: "avgLikes", label: "Avg likes / post", hint: "Average likes across your last 12 posts" },
      { key: "avgComments", label: "Avg comments / post", hint: "Average comments across your last 12 posts" },
    ],
    formulaLabel: "ER = (avg likes + avg comments) / followers × 100",
    computer: (v) => {
      const followers = v.followers ?? 0;
      if (followers <= 0) return null;
      return (((v.avgLikes ?? 0) + (v.avgComments ?? 0)) / followers) * 100;
    },
    benchmarks: [
      { label: "Weak", min: 0, max: 1 },
      { label: "Average", min: 1, max: 3 },
      { label: "Strong", min: 3, max: 6 },
      { label: "Excellent", min: 6, max: 100 },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    gradient: "bg-gradient-tt",
    denominator: "views",
    fields: [
      { key: "avgViews", label: "Avg views / video", hint: "Average views across your last 10 videos" },
      { key: "avgLikes", label: "Avg likes / video", hint: "Average likes across your last 10 videos" },
      { key: "avgComments", label: "Avg comments / video", hint: "Average comments across your last 10 videos" },
      { key: "avgShares", label: "Avg shares / video", hint: "Average shares/reposts across your last 10 videos" },
    ],
    formulaLabel: "ER = (avg likes + avg comments + avg shares) / avg views × 100",
    computer: (v) => {
      const views = v.avgViews ?? 0;
      if (views <= 0) return null;
      return (((v.avgLikes ?? 0) + (v.avgComments ?? 0) + (v.avgShares ?? 0)) / views) * 100;
    },
    benchmarks: [
      { label: "Weak", min: 0, max: 4 },
      { label: "Average", min: 4, max: 9 },
      { label: "Strong", min: 9, max: 15 },
      { label: "Excellent", min: 15, max: 100 },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    gradient: "bg-gradient-yt",
    denominator: "views",
    fields: [
      { key: "avgViews", label: "Avg views / video", hint: "Average views across your last 10 videos" },
      { key: "avgLikes", label: "Avg likes / video", hint: "Average likes across your last 10 videos" },
      { key: "avgComments", label: "Avg comments / video", hint: "Average comments across your last 10 videos" },
    ],
    formulaLabel: "ER = (likes + comments) / views × 100",
    computer: (v) => {
      const views = v.avgViews ?? 0;
      if (views <= 0) return null;
      return (((v.avgLikes ?? 0) + (v.avgComments ?? 0)) / views) * 100;
    },
    benchmarks: [
      { label: "Weak", min: 0, max: 2 },
      { label: "Average", min: 2, max: 5 },
      { label: "Strong", min: 5, max: 10 },
      { label: "Excellent", min: 10, max: 100 },
    ],
  },
];

function classify(rate: number, benchmarks: PlatformConfig["benchmarks"]) {
  for (const b of benchmarks) {
    if (rate >= b.min && rate < b.max) return b;
  }
  return benchmarks[benchmarks.length - 1]!;
}

function colorFor(label: string): string {
  if (label === "Excellent") return "text-emerald-500";
  if (label === "Strong") return "text-green-500";
  if (label === "Average") return "text-amber-500";
  return "text-rose-500";
}

export function EngagementCalculator() {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [values, setValues] = useState<Record<string, string>>({});

  const cfg = CONFIGS.find((c) => c.id === platform)!;

  // Coerce string inputs → numbers for the formula. Empty/invalid → 0.
  const numeric = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const f of cfg.fields) {
      const raw = values[f.key] ?? "";
      const n = Number(raw.replace(/,/g, ""));
      out[f.key] = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    return out;
  }, [cfg.fields, values]);

  const rate = cfg.computer(numeric);
  const anyInput = Object.values(numeric).some((v) => v > 0);

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-5 sm:p-8 shadow-lg shadow-black/5 dark:shadow-black/30">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">
            Free tool
          </div>
          <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Engagement Rate Calculator
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
            Enter a few numbers from your profile — get your engagement rate
            with an honest benchmark. Different formula per platform because
            IG measures reach differently from TikTok and YouTube.
          </p>
        </div>
      </div>

      {/* Platform tabs */}
      <div className="inline-flex rounded-full border border-border bg-background/60 p-1 mb-6">
        {CONFIGS.map((c) => {
          const active = platform === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setPlatform(c.id)}
              aria-pressed={active}
              className={cn(
                "px-4 sm:px-5 py-2 text-sm rounded-full transition-all font-medium",
                active
                  ? `${c.gradient} text-white shadow-md`
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8">
        {/* Inputs */}
        <div className="space-y-3">
          {cfg.fields.map((f) => (
            <label key={f.key} className="block">
              <div className="text-sm font-medium mb-1">{f.label}</div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9,]*"
                placeholder="0"
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                className="h-11 w-full rounded-lg border border-input bg-background/80 px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 transition-all tabular-nums"
              />
              <div className="text-xs text-muted-foreground mt-1">{f.hint}</div>
            </label>
          ))}
          <div className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
            Formula: <code className="font-mono">{cfg.formulaLabel}</code>
          </div>
        </div>

        {/* Result */}
        <div className="rounded-xl border border-border bg-background/60 p-6 flex flex-col justify-center min-h-[220px]">
          {rate == null || !anyInput ? (
            <div className="text-center text-muted-foreground text-sm">
              Fill in the fields to see your engagement rate.
            </div>
          ) : (
            (() => {
              const cls = classify(rate, cfg.benchmarks);
              const color = colorFor(cls.label);
              return (
                <>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 text-center">
                    Your engagement rate
                  </div>
                  <div className="text-5xl sm:text-6xl font-bold text-center tabular-nums">
                    {rate.toFixed(2)}
                    <span className="text-2xl text-muted-foreground ml-1">%</span>
                  </div>
                  <div className={`text-center mt-3 font-semibold ${color}`}>
                    {cls.label} for {cfg.label}
                  </div>
                  <div className="mt-5 space-y-1.5 text-xs">
                    {cfg.benchmarks.map((b) => {
                      const isCurrent = b.label === cls.label;
                      return (
                        <div
                          key={b.label}
                          className={cn(
                            "flex items-center justify-between rounded-md px-3 py-1.5",
                            isCurrent ? "bg-muted font-semibold" : "text-muted-foreground",
                          )}
                        >
                          <span>{b.label}</span>
                          <span className="tabular-nums">
                            {b.min.toFixed(1)}
                            {b.max < 100 ? `–${b.max.toFixed(1)}` : "+"}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 pt-6 border-t border-border/60">
        <div className="text-sm text-muted-foreground">
          Want a live scan on any public {cfg.label} account?
        </div>
        <a
          href={`/${cfg.id}/mkbhd/engagement-rate-calculator`}
          className={cn(
            "inline-flex items-center gap-2 rounded-full text-white px-4 py-2 text-sm font-semibold hover:brightness-110 transition shadow-md",
            cfg.gradient,
          )}
        >
          Run a real scan →
        </a>
      </div>
    </div>
  );
}
