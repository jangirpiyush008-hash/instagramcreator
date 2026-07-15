import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseServer } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { DashboardShell } from "@/web/components/dashboard/DashboardShell";
import { DeveloperHub } from "@/web/components/developer/DeveloperHub";
import { getUserTier } from "@/core/billing/entitlements";
import { readUsage } from "@/core/billing/rate-limit";
import { getWalletBalance } from "@/core/billing/wallet";
import { regionFromHeaders } from "@/core/utils/region";

export const dynamic = "force-dynamic";

export const metadata = {
  title:
    "Instagram, TikTok & YouTube Analytics API — DecodeCreator Developer Hub",
  description:
    "REST API for public Instagram, TikTok & YouTube analytics. Engagement rate, fake follower detection, audience demographics, growth trend. Wallet-based credits from ₹500, 12-month validity, x-api-key auth. HikerAPI + tikwm + YouTube Data API v3 backed.",
  alternates: { canonical: "https://decodecreator.com/developer" },
  keywords: [
    "instagram api",
    "tiktok api",
    "youtube api",
    "instagram engagement api",
    "public instagram scraper api",
    "creator analytics api",
    "influencer data api",
    "hikerapi alternative",
    "rapidapi instagram alternative",
    "tikwm alternative",
    "instagram profile api",
    "public tiktok analytics api",
  ],
};

// Signed-in developer hub. Route sits at /developer because /api is
// reserved by Next.js for route handlers.

export default async function DeveloperPage({
  searchParams,
}: {
  searchParams: Promise<{ newKey?: string; status?: string; tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/?auth=signin&next=/developer");

  const { newKey, status } = await searchParams;
  const supaService = supabaseService();
  const supabase = await supabaseServer();
  const hdrs = await headers();
  const region = regionFromHeaders(hdrs);

  const [{ data: profile }, { data: apiKeys }, consumerTier, wallet] = await Promise.all([
    supaService
      .from("profiles")
      .select("email, full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("api_keys")
      .select("id, name, key_prefix, tier, credits_remaining, credits_included, created_at, revoked_at, last_used_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    getUserTier(supaService, user.id),
    getWalletBalance(supaService, user.id),
  ]);

  const consumerUsage = await readUsage(supaService, user.id, consumerTier);

  return (
    <DashboardShell
      user={{
        email: user.email ?? "unknown",
        name: profile?.full_name ?? undefined,
        avatarUrl: profile?.avatar_url ?? undefined,
      }}
      credits={{
        used: consumerUsage.used,
        limit: consumerUsage.limit,
        tierName: consumerTier.name,
      }}
      activeTab="developer"
    >
      <DeveloperHub
        keys={
          (apiKeys ?? []).map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.key_prefix,
            tier: k.tier,
            creditsRemaining: k.credits_remaining,
            creditsIncluded: k.credits_included,
            createdAt: k.created_at,
            revokedAt: k.revoked_at,
            lastUsedAt: k.last_used_at,
          }))
        }
        newKey={newKey}
        currentTierId={consumerTier.id}
        wallet={wallet}
        topupStatus={status}
        region={region}
      />
    </DashboardShell>
  );
}
