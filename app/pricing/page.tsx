import { headers } from "next/headers";
import { getCurrentUser, supabaseServer } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { getUserTier } from "@/core/billing/entitlements";
import { regionFromHeaders } from "@/core/utils/region";
import {
  CONSUMER_TIERS,
  API_STARTER_TIER,
  CREDIT_PACKS,
  ANON_LIMITS,
} from "@/core/billing/tiers";
import { PricingClient } from "./PricingClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing — DecodeCreator",
  description:
    "Simple, transparent pricing. Free tier for consumers, monthly & annual subscriptions from ₹599 / $7, developer API with pay-as-you-go credits.",
};

// Server component. Detects region + user state, hands everything
// serializable off to the client so the interactive toggle (monthly/
// annual) doesn't need a server round-trip.

export default async function PricingPage() {
  const [hdrs, user] = await Promise.all([headers(), getCurrentUser()]);
  const region = regionFromHeaders(hdrs); // "IN" or "GLOBAL"

  // Signed-in? What tier are they on?
  let currentTierId: string | null = null;
  let activeSubCycle: "monthly" | "annual" | null = null;
  if (user) {
    const supa = supabaseService();
    const [tier, { data: sub }] = await Promise.all([
      getUserTier(supa, user.id),
      (await supabaseServer())
        .from("subscriptions")
        .select("plan, status, current_period_end")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    currentTierId = tier.id;
    // plan stored as "starter" / "starter:annual" / etc.
    if (sub?.plan) {
      activeSubCycle = sub.plan.includes(":annual") ? "annual" : "monthly";
    }
  }

  return (
    <PricingClient
      region={region}
      isSignedIn={!!user}
      currentTierId={currentTierId}
      activeSubCycle={activeSubCycle}
      tiers={Object.values(CONSUMER_TIERS)}
      apiStarter={API_STARTER_TIER}
      creditPacks={CREDIT_PACKS}
      anonScansPerDay={ANON_LIMITS.scansPerDay}
    />
  );
}
