"use client";

import { useMemo, useState } from "react";
import { SectionTitle } from "../primitives";
import { MediaCard } from "../MediaCard";
import { proxyMediaUrl } from "@/web/lib/media";
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

// Sequential downloads — browsers block a burst of simultaneous file dialogs,
// so we click one anchor at a time with a small gap. Users get a native
// "Save As" flow per file instead of a fragile ZIP.
async function bulkDownload(
  posts: RawPost[],
  platform: "instagram" | "tiktok" | "youtube",
  handle: string,
) {
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]!;
    // On YouTube, we don't have a direct videoUrl (see the adapter comment).
    // Route through the third-party downloader endpoint instead, which
    // resolves a fresh URL per click.
    let href: string | undefined;
    let filename: string;
    if (platform === "youtube" && !p.videoUrl && !p.videoUrlHd && p.id) {
      filename = `youtube-${handle}-${p.id}.mp4`;
      href = `/api/download/youtube?videoId=${encodeURIComponent(p.id)}&stream=1`;
    } else {
      const url = p.videoUrlHd ?? p.videoUrl ?? p.thumbnailUrlHd ?? p.thumbnailUrl;
      if (!url) continue;
      const isVideo = Boolean(p.videoUrlHd ?? p.videoUrl);
      const ext = isVideo ? "mp4" : "jpg";
      filename = `${platform}-${handle}-${p.id ?? `post-${i}`}.${ext}`;
      href = proxyMediaUrl(url, { filename, download: true });
    }
    if (!href) continue;
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Small delay between clicks so the browser queues them cleanly.
    // YouTube provider calls take longer (fresh URL per click), so bump the
    // gap so we don't fire 30 provider requests inside a second.
    await new Promise((r) => setTimeout(r, platform === "youtube" ? 1200 : 350));
  }
}

export function RecentPostsView({ handle, platform, data, params, onParamsChange }: Props) {
  const posts = (data?.posts as RawPost[] | undefined) ?? [];
  const followers = (data?.followers as number) ?? 0;
  const verified = (data?.verified as boolean) ?? false;
  const displayName = (data?.displayName as string) ?? handle;
  const activeCount =
    typeof params?.postCount === "number"
      ? params.postCount
      : (data?.postCount as number | undefined) ?? 20;
  const mcPlatform: "instagram" | "tiktok" | "youtube" =
    platform === "tiktok" ? "tiktok" : platform === "youtube" ? "youtube" : "instagram";
  const safeHandle = handle.replace(/[^\w.\-]/g, "_");

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const postIds = useMemo(() => posts.map((p, i) => p.id ?? `post-${i}`), [posts]);
  const selectedCount = selected.size;
  const allSelected = selectedCount === posts.length && posts.length > 0;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(postIds));
  const clearAll = () => setSelected(new Set());
  const exitSelectMode = () => {
    setSelectMode(false);
    clearAll();
  };

  const runBulk = async () => {
    const toDownload = posts
      .map((p, i) => ({ p, id: p.id ?? `post-${i}` }))
      .filter(({ id }) => selected.has(id))
      .map(({ p }) => p);
    if (toDownload.length === 0) return;
    setDownloading(true);
    try {
      await bulkDownload(toDownload, mcPlatform, safeHandle);
    } finally {
      setDownloading(false);
    }
  };

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

      {posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2">
          {!selectMode ? (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="text-sm rounded-md border border-border bg-background/50 px-3 py-1.5 hover:border-primary/50 transition"
            >
              ☑ Select posts to download
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={allSelected ? clearAll : selectAll}
                className="text-sm rounded-md border border-border bg-background/50 px-3 py-1.5 hover:border-primary/50 transition"
              >
                {allSelected ? "Clear all" : `Select all ${posts.length}`}
              </button>
              <span className="text-xs text-muted-foreground">
                {selectedCount} of {posts.length} selected
              </span>
              <button
                type="button"
                onClick={runBulk}
                disabled={selectedCount === 0 || downloading}
                className={
                  "text-sm rounded-md px-3 py-1.5 transition font-medium ml-auto " +
                  (selectedCount === 0 || downloading
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-gradient-ig text-white hover:opacity-90")
                }
              >
                {downloading
                  ? "Downloading…"
                  : `⬇ Download ${selectedCount} video${selectedCount === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                onClick={exitSelectMode}
                className="text-sm rounded-md border border-border bg-background/50 px-3 py-1.5 hover:border-primary/50 transition"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {posts.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
          No recent posts returned for this account.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {posts.map((p, i) => {
            const id = p.id ?? `post-${i}`;
            return (
              <MediaCard
                key={id}
                platform={mcPlatform}
                handle={safeHandle}
                selectable={selectMode}
                selected={selected.has(id)}
                onToggleSelect={() => toggleOne(id)}
                post={{
                  id,
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
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">How bulk download works:</span> Selected videos
        download one after another with a small pause between each &mdash; your browser will show a
        &ldquo;Save As&rdquo; prompt (or auto-save to your Downloads folder) per file. If your browser
        blocks multiple downloads, allow them once and the rest will flow through. Everything streams
        through our proxy so CDN hotlink protection can&apos;t interfere.
      </div>

      {platform === "youtube" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
          <div className="font-medium text-amber-200 mb-1">Third-party service disclaimer</div>
          <p className="text-muted-foreground">
            YouTube MP4 downloads are resolved via a third-party service (configured through
            <code className="mx-1 px-1.5 py-0.5 rounded bg-black/30 text-xs">YT_DOWNLOAD_HOST</code>
            on our server). YouTube&apos;s Terms of Service restrict downloading — this feature is
            provided at your own discretion. Use only for content you have the right to save.
          </p>
        </div>
      )}
    </div>
  );
}
