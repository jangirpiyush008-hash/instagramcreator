import type { Metadata } from "next";
import { DiscoverPage } from "@/web/components/discover/DiscoverPage";
import { getCurrentUser } from "@/web/lib/supabase-server";
import type { Platform } from "@/core/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title:
    "Discover Creators — Instagram, TikTok & YouTube Search | DecodeCreator",
  description:
    "Find creators across Instagram, TikTok, and YouTube. Filter by follower count, engagement rate, and keyword. Live search — always fresh, up to 50 results per query. The HypeAuditor / Modash alternative for brands, agencies and creator managers.",
  alternates: { canonical: "https://decodecreator.com/discover" },
  keywords: [
    "creator discovery tool",
    "instagram creator search",
    "tiktok creator search",
    "youtube creator search",
    "influencer search engine",
    "influencer vetting tool",
    "brand collaboration search",
    "hypeauditor discovery alternative",
    "modash discovery alternative",
    "creator marketplace",
    "influencer database india",
    "find instagram influencers by niche",
  ],
};

// Server component — decides the initial platform from ?platform= and
// hands off to the client widget. Auth state is passed so the client
// can show the right upsell (sign-in vs upgrade-to-Pro).
export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const { platform: rawPlatform } = await searchParams;
  const initialPlatform: Platform =
    rawPlatform === "tiktok" || rawPlatform === "youtube" ? rawPlatform : "instagram";

  const user = await getCurrentUser().catch(() => null);
  return <DiscoverPage initialPlatform={initialPlatform} isSignedIn={!!user} />;
}
