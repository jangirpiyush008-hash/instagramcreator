import { notFound } from "next/navigation";
import { PlatformSchema, HandleSchema } from "@/core/validation";
import { toolsForPlatform, getTool } from "@/core/tools/registry";
import { normalizeHandle } from "@/core/utils/handle";
import { IntentPicker } from "@/web/components/IntentPicker";
import { ScanResult } from "@/web/components/ScanResult";

interface PageProps {
  params: Promise<{ platform: string; handle: string }>;
  searchParams: Promise<{ tool?: string }>;
}

export default async function PlatformHandlePage({ params, searchParams }: PageProps) {
  const { platform: rawPlatform, handle: rawHandle } = await params;
  const { tool: rawTool } = await searchParams;

  const platformParsed = PlatformSchema.safeParse(rawPlatform);
  if (!platformParsed.success) notFound();
  const platform = platformParsed.data;

  const decoded = decodeURIComponent(rawHandle);
  const handleParsed = HandleSchema.safeParse(decoded);
  if (!handleParsed.success) notFound();
  const handle = normalizeHandle(handleParsed.data);

  // Only the selected tool's *serializable* meta crosses the boundary — the
  // client looks up the full tool (incl. run()) from the registry itself.
  const tools = toolsForPlatform(platform);
  const selected = rawTool ? getTool(rawTool) : tools[0];
  const selectedMeta = selected
    ? { id: selected.id, name: selected.name, phase: selected.phase }
    : null;

  return (
    <section className="container py-10 sm:py-14 max-w-5xl space-y-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span>{platform}</span>
          <span>·</span>
          <span>public account</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          @{handle}
        </h1>
      </header>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          What do you want to know?
        </h2>
        <IntentPicker
          platform={platform}
          handle={handle}
          selectedToolId={selectedMeta?.id}
        />
      </section>

      {selectedMeta ? (
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold">{selectedMeta.name}</h2>
            {selectedMeta.phase === 0 ? (
              <span className="text-[10px] uppercase tracking-wider rounded-full bg-gradient-ig text-white px-2 py-0.5 font-medium">
                Live
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wider rounded-full border border-border bg-muted text-muted-foreground px-2 py-0.5">
                Phase {selectedMeta.phase}
              </span>
            )}
          </div>
          <ScanResult toolId={selectedMeta.id} platform={platform} handle={handle} />
        </section>
      ) : (
        <div className="rounded-xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
          No tools available for {platform} yet.
        </div>
      )}
    </section>
  );
}
