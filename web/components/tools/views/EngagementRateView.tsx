"use client";

import { Gauge, MetricCard, SectionTitle, Sparkline } from "../primitives";
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
  views?: number | null;
  engagementRatePct?: number;
  viewsPerFollowerPct?: number | null;
  commentToLikeRatio?: number;
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

function fmtCount(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString()}`;
}

export function EngagementRateView({ data, handle, platform, params, onParamsChange }: Props) {
  const src = data ?? {};
  const activeCount =
    typeof params?.postCount === "number"
      ? params.postCount
      : (src.postsAnalyzed as number | undefined) ?? 12;

  // Headline + aggregate
  const followers = (src.followers as number) ?? 0;
  const following = (src.following as number) ?? 0;
  const verified = (src.verified as boolean) ?? false;
  const displayName = (src.displayName as string) ?? handle;
  const postsAnalyzed = (src.postsAnalyzed as number) ?? 0;
  const engagementRatePct = (src.engagementRatePct as number) ?? 0;
  const avgLikes = (src.avgLikes as number) ?? 0;
  const avgComments = (src.avgComments as number) ?? 0;
  const medianEr = (src.medianEngagementRatePct as number) ?? 0;
  const stdevEr = (src.stdevEngagementRatePct as number) ?? 0;
  const consistency = (src.consistency as string) ?? "—";
  const benchmark = (src.benchmark as string) ?? "—";
  const benchmarkVerdict = (src.benchmarkVerdict as "below" | "healthy" | "above") ?? "healthy";
  const benchmarkBand = (src.benchmarkBand as string) ?? "—";
  const benchmarkHealthyMin = (src.benchmarkHealthyMin as number) ?? 0;
  const benchmarkHealthyMax = (src.benchmarkHealthyMax as number) ?? 0;

  const medianViewsPerFollower = src.medianViewsPerFollowerPct as number | null | undefined;
  const postsWithViews = (src.postsWithViews as number) ?? 0;
  const medianCommentToLike = (src.medianCommentToLikePct as number) ?? 0;

  const postsPerWeek = (src.postsPerWeek as number) ?? 0;
  const oldestPostAt = src.oldestPostAt as string | undefined;
  const newestPostAt = src.newestPostAt as string | undefined;

  const bestPost = src.bestPost as RawPost | null | undefined;
  const worstPost = src.worstPost as RawPost | null | undefined;

  const trend = (src.trend as number[] | undefined) ?? [];
  const perPost = (src.perPost as RawPost[] | undefined) ?? [];
  const topPosts = (src.topPosts as RawPost[] | undefined) ?? [];

  const mcPlatform: "instagram" | "tiktok" | "youtube" =
    platform === "tiktok" ? "tiktok" : platform === "youtube" ? "youtube" : "instagram";
  const safeHandle = handle.replace(/[^\w.\-]/g, "_");

  const verdictColor: "emerald" | "amber" | "red" =
    benchmarkVerdict === "above" ? "emerald" :
    benchmarkVerdict === "healthy" ? "emerald" :
    "amber";

  const postLabel = platform === "youtube" ? "videos" : "posts";

  return (
    <div className="space-y-8">
      {onParamsChange && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Analyze</span>
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
                {n} {postLabel}
              </button>
            );
          })}
        </div>
      )}

      {/* Headline */}
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-stretch">
        <div className="rounded-xl border border-border bg-card/60 p-6">
          <SectionTitle hint={`${postsAnalyzed} ${postLabel}`}>Engagement rate</SectionTitle>
          <Gauge value={engagementRatePct} max={10} entitled label={benchmark} />
          <p className="text-xs text-muted-foreground mt-3">
            {displayName} · {followers.toLocaleString()} followers{verified ? " · verified" : ""}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-6">
          <SectionTitle hint={`last ${postsAnalyzed} ${postLabel}`}>Trend</SectionTitle>
          {trend.length > 1 ? <Sparkline values={trend} height={120} /> : (
            <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
              Not enough data for a trend yet.
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            ER % across the {postsAnalyzed} most recent {postLabel}.
          </p>
        </div>
      </div>

      {/* Statistical distribution */}
      <section>
        <SectionTitle hint="mean can be skewed by one viral post — check median too">Distribution</SectionTitle>
        <div className="grid sm:grid-cols-4 gap-3">
          <MetricCard label="Mean ER" value={`${engagementRatePct.toFixed(2)}%`} accent="pink" sub="average across posts" />
          <MetricCard label="Median ER" value={`${medianEr.toFixed(2)}%`} accent="cyan" sub="middle post's ER" />
          <MetricCard label="Std dev" value={`±${stdevEr.toFixed(2)}%`} sub="spread from the mean" />
          <MetricCard
            label="Consistency"
            value={consistency}
            accent={consistency.startsWith("Very") ? "emerald" : consistency === "Consistent" ? "emerald" : "amber"}
            sub="tighter = predictable content"
          />
        </div>
      </section>

      {/* Benchmark for follower band */}
      <section>
        <SectionTitle hint={`${benchmarkBand} accounts`}>Benchmark vs peers</SectionTitle>
        <div className="rounded-xl border border-border bg-card/60 p-6 space-y-4">
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="text-4xl font-semibold tabular-nums">{engagementRatePct.toFixed(2)}%</div>
            <div className={`text-sm font-medium ${verdictColor === "emerald" ? "text-emerald-300" : verdictColor === "amber" ? "text-amber-300" : "text-red-300"}`}>
              {benchmark}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Healthy range for {benchmarkBand} {platform === "youtube" ? "channels" : "accounts"}: {benchmarkHealthyMin.toFixed(2)}% – {benchmarkHealthyMax.toFixed(2)}%
          </div>
          <BenchmarkBar
            current={engagementRatePct}
            low={benchmarkHealthyMin}
            high={benchmarkHealthyMax}
            max={Math.max(benchmarkHealthyMax * 1.4, engagementRatePct * 1.1, 5)}
          />
        </div>
      </section>

      {/* Reach + Quality */}
      <section>
        <SectionTitle>Reach & quality signals</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Avg likes" value={fmtCount(avgLikes)} accent="pink" />
          <MetricCard label="Avg comments" value={fmtCount(avgComments)} accent="cyan" />
          {medianViewsPerFollower !== null && medianViewsPerFollower !== undefined ? (
            <MetricCard
              label={platform === "youtube" ? "Views / subscriber" : "Views / follower"}
              value={`${medianViewsPerFollower.toFixed(1)}%`}
              sub={`${postsWithViews} of ${postsAnalyzed} ${postLabel} have views`}
              accent="emerald"
            />
          ) : (
            <MetricCard label="Views / follower" value="—" sub="no view counts on these posts" />
          )}
          <MetricCard
            label="Comment quality"
            value={`${medianCommentToLike.toFixed(2)}%`}
            sub="comments as % of likes — higher = deeper engagement"
            accent={medianCommentToLike > 1 ? "emerald" : medianCommentToLike > 0.3 ? "amber" : "red"}
          />
        </div>
      </section>

      {/* Cadence */}
      <section>
        <SectionTitle>Posting cadence</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard
            label="Posts / week"
            value={postsPerWeek.toFixed(1)}
            sub={`over the analyzed window`}
            accent="pink"
          />
          <MetricCard label="Oldest post" value={fmtDate(oldestPostAt)} sub="in the sample" />
          <MetricCard label="Newest post" value={fmtDate(newestPostAt)} sub="in the sample" />
        </div>
      </section>

      {/* Best / worst */}
      {(bestPost || worstPost) && (
        <section>
          <SectionTitle>Peak and valley</SectionTitle>
          <div className="grid md:grid-cols-2 gap-3">
            {bestPost && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="text-xs uppercase tracking-wider text-emerald-300 mb-2">Best-performing {postLabel.slice(0, -1)}</div>
                <div className="text-2xl font-semibold tabular-nums">{(bestPost.engagementRatePct ?? 0).toFixed(2)}%</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmtCount(bestPost.likes ?? 0)} likes · {fmtCount(bestPost.comments ?? 0)} comments
                  {bestPost.views !== null && bestPost.views !== undefined && ` · ${fmtCount(bestPost.views)} views`}
                </div>
                {bestPost.permalink && (
                  <a href={bestPost.permalink} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-2 inline-block">
                    Open post ↗
                  </a>
                )}
              </div>
            )}
            {worstPost && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <div className="text-xs uppercase tracking-wider text-red-300 mb-2">Weakest {postLabel.slice(0, -1)}</div>
                <div className="text-2xl font-semibold tabular-nums">{(worstPost.engagementRatePct ?? 0).toFixed(2)}%</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmtCount(worstPost.likes ?? 0)} likes · {fmtCount(worstPost.comments ?? 0)} comments
                  {worstPost.views !== null && worstPost.views !== undefined && ` · ${fmtCount(worstPost.views)} views`}
                </div>
                {worstPost.permalink && (
                  <a href={worstPost.permalink} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-2 inline-block">
                    Open post ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Per-post breakdown */}
      {perPost.length > 0 && (
        <section>
          <SectionTitle hint="every analyzed post, sortable by column">Per-{postLabel.slice(0, -1)} breakdown</SectionTitle>
          <div className="rounded-xl border border-border bg-card/60 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left px-4 py-3">Posted</th>
                  <th className="text-right px-4 py-3">Likes</th>
                  <th className="text-right px-4 py-3">Comments</th>
                  <th className="text-right px-4 py-3">Views</th>
                  <th className="text-right px-4 py-3">ER %</th>
                  <th className="text-right px-4 py-3">Cmt/Like</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {perPost.map((p, i) => (
                  <tr key={p.id ?? i} className="border-b border-border/50 last:border-b-0">
                    <td className="px-4 py-2 text-muted-foreground text-xs">{fmtDate(p.postedAt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtCount(p.likes ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtCount(p.comments ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.views !== null && p.views !== undefined ? fmtCount(p.views) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{(p.engagementRatePct ?? 0).toFixed(2)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">
                      {((p.commentToLikeRatio ?? 0) * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.permalink && (
                        <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-xs underline text-muted-foreground hover:text-foreground">
                          Open ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Top posts gallery */}
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
                  views: p.views ?? undefined,
                }}
              />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        @{handle} · {platform} · {followers.toLocaleString()} followers · following {following.toLocaleString()} · public-data analysis.
      </p>
    </div>
  );
}

function BenchmarkBar({ current, low, high, max }: { current: number; low: number; high: number; max: number }) {
  const clampPct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const currentPct = clampPct(current);
  const lowPct = clampPct(low);
  const highPct = clampPct(high);
  return (
    <div className="relative h-8">
      <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-border/60" />
      <div
        className="absolute inset-y-0 rounded-full bg-emerald-500/30"
        style={{ left: `${lowPct}%`, width: `${Math.max(highPct - lowPct, 0.5)}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-white shadow-md"
        style={{ left: `calc(${currentPct}% - 2px)` }}
        aria-label={`Your rate: ${current.toFixed(2)}%`}
      />
      <div className="absolute -bottom-5 text-[10px] text-muted-foreground tabular-nums" style={{ left: `${lowPct}%` }}>
        {low.toFixed(1)}%
      </div>
      <div className="absolute -bottom-5 text-[10px] text-muted-foreground tabular-nums" style={{ left: `${highPct}%` }}>
        {high.toFixed(1)}%
      </div>
    </div>
  );
}
