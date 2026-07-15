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
  title: "Developer API — DecodeCreator",
  description:
    "Manage API keys, top up your wallet, and integrate the DecodeCreator API into your product. All 12 tools, REST + JSON, x-api-key auth.",
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
