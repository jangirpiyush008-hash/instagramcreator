import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, supabaseServer } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { AccountDashboard } from "@/web/components/account/AccountDashboard";
import { DashboardShell } from "@/web/components/dashboard/DashboardShell";
import { TIERS, type Tier } from "@/core/api/credits";
import { getUserTier } from "@/core/billing/entitlements";
import { readUsage } from "@/core/billing/rate-limit";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string; newKey?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/?auth=signin&next=/account");

  const { status, tab, newKey } = await searchParams;
  const supaService = supabaseService();
  const supabase = await supabaseServer();

  const [
    { data: subs },
    { data: unlocks },
    { data: profile },
    { data: apiKeys },
    { data: usageRows },
    { data: watchlist },
    consumerTier,
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, plan, status, current_period_end, provider")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("unlocks")
      .select("id, scan_key, created_at, currency, amount_minor")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supaService.from("profiles").select("region, email, full_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase
      .from("api_keys")
      .select("id, name, key_prefix, tier, credits_remaining, credits_included, created_at, revoked_at, last_used_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("api_usage")
      .select("endpoint, credits_charged, response_code, created_at, platform, handle")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("api_watchlist")
      .select("id, platform, handle, label, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    getUserTier(supaService, user.id),
  ]);

  const activeSub = subs?.find((s) => s.status === "active");
  const primaryKey = apiKeys?.find((k) => !k.revoked_at);
  const currentApiTier: Tier = (primaryKey?.tier ?? "starter") as Tier;
  const apiTierInfo = TIERS[currentApiTier];

  // Consumer-side monthly scan usage (drives the top-bar credit meter).
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
      activeTab={tab ?? "overview"}
    >
      <section className="max-w-5xl space-y-8">
        {status === "success" && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            Payment received. Subscription / unlock will activate within a minute.
          </div>
        )}
        {status === "canceled" && (
          <div className="rounded-md border border-border bg-muted p-4 text-sm">
            Checkout canceled. No charge made.
          </div>
        )}
        {newKey && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <div className="font-medium text-amber-700 dark:text-amber-200">Your new API key</div>
            <p className="text-xs text-muted-foreground">
              Copy this now — we won&apos;t show the full key again. Store it in a password manager or
              an env var. If you lose it, generate a new one.
            </p>
            <code className="block rounded bg-muted border border-border px-3 py-2 text-sm font-mono break-all select-all">
              {newKey}
            </code>
            <div className="text-xs text-muted-foreground">
              <Link href="/account?tab=api-keys" className="underline">Return to keys →</Link>
            </div>
          </div>
        )}

        <AccountDashboard
          initialTab={tab ?? "overview"}
          consumer={{
            planLabel: activeSub?.plan ?? "Free",
            activeSub: !!activeSub,
            reportsUnlocked: unlocks?.length ?? 0,
          }}
          developer={{
            apiCalls: usageRows?.length ?? 0,
            creditsRemaining: primaryKey?.credits_remaining ?? 0,
            creditsIncluded: primaryKey?.credits_included ?? apiTierInfo.credits,
            watchlistCount: watchlist?.length ?? 0,
            hasKey: !!primaryKey,
            tierName: apiTierInfo.name,
          }}
          subscription={
            activeSub
              ? {
                  plan: activeSub.plan,
                  status: activeSub.status,
                  renewsAt: activeSub.current_period_end,
                  provider: activeSub.provider,
                }
              : null
          }
          unlocks={unlocks ?? []}
          apiKeys={
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
          usage={usageRows ?? []}
          watchlist={watchlist ?? []}
        />
      </section>
    </DashboardShell>
  );
}
