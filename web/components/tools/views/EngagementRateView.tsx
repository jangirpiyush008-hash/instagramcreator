"use client";

import { Gauge, LockedMetric, MetricCard, SectionTitle, Sparkline } from "../primitives";
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

type ToolParams = Record<string, string | number | boolean>;

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
  params?: ToolParams;
  onParamsChange?: (next: ToolParams) => void;
}

const POST_COUNT_OPTIONS = [6, 12, 24, 50];

const SAMPLE = {
  displayName: "Sample Creator",
  followers: 184_320,
  verified: true,
  postsAnalyzed: 12,
  engagementRatePct: 4.21,
  avgLikes: 5832,
  avgComments: 174,
  benchmark: "above average",
  trend: [3.1, 3.3, 2.9, 3.6, 3.8, 3.5, 4.1, 3.9, 4.3, 4.2, 4.6, 4.21],
};

export function EngagementRateView({ entitled, data, handle, platform, params, onParamsChange }: Props) {
  const activeCount =
    typeof params?.postCount === "number"
      ? params.postCount
      : (data?.postsAnalyzed as number | undefined) ?? 12;
  const src = data ?? {};
  const d = {
    displayName: (src.displayName as string) ?? SAMPLE.displayName,
    followers: (src.followers as number) ?? SAMPLE.followers,
    verified: (src.verified as boolean) ?? SAMPLE.verified,
    postsAnalyzed: (src.postsAnalyzed as number) ?? SAMPLE.postsAnalyzed,
    engagementRatePct: (src.engagementRatePct as number) ?? SAMPLE.engagementRatePct,
    avgLikes: (src.avgLikes as number) ?? SAMPLE.avgLikes,
    avgComments: (src.avgComments as number) ?? SAMPLE.avgComments,
    benchmark: (src.benchmark as string) ?? SAMPLE.benchmark,
  };
  const trend = (src.trend as number[] | undefined) ?? SAMPLE.trend;
  const topPosts = (src.topPosts as RawPost[] | undefined) ?? [];
  const mcPlatform: "instagram" | "tiktok" = platform === "tiktok" ? "tiktok" : "instagram";
  const safeHandle = handle.replace(/[^\w.\-]/g, "_");

  return (
    <div className="space-y-8">
      {onParamsChange && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">
            Analyze
          </span>
          {POST_COUNT_OPTIONS.map((n) => {
            const isActive = n === activeCount;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onParamsChange({ ...params, postCount: n })}
                className={
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all " +
                  (isActive
                    ? "bg-gradient-ig text-white shadow-md"
                    : "border border-border bg-card/60 text-muted-foreground hover:border-primary/50 hover:text-foreground")
                }
              >
                {n} posts
              </button>
            );
          })}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-stretch">
        <div className="rounded-xl border border-border bg-card/60 p-6">
          <SectionTitle hint={`${d.postsAnalyzed} posts`}>Engagement rate</SectionTitle>
          <Gauge value={d.engagementRatePct} max={10} entitled={entitled} label={d.benchmark} />
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-6">
          <SectionTitle hint="last 12 posts">Trend</SectionTitle>
          <Sparkline values={trend} blurred={!entitled} height={120} />
          <p className="text-xs text-muted-foreground mt-2">
            ER % across the {d.postsAnalyzed} most recent {platform === "youtube" ? "videos" : "posts"}.
          </p>
        </div>
      </div>

      <section>
        <SectionTitle>Free</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Followers" value={d.followers.toLocaleString()} accent="pink" />
          <MetricCard label="Posts analyzed" value={d.postsAnalyzed} />
          <MetricCard label="Verified" value={d.verified ? "Yes" : "No"} />
        </div>
      </section>

      <section>
        <SectionTitle>Locked report</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <LockedMetric label="Avg likes / post" value={d.avgLikes.toLocaleString()} entitled={entitled} accent="pink" />
          <LockedMetric label="Avg comments / post" value={d.avgComments.toLocaleString()} entitled={entitled} accent="cyan" />
          <LockedMetric label="Benchmark" value={d.benchmark} sub={`${platform} creators`} entitled={entitled} accent="amber" />
        </div>
      </section>

      {topPosts.length > 0 && (
        <section>
          <SectionTitle hint="highest likes + comments">Top posts driving this score</SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {topPosts.map((p, i) => (
              <MediaCard
                key={p.id ?? i}
                platform={mcPlatform}
                handle={safeHandle}
                post={{
                  id: p.id ?? `top-${i}`,
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
      )}

      <p className="text-xs text-muted-foreground">
        @{handle} · {platform} · public-data analysis.
      </p>
    </div>
  );
}
