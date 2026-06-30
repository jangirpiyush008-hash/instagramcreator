import { BLURRED_PLACEHOLDER } from "@/core/constants";
import type { ToolResult } from "@/core/tools/types";

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return BLURRED_PLACEHOLDER;
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function humanize(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/Pct/g, "%")
    .replace(/^./, (c) => c.toUpperCase());
}

export function TeaserCard({
  result,
  entitled,
}: {
  result: ToolResult;
  entitled: boolean;
}) {
  const freeEntries = Object.entries(result.free);
  const lockedEntries = Object.entries(result.locked);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Free
        </h2>
        <dl className="mt-3 grid sm:grid-cols-2 gap-4">
          {freeEntries.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border p-4">
              <dt className="text-xs text-muted-foreground">{humanize(k)}</dt>
              <dd className="text-2xl font-semibold mt-1">{fmtValue(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {entitled ? "Unlocked" : "Locked report"}
        </h2>
        <dl className="mt-3 grid sm:grid-cols-2 gap-4">
          {lockedEntries.map(([k, v]) => (
            <div
              key={k}
              className="rounded-lg border border-border p-4 relative overflow-hidden"
            >
              <dt className="text-xs text-muted-foreground">{humanize(k)}</dt>
              <dd
                className={
                  "text-2xl font-semibold mt-1 " + (entitled ? "" : "blur-locked")
                }
                aria-hidden={!entitled}
              >
                {fmtValue(entitled ? v : 1234.56)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
