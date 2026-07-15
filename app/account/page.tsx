import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseServer } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { DashboardShell } from "@/web/components/dashboard/DashboardShell";
import { DashboardPanels } from "@/web/components/dashboard/DashboardPanels";
import { SubscriptionPanel, WatchlistPanel } from "@/web/components/dashboard/AccountPanels";
import { ProfilePanel } from "@/web/components/dashboard/ProfilePanel";
import { TIERS, type Tier } from "@/core/api/credits";
import { getUserTier } from "@/core/billing/entitlements";
import { readUsage } from "@/core/billing/rate-limit";
import { getWalletBalance } from "@/core/billing/wallet";
import { regionFromHeaders } from "@/core/utils/region";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string; newKey?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/?auth=signin&next=/account");

  const { status, tab, newKey } = await searchParams;
  const activeTab = tab ?? "overview";
  const supaService = supabaseService();
  const supabase = await supabaseServer();

  const hdrs = await headers();
  const region = regionFromHeaders(hdrs);

  const [
    { data: subs },
    { data: unlocks },
    { data: profile },
    { data: apiKeys },
    { data: watchlist },
    consumerTier,
    wallet,
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
    supaService
      .from("profiles")
      .select(
        "email, full_name, avatar_url, phone, country_code, company, job_title, timezone, marketing_opt_in, product_updates_opt_in",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("api_keys")
      .select("id, name, key_prefix, tier, credits_remaining, credits_included, created_at, revoked_at, last_used_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("api_watchlist")
      .select("id, platform, handle, label, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    getUserTier(supaService, user.id),
    getWalletBalance(supaService, user.id),
  ]);

  const activeSub = subs?.find((s) => s.status === "active");
  const consumerUsage = await readUsage(supaService, user.id, consumerTier);

  // Overview's "recent scans" — reuse the unlocks list as a proxy for
  // "things I've paid to see" and format them into the RecentScan shape.
  // Later: replace with a real per-user scan history table.
  const recentScans = (unlocks ?? []).map((u) => ({
    scan_key: u.scan_key,
    created_at: u.created_at,
  }));

  // Developer hub deps
  const currentApiTier: Tier = (apiKeys?.find((k) => !k.revoked_at)?.tier ?? "starter") as Tier;
  const apiTierInfo = TIERS[currentApiTier];

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
      activeTab={activeTab}
    >
      {status === "success" && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm mb-6 max-w-4xl">
          Payment received. Subscription / unlock will activate within a minute.
        </div>
      )}
      {status === "canceled" && (
        <div className="rounded-md border border-border bg-muted p-4 text-sm mb-6 max-w-4xl">
          Checkout canceled. No charge made.
        </div>
      )}

      <DashboardPanels
        overview={{
          planLabel: activeSub?.plan ?? "Free",
          activeSub: !!activeSub,
          scansUsed: consumerUsage.used,
          scansLimit: consumerUsage.limit,
          reportsUnlocked: unlocks?.length ?? 0,
          recent: recentScans,
          watchlist: (watchlist ?? []).map((w) => ({
            id: w.id,
            platform: w.platform,
            handle: w.handle,
          })),
          // No onOpenTab here — functions can't cross the server→client
          // boundary. DashboardPanels wires setTab from useRouter itself.
        }}
        developer={{
          keys: (apiKeys ?? []).map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.key_prefix,
            tier: k.tier,
            creditsRemaining: k.credits_remaining,
            creditsIncluded: k.credits_included,
            createdAt: k.created_at,
            revokedAt: k.revoked_at,
            lastUsedAt: k.last_used_at,
          })),
          newKey,
          currentTierId: currentApiTier,
          wallet,
          region,
        }}
        subscriptionPanel={
          <SubscriptionPanel
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
            planLabel={activeSub?.plan ?? "Free"}
            activeSub={!!activeSub}
          />
        }
        watchlistPanel={
          <WatchlistPanel
            rows={(watchlist ?? []).map((w) => ({
              id: w.id,
              platform: w.platform,
              handle: w.handle,
              label: w.label,
              created_at: w.created_at,
            }))}
          />
        }
        profilePanel={
          <ProfilePanel
            initial={{
              email: user.email ?? "",
              fullName: profile?.full_name ?? "",
              avatarUrl: profile?.avatar_url ?? undefined,
              phone: profile?.phone ?? undefined,
              countryCode: profile?.country_code ?? undefined,
              company: profile?.company ?? undefined,
              jobTitle: profile?.job_title ?? undefined,
              timezone: profile?.timezone ?? undefined,
              marketingOptIn: profile?.marketing_opt_in ?? false,
              productUpdatesOptIn: profile?.product_updates_opt_in ?? true,
              // OAuth-only users have no password to change. Detect by
              // checking user.identities — a Google-signup user has
              // provider=google, no `email` provider entry.
              hasPassword: (user.identities ?? []).some(
                (i) => i.provider === "email",
              ),
            }}
          />
        }
      />
    </DashboardShell>
  );
}
