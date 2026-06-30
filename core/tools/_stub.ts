import { NotImplementedError } from "../utils/errors";
import type { SocialTool, ToolResult } from "./types";

// Helper for roadmap tools: same SocialTool shape, run() throws a clean error
// the scan API converts to a "Coming soon" 501 response. Lets the intent picker
// render the full menu without faking results.
export function stubTool(meta: Omit<SocialTool, "run">): SocialTool {
  return {
    ...meta,
    async run(): Promise<ToolResult> {
      throw new NotImplementedError(
        `${meta.name} ships in Phase ${meta.phase}.`,
      );
    },
  };
}
