"use client";

import { MetricCard, SectionTitle } from "../primitives";
import { MediaCard } from "../MediaCard";
import { proxyMediaUrl } from "@/web/lib/media";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

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

interface RawResolution {
  label: string;
  url?: string | null;
  locked?: boolean;
}

const FALLBACK_POST: RawPost = {
  id: "demo",
  title: "How I built this in a weekend",
  postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  durationSec: 754,
};

export function ThumbnailDownloaderView({ handle, platform, entitled: _entitled, data }: Props) {
  const post = (data?.post as RawPost | undefined) ?? FALLBACK_POST;
  const resolutions = (data?.resolutions as RawResolution[] | undefined) ?? [];

  const safeHandle = handle.replace(/[^\w.\-]/g, "_");
  const extForLabel = (label: string) =>
    /video/i.test(label) ? "mp4" : "jpg";

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle}`}>Most recent {platform === "tiktok" ? "video" : "post"}</SectionTitle>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <MediaCard
          platform={platform === "tiktok" ? "tiktok" : platform === "youtube" ? "youtube" : "instagram"}
          handle={safeHandle}
          post={{
            id: post.id ?? "post",
            caption: post.caption,
            title: post.title,
            postedAt: post.postedAt,
            durationSec: post.durationSec,
            thumbnailUrl: post.thumbnailUrl,
            thumbnailUrlHd: post.thumbnailUrlHd,
            videoUrl: post.videoUrl,
            videoUrlHd: post.videoUrlHd,
            permalink: post.permalink,
            likes: post.likes,
            comments: post.comments,
            views: post.views,
          }}
        />

        <div className="space-y-3">
          {resolutions.length === 0 && (
            <div className="rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
              No download variants available for this post.
            </div>
          )}
          {resolutions.map((s, idx) => {
            const url = s.url ?? undefined;
            const filename = `${platform}-${safeHandle}-${post.id ?? "post"}-${idx}.${extForLabel(s.label)}`;
            const href = url ? proxyMediaUrl(url, { filename, download: true }) : undefined;
            return (
              <a
                key={`${s.label}-${idx}`}
                href={href ?? "#"}
                aria-disabled={!href}
                className={
                  "block w-full rounded-xl border border-border bg-card/60 px-4 py-3 transition-all " +
                  (href
                    ? "hover:border-primary/50 hover:-translate-y-0.5"
                    : "opacity-60 cursor-not-allowed")
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-left">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {href ? "Click to download" : "Not available for this post"}
                    </div>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider bg-gradient-ig text-white">
                    {href ? "Free" : "N/A"}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      <section>
        <SectionTitle>What&apos;s included</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Preview" value="Inline player" sub="tap to play the video" accent="pink" />
          <MetricCard label="Downloads" value="Thumbnail + MP4" sub="proxied, no CDN blocks" accent="cyan" />
          <MetricCard label="Source" value="Public post" sub="the account is never notified" accent="amber" />
        </div>
      </section>
    </div>
  );
}
