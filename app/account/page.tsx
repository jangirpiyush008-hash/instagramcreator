import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseServer } from "@/web/lib/supabase-server";
import { supabaseService } from "@/core/database/supabase";
import { Card, CardBody, CardHeader } from "@/web/components/ui/Card";
import { SignOutButton } from "@/web/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const { status } = await searchParams;
  const supaService = supabaseService();

  // Read with the user-auth'd client so RLS still applies for sub/unlocks.
  const supabase = await supabaseServer();

  const [{ data: subs }, { data: unlocks }, { data: profile }] = await Promise.all([
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
      .limit(20),
    supaService.from("profiles").select("region, email").eq("id", user.id).maybeSingle(),
  ]);

  const activeSub = subs?.find((s) => s.status === "active");
  const region = (profile?.region ?? "GLOBAL") as "IN" | "GLOBAL";

  return (
    <section className="container py-12 max-w-3xl space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

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

      <Card>
        <CardHeader>
          <h2 className="font-medium">Subscription</h2>
        </CardHeader>
        <CardBody>
          {activeSub ? (
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Plan:</span>{" "}
                <span className="font-medium">{activeSub.plan}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span> {activeSub.status}
              </p>
              {activeSub.current_period_end && (
                <p>
                  <span className="text-muted-foreground">Renews:</span>{" "}
                  {new Date(activeSub.current_period_end).toLocaleDateString()}
                </p>
              )}
              <p className="text-muted-foreground text-xs pt-2">
                Manage billing in your {activeSub.provider} portal.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active subscription.{" "}
              <Link href="/" className="underline">
                Run a scan to subscribe.
              </Link>
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Recent unlocks</h2>
        </CardHeader>
        <CardBody>
          {unlocks && unlocks.length > 0 ? (
            <ul className="divide-y divide-border text-sm">
              {unlocks.map((u) => (
                <li key={u.id} className="py-3 flex justify-between gap-4">
                  <span className="truncate">{u.scan_key}</span>
                  <span className="text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No one-time unlocks yet.</p>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-muted-foreground">
        Billing region: {region}.
      </p>
    </section>
  );
}
