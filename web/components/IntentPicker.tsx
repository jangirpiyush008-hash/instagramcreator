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
        const href = `/${platform}/${encodeURIComponent(handle)}?tool=${t.id}`;
        const active = selectedToolId === t.id;
        const shipped = t.phase === 0;
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
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.name}
              </div>
              {shipped ? (
                <span className="text-[10px] uppercase tracking-wider rounded-full bg-gradient-ig text-white px-2 py-0.5 font-medium">
                  Live
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider rounded-full border border-border bg-muted text-muted-foreground px-2 py-0.5">
                  Phase {t.phase}
                </span>
              )}
            </div>
            <div className="font-medium mt-2">{t.intentLabel}</div>
            <p className="text-sm text-muted-foreground mt-2">{t.blurb}</p>
          </Link>
        );
      })}
    </div>
  );
}
