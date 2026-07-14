import { notFound } from "next/navigation";
import { ScanResult } from "@/web/components/ScanResult";
import { getTool } from "@/core/tools/registry";
import type { Platform } from "@/core/types";

// Iframe-safe widget: renders the same ScanResult that /{platform}/{handle}
// shows, but without the site chrome. Customers embed with:
//
//   <iframe
//     src="https://decodecreator.com/embed/engagement-rate/instagram/mkbhd?theme=dark"
//     width="720" height="900" frameborder="0"
//   />
//
// Themed via ?theme=light|dark (default dark). No API key required — the
// underlying scan endpoint has its own gating; embeds show public / cached
// data only. Rate-limit or provider-quota errors surface inside the iframe.
//
// robots noindex is set at the layout level so we don't get SEO penalties
// for duplicate content across every customer's embed page.

const VALID_PLATFORMS = new Set<Platform>(["instagram", "tiktok", "youtube"]);

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ toolId: string; platform: string; handle: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { toolId, platform, handle } = await params;
  const { theme } = await searchParams;
  const tool = getTool(toolId);
  if (!tool) notFound();
  if (!VALID_PLATFORMS.has(platform as Platform)) notFound();
  if (!tool.platforms.includes(platform as Platform)) notFound();

  const themeClass = theme === "light" ? "" : "dark";

  return (
    <div className={themeClass}>
      <div className="rounded-2xl border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {tool.name} · @{handle} · {platform}
          </div>
          <a
            href={`https://decodecreator.com/${platform}/${handle}?tool=${toolId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
          >
            Powered by DecodeCreator ↗
          </a>
        </div>
        <ScanResult toolId={toolId} platform={platform as Platform} handle={handle} />
      </div>
    </div>
  );
}
