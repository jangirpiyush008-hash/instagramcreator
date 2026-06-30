import { BLURRED_PLACEHOLDER } from "../constants";
import type { ToolResult } from "./types";

// Replace every locked value with a typed placeholder so the UI renders the same
// shape (label, units, layout) but never sees the real value.
export function blurLocked(result: ToolResult): ToolResult {
  const masked: Record<string, unknown> = {};
  for (const k of Object.keys(result.locked)) {
    const v = result.locked[k];
    if (typeof v === "number") masked[k] = null;          // UI shows BLURRED_PLACEHOLDER for null numbers
    else if (typeof v === "boolean") masked[k] = null;
    else masked[k] = BLURRED_PLACEHOLDER;
  }
  return { ...result, locked: masked };
}
