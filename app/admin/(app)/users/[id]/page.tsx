import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseService } from "@/core/database/supabase";
import { CreditAdjustForm } from "@/web/components/admin/CreditAdjustForm";
import { PlanChangeForm } from "@/web/components/admin/PlanChangeForm";
import { RefundForm } from "@/web/components/admin/RefundForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "User detail — Admin",
  robots: { index: false, follow: false, nocache: true },
};

async function loadUser(id: string) {
  const supa = supabaseService();
  const [
    { data: profile },
    { data: subs },
    { data: apiKeys },
    { data: walletLots },
    { data: unlocks },
    { data: apiUsage },
    { count: scanCount },
  ] = await Promise.all([
    supa.from("profiles").select("*").eq("id", id).maybeSingle(),
    supa
      .from("subscriptions")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supa
      .from("api_keys")
      .select("id, name, key_prefix, tier, credits_remaining, credits_included, created_at, revoked_at, last_used_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supa
      .from("wallet_lots")
      .select("id, credits_remaining, credits_original, source, created_at, expires_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supa
      .from("unlocks")
      .select("id, scan_key, created_at, currency, amount_minor")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supa
      .from("api_usage")
      .select("id, endpoint, credits_charged, response_code, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supa
      .from("usage_daily")
      .select("id", { count: "exact", head: true })
      .eq("user_id", id),
  ]);

  if (!profile) return null;
  return { profile, subs: subs ?? [], apiKeys: apiKeys ?? [], walletLots: walletLots ?? [], unlocks: unlocks ?? [], apiUsage: apiUsage ?? [], scanCount: scanCount ?? 0 };
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seg?: string }>;
}) {
  const { id } = await params;
  const { seg = "consumers" } = await searchParams;
  const data = await loadUser(id);
  if (!data) notFound();

  const { profile, subs, apiKeys, walletLots, unlocks, apiUsage, scanCount } = data;
  const activeSub = subs.find((s) => s.status === "active");
  const activeApiKeys = apiKeys.filter((k) => !k.revoked_at);
  const walletTotal = walletLots.reduce(
    (acc, w) => acc + Number(w.credits_remaining ?? 0),
    0,
  );

  return (
    <div className="max-w-6xl">
      <Link href={`/admin/users?seg=${seg}`} className="text-xs text-muted-foreground hover:text-foreground">
        ← Back to users
      </Link>
      <header className="mt-3 mb-6 flex items-start gap-4">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full border-2 border-border"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-gradient-ig text-white grid place-items-center text-2xl font-bold">
            {(profile.full_name ?? profile.email ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {profile.full_name ?? "(no name)"}
          </h1>
          <div className="text-sm text-muted-foreground">{profile.email ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            User ID: <code className="font-mono">{id}</code>
          </div>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Current plan" value={activeSub?.plan ?? "Free"} sub={activeSub?.status ?? "no active sub"} />
        <KpiCard label="Wallet credits" value={walletTotal.toLocaleString()} sub={`${walletLots.length} lots`} />
        <KpiCard label="Active API keys" value={activeApiKeys.length.toString()} sub={`${apiKeys.length} total`} />
        <KpiCard label="Usage rows" value={scanCount.toLocaleString()} sub="usage_daily entries" />
      </div>

      {/* Grid layout: profile + actions on the left, activity on the right */}
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
        <div className="space-y-6">
          {/* Profile details */}
          <Section title="Profile">
            <KV k="Full name" v={profile.full_name ?? "—"} />
            <KV k="Email" v={profile.email ?? "—"} />
            <KV k="Phone" v={profile.phone ?? "—"} />
            <KV k="Country" v={profile.country_code ?? "—"} />
            <KV k="Timezone" v={profile.timezone ?? "—"} />
            <KV k="Company" v={profile.company ?? "—"} />
            <KV k="Job title" v={profile.job_title ?? "—"} />
            <KV k="Region (billing)" v={profile.region ?? "—"} />
            <KV k="Product-updates opt-in" v={profile.product_updates_opt_in ? "yes" : "no"} />
            <KV k="Marketing opt-in" v={profile.marketing_opt_in ? "yes" : "no"} />
            <KV k="Created" v={new Date(profile.created_at).toLocaleString()} />
            <KV k="Updated" v={new Date(profile.updated_at).toLocaleString()} />
          </Section>

          <Section title="Credit adjustment">
            <CreditAdjustForm userId={id} currentBalance={walletTotal} />
          </Section>

          <Section title="Subscription">
            <PlanChangeForm userId={id} currentPlan={activeSub?.plan ?? null} />
          </Section>

          <Section title="Razorpay refund">
            <RefundForm />
          </Section>
        </div>

        <div className="space-y-6">
          {/* Subscriptions */}
          <Section title="Subscriptions">
            {subs.length === 0 ? (
              <Empty text="No subscription history." />
            ) : (
              <ul className="space-y-2 text-sm">
                {subs.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border/60 p-3 flex justify-between items-start"
                  >
                    <div>
                      <div className="font-medium">{s.plan}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.provider} · created {new Date(s.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={
                          "px-2 py-0.5 rounded-full text-xs font-medium " +
                          (s.status === "active"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {s.status}
                      </span>
                      {s.current_period_end && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          till {new Date(s.current_period_end).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* API keys */}
          <Section title="API keys">
            {apiKeys.length === 0 ? (
              <Empty text="No API keys." />
            ) : (
              <ul className="space-y-2 text-sm">
                {apiKeys.map((k) => (
                  <li
                    key={k.id}
                    className="rounded-lg border border-border/60 p-3"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium font-mono text-xs">{k.key_prefix}…</div>
                        <div className="text-xs text-muted-foreground">
                          {k.name} · {k.tier}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="tabular-nums font-medium">
                          {(k.credits_remaining ?? 0).toLocaleString()}/{(k.credits_included ?? 0).toLocaleString()}
                        </div>
                        {k.revoked_at ? (
                          <span className="text-[10px] text-destructive">revoked</span>
                        ) : k.last_used_at ? (
                          <div className="text-[10px] text-muted-foreground">
                            used {new Date(k.last_used_at).toLocaleDateString()}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Wallet lots */}
          <Section title="Wallet lots">
            {walletLots.length === 0 ? (
              <Empty text="No wallet activity." />
            ) : (
              <ul className="space-y-2 text-sm">
                {walletLots.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-lg border border-border/60 p-3 flex justify-between items-start"
                  >
                    <div>
                      <div className="text-xs font-mono text-muted-foreground">{w.source}</div>
                      <div className="text-[10px] text-muted-foreground/70">
                        {new Date(w.created_at).toLocaleDateString()}
                        {w.expires_at ? ` · expires ${new Date(w.expires_at).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-xs tabular-nums">
                      <div className="font-medium">
                        {Number(w.credits_remaining).toLocaleString()}
                        <span className="text-muted-foreground"> / {Number(w.credits_original).toLocaleString()}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Recent unlocks */}
          <Section title="Recent unlocks">
            {unlocks.length === 0 ? (
              <Empty text="No paid unlocks." />
            ) : (
              <ul className="text-xs space-y-1">
                {unlocks.map((u) => (
                  <li key={u.id} className="flex justify-between border-b border-border/40 pb-1">
                    <span className="font-mono">{u.scan_key}</span>
                    <span className="text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* API usage */}
          <Section title="Recent API calls">
            {apiUsage.length === 0 ? (
              <Empty text="No API calls yet." />
            ) : (
              <ul className="text-xs space-y-1">
                {apiUsage.map((u) => (
                  <li key={u.id} className="flex justify-between border-b border-border/40 pb-1">
                    <span className="font-mono truncate max-w-[280px]">{u.endpoint}</span>
                    <span className="tabular-nums">
                      {u.credits_charged}c · {u.response_code}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-border/30 text-sm last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right max-w-[60%] break-words">{v}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground italic">{text}</div>;
}
