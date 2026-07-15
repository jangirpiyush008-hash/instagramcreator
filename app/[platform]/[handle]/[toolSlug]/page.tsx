import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { PlatformSchema, HandleSchema } from "@/core/validation";
import { toolsForPlatform, getToolBySlug } from "@/core/tools/registry";
import { normalizeHandle } from "@/core/utils/handle";
import { IntentPicker } from "@/web/components/IntentPicker";
import { ScanResult } from "@/web/components/ScanResult";

// Canonical per-tool SEO route: /{platform}/{handle}/{toolSlug}
// e.g. /instagram/mkbhd/engagement-rate
// Each combination becomes an indexable page — one crawlable URL per
// creator + tool. Legacy `?tool=X` query-param URLs still work on the
// parent page for backward compat.

interface PageProps {
  params: Promise<{ platform: string; handle: string; toolSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { platform, handle, toolSlug } = await params;
  const tool = getToolBySlug(toolSlug);
  if (!tool) return { title: "Not found — DecodeCreator" };
  const decoded = decodeURIComponent(handle);
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
  return {
    title: `${tool.name} for @${decoded} on ${platformLabel} — DecodeCreator`,
    description: `${tool.blurb} — Public data, no login required.`,
    alternates: {
      canonical: `/${platform}/${decoded}/${toolSlug}`,
    },
  };
}

export default async function ToolPage({ params }: PageProps) {
  const { platform: rawPlatform, handle: rawHandle, toolSlug } = await params;

  const platformParsed = PlatformSchema.safeParse(rawPlatform);
  if (!platformParsed.success) notFound();
  const platform = platformParsed.data;

  const decoded = decodeURIComponent(rawHandle);
  const handleParsed = HandleSchema.safeParse(decoded);
  if (!handleParsed.success) notFound();
  const handle = normalizeHandle(handleParsed.data);

  const tool = getToolBySlug(toolSlug);
  if (!tool) notFound();
  if (!tool.platforms.includes(platform)) notFound();

  // Sibling tools for the IntentPicker so users can jump between analyses.
  const _sibling = toolsForPlatform(platform);
  void _sibling; // referenced by IntentPicker via its own registry lookup

  return (
    <section className="container py-10 sm:py-14 max-w-5xl space-y-10">
      <header className="space-y-2">
        <nav className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Link href={`/${platform}/${handle}`} className="hover:text-foreground transition">
            {platform}
          </Link>
          <span>·</span>
          <span>@{handle}</span>
          <span>·</span>
          <span className="text-foreground">{tool.name}</span>
        </nav>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          {tool.name}: @{handle}
        </h1>
        <p className="text-muted-foreground max-w-2xl">{tool.blurb}</p>
      </header>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Try another question for @{handle}
        </h2>
        <IntentPicker platform={platform} handle={handle} selectedToolId={tool.id} />
      </section>

      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">{tool.intentLabel}</h2>
          {tool.phase === 0 ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full bg-gradient-ig text-white px-2 py-0.5 font-medium">
              Live
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider rounded-full border border-border bg-muted text-muted-foreground px-2 py-0.5">
              Phase {tool.phase}
            </span>
          )}
        </div>
        <ScanResult toolId={tool.id} platform={platform} handle={handle} />
      </section>
    </section>
  );
}
