"use client";

import { SectionTitle } from "../primitives";
import type { Platform } from "@/core/types";

interface HashtagPost {
  id: string;
  author: string;
  authorAvatar?: string;
  caption: string;
  views: number | null;
  likes: number;
  comments: number;
  postedAt: string;
  thumbnailUrl?: string;
  permalink?: string;
  durationSec?: number;
}

interface Author {
  username: string;
  avatarUrl?: string;
  posts: number;
  totalViews: number;
}

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export function HashtagFinderView({ handle, data }: Props) {
  const hashtag = (data?.hashtag as string | undefined) ?? handle.replace(/^#/, "");
  const posts = (data?.posts as HashtagPost[] | undefined) ?? [];
  const authors = (data?.topAuthors as Author[] | undefined) ?? [];

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-foreground/70">
        No posts found for <span className="font-semibold">#{hashtag}</span>.
        Try a broader tag, or check that it&apos;s an English-alphabet hashtag
        (some regional tags aren&apos;t indexed).
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionTitle hint={`${posts.length} top posts sampled`}>
        #{hashtag}
      </SectionTitle>

      {/* Top posts grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <a
            key={p.id}
            href={p.permalink ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="group rounded-xl border border-border bg-card/60 overflow-hidden hover:border-primary/40 transition-colors"
          >
            <div className="relative aspect-[4/5] bg-gradient-to-br from-primary/20 to-primary/5">
              {p.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : null}
              {p.durationSec ? (
                <div className="absolute bottom-2 right-2 rounded bg-black/70 text-white text-xs px-1.5 py-0.5">
                  {Math.floor(p.durationSec / 60)}:
                  {String(Math.floor(p.durationSec % 60)).padStart(2, "0")}
                </div>
              ) : null}
            </div>
            <div className="p-3 space-y-2">
              <div className="text-xs font-semibold text-foreground/80 truncate">
                @{p.author}
              </div>
              <div className="text-xs text-foreground/70 line-clamp-2">
                {p.caption}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/60">
                {p.views !== null && <span>👁 {fmt(p.views)}</span>}
                <span>❤️ {fmt(p.likes)}</span>
                <span>💬 {fmt(p.comments)}</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Top authors */}
      {authors.length > 0 && (
        <section>
          <SectionTitle>Top creators using this hashtag</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {authors.map((a) => (
              <div
                key={a.username}
                className="rounded-lg border border-border bg-card/60 p-3 flex items-center gap-3"
              >
                {a.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.avatarUrl}
                    alt=""
                    className="h-9 w-9 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-gradient-ig text-white grid place-items-center text-xs font-bold">
                    {a.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">@{a.username}</div>
                  <div className="text-[11px] text-foreground/60">
                    {a.posts} post{a.posts === 1 ? "" : "s"} · {fmt(a.totalViews)} views
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
