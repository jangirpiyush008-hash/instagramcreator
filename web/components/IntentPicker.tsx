"use client";

import Link from "next/link";
import { toolsForPlatform } from "@/core/tools/registry";
import type { Platform } from "@/core/types";

// Emoji-per-tool. Kept in this file (rather than adding an icon field to
// SocialTool) so the tool definitions stay lean — every tool file has to
// declare its intentLabel, blurb, platforms, and run(); adding an icon
// field would just duplicate what a small map does with one line per tool.
const TOOL_ICONS: Record<string, string> = {
  "engagement-rate": "📈",
  "username-checker": "🔎",
  "banned-hashtag": "🚫",
  "hashtag-finder": "#️⃣",
  "thumbnail-downloader": "🖼️",
  "earnings-estimator": "💰",
  "shadowban-checker": "👻",
  "comment-picker": "🎁",
  "unfollower-tracker": "📉",
  "fake-follower": "🕵️",
  "gender-split": "👥",
  "recent-posts": "🎞️",
  "live-counter": "⚡",
};

// Per-tool accent gradient. Cycled per row so the grid reads as a
// cohesive palette rather than 12 identical white cards.
const ACCENTS: string[] = [
  "from-pink-500/20 to-fuchsia-500/10",
  "from-cyan-500/20 to-sky-500/10",
  "from-amber-500/20 to-orange-500/10",
  "from-emerald-500/20 to-teal-500/10",
  "from-violet-500/20 to-purple-500/10",
  "from-rose-500/20 to-red-500/10",
];

export function IntentPicker({
  platform,
  handle,
  selectedToolId,
}: {
  platform: Platform;
  handle: string;
  selectedToolId?: string;
}) {
  // Read tools from the registry inside the client — SocialTool holds a `run`
  // function that can't cross the server→client boundary as a prop.
  const tools = toolsForPlatform(platform);
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tools.map((t, i) => {
        // Prefer the SEO slug for the canonical URL (indexable per-tool
        // page). Fall back to id if slug isn't set for some reason.
        const slug = t.seo.slug ?? t.id;
        const href = `/${platform}/${encodeURIComponent(handle)}/${slug}`;
        const active = selectedToolId === t.id;
        const icon = TOOL_ICONS[t.id] ?? "🧪";
        const accent = ACCENTS[i % ACCENTS.length]!;
        return (
          <Link
            key={t.id}
            href={href}
            className={
              "group relative block rounded-2xl border p-5 transition-all overflow-hidden " +
              (active
                ? "border-primary/60 bg-card ring-1 ring-primary/40 shadow-md shadow-primary/10"
                : "border-border bg-card/60 hover:border-primary/40 hover:bg-card hover:shadow-md hover:-translate-y-0.5")
            }
          >
            {/*
              Accent gradient background — bleeds in from top-right. Muted
              enough that the tool name still reads at high contrast, but
              gives each card a distinct color signature.
            */}
            <div
              className={
                "absolute -top-8 -right-8 h-32 w-32 rounded-full bg-gradient-to-br blur-2xl opacity-70 transition-opacity group-hover:opacity-100 " +
                accent
              }
              aria-hidden
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-2">
                <div className="text-3xl leading-none">{icon}</div>
                <div className="text-[10px] uppercase tracking-wider text-foreground/50 font-semibold">
                  {t.phase === 0 ? "Live" : "Beta"}
                </div>
              </div>
              <h3 className="text-base font-bold tracking-tight mt-4">
                {t.name}
              </h3>
              <p className="text-sm text-foreground/70 mt-1 leading-snug">
                {t.intentLabel}
              </p>
              <p className="text-xs text-foreground/60 mt-3 leading-relaxed line-clamp-2">
                {t.blurb}
              </p>
              <div className="mt-4 text-xs font-semibold text-primary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                Open →
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
