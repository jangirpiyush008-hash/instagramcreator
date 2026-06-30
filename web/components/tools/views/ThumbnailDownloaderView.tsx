"use client";

import { MetricCard, SectionTitle } from "../primitives";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK_RESOLUTIONS = [
  { label: "Standard (640×360)", locked: false, url: "#" },
  { label: "HD (1280×720)", locked: true, url: null },
  { label: "Full HD (1920×1080)", locked: true, url: null },
  { label: "Max-res (original)", locked: true, url: null },
];

export function ThumbnailDownloaderView({ handle, platform, entitled, data }: Props) {
  const post = (data?.post as { title?: string; postedAt?: string } | undefined) ?? {
    title: "How I built this in a weekend",
    postedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
  };
  const resolutions =
    (data?.resolutions as typeof FALLBACK_RESOLUTIONS | undefined) ?? FALLBACK_RESOLUTIONS;
  const postedAgo = post.postedAt
    ? `${Math.max(1, Math.round((Date.now() - new Date(post.postedAt).getTime()) / 86400_000))} days ago`
    : "recently";

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle}`}>Most recent {platform === "tiktok" ? "video" : "post"}</SectionTitle>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="rounded-xl border border-border bg-card/60 p-3 overflow-hidden">
          <div
            className="aspect-video w-full rounded-lg relative overflow-hidden"
            style={{
              backgroundImage:
                "linear-gradient(135deg, hsl(322 95% 50% / 0.85), hsl(268 84% 55% / 0.85)), radial-gradient(circle at 30% 30%, hsl(30 100% 60% / 0.6), transparent 60%)",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-white/95 text-black h-16 w-16 flex items-center justify-center shadow-xl">
                <svg viewBox="0 0 24 24" className="h-7 w-7 ml-1" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            <div className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
              12:34
            </div>
          </div>
          <div className="px-2 pt-3 pb-1">
            <div className="font-medium">{post.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Posted {postedAgo} · public
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {resolutions.map((s) => {
            const locked = s.locked && !entitled;
            return (
              <button
                key={s.label}
                disabled={locked}
                className={
                  "w-full flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3 transition-all " +
                  (locked
                    ? "opacity-70 cursor-not-allowed"
                    : "hover:border-primary/50 hover:-translate-y-0.5")
                }
              >
                <div className="text-left">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {locked ? "Unlock to download" : "Click to download"}
                  </div>
                </div>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                    (locked
                      ? "border border-border bg-muted text-muted-foreground"
                      : "bg-gradient-ig text-white")
                  }
                >
                  {locked ? "Locked" : "Free"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section>
        <SectionTitle>What's included</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Free" value="SD" sub="640 × 360 — always" accent="pink" />
          <MetricCard label="Unlock" value="HD + 4K" sub="up to original-res" accent="cyan" />
          <MetricCard label="Subscriber" value="Bulk export" sub="last 50 posts at once" accent="amber" />
        </div>
      </section>
    </div>
  );
}
