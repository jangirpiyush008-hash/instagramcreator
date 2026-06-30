import type { Platform } from "../types";
import type { DataAdapter } from "./adapter";
import { YouTubeOfficialAdapter } from "./youtube-official";
import { MockProvider } from "./mock-provider";

// Until a paid IG / TikTok provider is wired (RapidAPI / EnsembleData / Apify),
// we use the MockProvider so the whole product runs end-to-end. To go live:
// swap MockProvider("instagram") / MockProvider("tiktok") with a real adapter
// implementing the same DataAdapter interface — tools never see the difference.

export function adapterFor(platform: Platform): DataAdapter {
  switch (platform) {
    case "youtube":
      // YouTube uses the official API for getProfile + getRecentPosts and
      // falls back to MockProvider behavior for the rest until those endpoints
      // are wired (YouTubeOfficialAdapter extends MockProvider).
      return process.env.YOUTUBE_API_KEY
        ? new YouTubeOfficialAdapter()
        : new MockProvider("instagram");
    case "instagram":
      return new MockProvider("instagram");
    case "tiktok":
      return new MockProvider("tiktok");
  }
}
