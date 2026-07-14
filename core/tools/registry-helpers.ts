import type { Platform } from "../types";
import { TOOLS } from "./registry";

// Returns the ordered list of tool IDs supported by a given platform.
// Used by executeFullReport to enumerate what to bundle.
export function getAllToolsForPlatform(platform: Platform): string[] {
  return TOOLS.filter((t) => t.platforms.includes(platform) && t.phase === 0).map((t) => t.id);
}
