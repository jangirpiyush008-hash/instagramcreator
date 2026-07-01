"use client";

import { LockedMetric, MetricCard, SectionTitle } from "../primitives";
import { MediaCard } from "../MediaCard";
import type { Platform } from "@/core/types";

interface RawPost {
  id?: string;
  title?: string;
  caption?: string;
  postedAt?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  thumbnailUrlHd?: string;
  videoUrl?: string;
  videoUrlHd?: string;
  permalink?: string;
  likes?: number;
  comments?: number;
  views?: number;
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

const FALLBACK = {
  followers: 184_320,
  niche: "Tech / creator",
  postingCadencePerMonth: 9,
  perPostMin: 320,
  perPostMax: 980,
  perMonth: 12_400,
  perYear: 148_800,
  currency: "USD" as "USD" | "INR",
};

export function EarningsEstimatorView({ handle, platform, entitled, data }: Props) {
  const d = {
    followers: (data?.followers as number) ?? FALLBACK.followers,
    niche: (data?.niche as string) ?? FALLBACK.niche,
    postingCadencePerMonth: (data?.postingCadencePerMonth as number) ?? FALLBACK.postingCadencePerMonth,
    perPostMin: (data?.perPostMin as number) ?? FALLBACK.perPostMin,
    perPostMax: (data?.perPostMax as number) ?? FALLBACK.perPostMax,
    perMonth: (data?.perMonth as number) ?? FALLBACK.perMonth,
    perYear: (data?.perYear as number) ?? FALLBACK.perYear,
    currency: (data?.currency as "USD" | "INR") ?? FALLBACK.currency,
  };
  const sym = d.currency === "INR" ? "₹" : "$";

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · ${platform}`}>Estimated brand-deal value</SectionTitle>

      <div className="rounded-xl bg-gradient-ig p-[1px]">
        <div className="rounded-[calc(theme(borderRadius.xl)-1px)] bg-card p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Per sponsored post</div>
          <div className={"text-5xl sm:text-6xl font-bold tracking-tight tabular-nums mt-2 " + (entitled ? "" : "blur-locked")}>
            {sym}{d.perPostMin.toLocaleString()} – {sym}{d.perPostMax.toLocaleString()}
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Range based on engagement rate, niche, and audience location. Active negotiations typically land mid-range.
          </p>
        </div>
      </div>

      <section>
        <SectionTitle>Free</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Followers" value={d.followers.toLocaleString()} accent="pink" />
          <MetricCard label="Posts / month" value={d.postingCadencePerMonth} sub="public posting cadence" />
          <MetricCard label="Niche" value={d.niche} sub="inferred from captions" />
        </div>
      </section>

      <section>
        <SectionTitle>Locked report</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <LockedMetric label="Per-post (mid)" value={`${sym}${Math.round((d.perPostMin + d.perPostMax) / 2).toLocaleString()}`} entitled={entitled} accent="pink" />
          <LockedMetric label="Monthly potential" value={`${sym}${d.perMonth.toLocaleString()}`} entitled={entitled} accent="cyan" />
          <LockedMetric label="Annual potential" value={`${sym}${d.perYear.toLocaleString()}`} entitled={entitled} accent="emerald" />
        </div>
      </section>

      {(() => {
        const samplePosts = (data?.samplePosts as RawPost[] | undefined) ?? [];
        if (samplePosts.length === 0) return null;
        const mcPlatform: "instagram" | "tiktok" = platform === "tiktok" ? "tiktok" : "instagram";
        const safeHandle = handle.replace(/[^\w.\-]/g, "_");
        return (
          <section>
            <SectionTitle hint="top-performing recent posts">Sample posts used in this estimate</SectionTitle>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {samplePosts.map((p, i) => (
                <MediaCard
                  key={p.id ?? i}
                  platform={mcPlatform}
                  handle={safeHandle}
                  post={{
                    id: p.id ?? `sample-${i}`,
                    caption: p.caption,
                    title: p.title,
                    postedAt: p.postedAt,
                    durationSec: p.durationSec,
                    thumbnailUrl: p.thumbnailUrl,
                    thumbnailUrlHd: p.thumbnailUrlHd,
                    videoUrl: p.videoUrl,
                    videoUrlHd: p.videoUrlHd,
                    permalink: p.permalink,
                    likes: p.likes,
                    comments: p.comments,
                    views: p.views,
                  }}
                />
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
