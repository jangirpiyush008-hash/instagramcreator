"use client";

import { useState } from "react";
import { proxyMediaUrl } from "@/web/lib/media";

interface Props {
  platform: "instagram" | "tiktok";
  handle: string;
  post: {
    id: string;
    caption?: string;
    title?: string;
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
  };
  // Multi-select mode — parent shows a checkbox overlay and reacts to toggles.
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatAgo(iso?: string): string {
  if (!iso) return "recently";
  const then = new Date(iso).getTime();
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

function formatCount(n?: number): string | undefined {
  if (n === undefined || n === null) return undefined;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Renders a post's thumbnail with a play button; on tap, replaces the image
// with an inline <video> player. Both go through /api/proxy/media so hotlink
// protection can't block them. Download button downloads the highest-quality
// video (or thumbnail if the post has no video).
export function MediaCard({ platform, handle, post, selectable, selected, onToggleSelect }: Props) {
  const [playing, setPlaying] = useState(false);
  const hasVideo = Boolean(post.videoUrl ?? post.videoUrlHd);
  const thumbSrc = proxyMediaUrl(post.thumbnailUrlHd ?? post.thumbnailUrl);
  const videoSrc = proxyMediaUrl(post.videoUrlHd ?? post.videoUrl);
  const downloadName = `${platform}-${handle}-${post.id}`;
  const thumbDownload = proxyMediaUrl(post.thumbnailUrlHd ?? post.thumbnailUrl, {
    filename: `${downloadName}.jpg`,
    download: true,
  });
  const videoDownload = proxyMediaUrl(post.videoUrlHd ?? post.videoUrl, {
    filename: `${downloadName}.mp4`,
    download: true,
  });
  const caption = post.caption ?? post.title;
  const duration = formatDuration(post.durationSec);
  const likes = formatCount(post.likes);
  const comments = formatCount(post.comments);
  const views = formatCount(post.views);

  return (
    <div
      className={
        "rounded-xl border p-3 overflow-hidden transition-all " +
        (selected
          ? "border-primary bg-primary/10 ring-2 ring-primary/60"
          : "border-border bg-card/60")
      }
    >
      {selectable && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={!!selected}
          aria-label={selected ? "Deselect this post" : "Select this post"}
          className={
            "flex items-center gap-2 mb-2 w-full rounded-md px-2 py-1.5 text-xs font-medium transition-all " +
            (selected
              ? "bg-primary text-white"
              : "bg-background/50 border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")
          }
        >
          <span
            className={
              "inline-flex h-4 w-4 items-center justify-center rounded border " +
              (selected ? "bg-white border-white text-primary" : "border-muted-foreground")
            }
          >
            {selected && (
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          {selected ? "Selected" : "Select for bulk download"}
        </button>
      )}
      <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black">
        {playing && videoSrc ? (
          <video
            src={videoSrc}
            controls
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-contain bg-black"
          />
        ) : (
          <>
            {thumbSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbSrc}
                alt={caption ?? "post thumbnail"}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, hsl(322 95% 50% / 0.85), hsl(268 84% 55% / 0.85))",
                }}
              />
            )}
            {hasVideo && (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="absolute inset-0 flex items-center justify-center group"
                aria-label="Play video"
              >
                <span className="rounded-full bg-white/95 text-black h-16 w-16 flex items-center justify-center shadow-xl transition-transform group-hover:scale-110">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 ml-1" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}
            {duration && (
              <div className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
                {duration}
              </div>
            )}
          </>
        )}
      </div>

      {caption && (
        <div className="px-2 pt-3 pb-1">
          <div className="font-medium line-clamp-2">{caption}</div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Posted {formatAgo(post.postedAt)}</span>
            {views && <span>👁 {views}</span>}
            {likes && <span>❤️ {likes}</span>}
            {comments && <span>💬 {comments}</span>}
          </div>
        </div>
      )}

      <div className="px-2 pt-3 pb-1 flex flex-wrap gap-2">
        {thumbDownload && (
          <a
            href={thumbDownload}
            className="text-xs rounded-md border border-border bg-background/50 px-3 py-1.5 hover:border-primary/50 transition"
          >
            ⬇ Thumbnail
          </a>
        )}
        {videoDownload && (
          <a
            href={videoDownload}
            className="text-xs rounded-md bg-gradient-ig text-white px-3 py-1.5 hover:opacity-90 transition"
          >
            ⬇ Video (MP4)
          </a>
        )}
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs rounded-md border border-border bg-background/50 px-3 py-1.5 hover:border-primary/50 transition ml-auto"
          >
            Open on {platform === "tiktok" ? "TikTok" : "Instagram"} ↗
          </a>
        )}
      </div>
    </div>
  );
}
