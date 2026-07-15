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
  title:
    "Pricing — Instagram, TikTok & YouTube Analytics from ₹499/mo | DecodeCreator",
  description:
    "Transparent pricing for creator analytics: free tier (20 scans/mo), Starter ₹499/mo, Pro ₹1,499/mo, Scale ₹4,999/mo. Wallet credits from ₹500 with 12-month validity. Cheaper than HypeAuditor, Modash & Iconosquare — same 3-platform coverage.",
  alternates: { canonical: "https://decodecreator.com/pricing" },
  openGraph: {
    title: "DecodeCreator Pricing — Free tier + paid plans from ₹499/mo",
    description:
      "Instagram, TikTok & YouTube analytics with transparent per-scan credits, 12-month wallet validity, and 7-day refund guarantee.",
    url: "https://decodecreator.com/pricing",
    type: "website",
  },
  keywords: [
    "instagram analytics pricing",
    "influencer analytics tool cost",
    "hypeauditor pricing alternative",
    "modash pricing alternative",
    "iconosquare pricing",
    "social blade paid plans",
    "creator analytics free tier",
    "cheap instagram audit tool",
  ],
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
