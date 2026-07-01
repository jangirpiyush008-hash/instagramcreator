"use client";

import { SectionTitle } from "../primitives";
import { MediaCard } from "../MediaCard";
import type { Platform } from "@/core/types";

type ToolParams = Record<string, string | number | boolean>;

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
  params?: ToolParams;
  onParamsChange?: (next: ToolParams) => void;
}

const POST_COUNT_OPTIONS = [12, 20, 30, 50];

export function RecentPostsView({ handle, platform, data, params, onParamsChange }: Props) {
  const posts = (data?.posts as RawPost[] | undefined) ?? [];
  const followers = (data?.followers as number) ?? 0;
  const verified = (data?.verified as boolean) ?? false;
  const displayName = (data?.displayName as string) ?? handle;
  const activeCount =
    typeof params?.postCount === "number"
      ? params.postCount
      : (data?.postCount as number | undefined) ?? 20;
  const mcPlatform: "instagram" | "tiktok" = platform === "tiktok" ? "tiktok" : "instagram";
  const safeHandle = handle.replace(/[^\w.\-]/g, "_");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <SectionTitle hint={`@${handle} · ${platform}`}>
            Recent posts from {displayName}
          </SectionTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {followers.toLocaleString()} followers{verified ? " · verified" : ""} · {posts.length} posts shown
          </p>
        </div>

        {onParamsChange && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Show</span>
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
                  {n}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
          No recent posts returned for this account.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {posts.map((p, i) => (
            <MediaCard
              key={p.id ?? i}
              platform={mcPlatform}
              handle={safeHandle}
              post={{
                id: p.id ?? `post-${i}`,
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
      )}

      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">How it works:</span> We pull the last {posts.length} public posts
        directly from {platform === "tiktok" ? "TikTok" : "Instagram"}. Each thumbnail and video streams through our proxy so
        the platform CDN can&apos;t block your download. Clicking &ldquo;Video (MP4)&rdquo; saves the file locally &mdash; the
        original account is never notified.
      </div>
    </div>
  );
}
