"use client";

import Link from "next/link";
import { toolsForPlatform } from "@/core/tools/registry";
import type { Platform } from "@/core/types";

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
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {tools.map((t) => {
        // Prefer the SEO slug for the canonical URL (indexable per-tool
        // page). Fall back to id if slug isn't set for some reason.
        const slug = t.seo.slug ?? t.id;
        const href = `/${platform}/${encodeURIComponent(handle)}/${slug}`;
        const active = selectedToolId === t.id;
        return (
          <Link
            key={t.id}
            href={href}
            className={
              "block rounded-xl border p-4 transition-all " +
              (active
                ? "border-primary/60 bg-card ring-1 ring-primary/40"
                : "border-border bg-card/50 hover:border-primary/40 hover:bg-card")
            }
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {t.name}
            </div>
            <div className="font-medium mt-2">{t.intentLabel}</div>
            <p className="text-sm text-muted-foreground mt-2">{t.blurb}</p>
          </Link>
        );
      })}
    </div>
  );
}
