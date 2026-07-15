import type { Metadata } from "next";
import Link from "next/link";
import { supabaseService } from "@/core/database/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Users — Admin",
  robots: { index: false, follow: false, nocache: true },
};

// Users list with the Consumers ↔ Developers segment filter.
//
// Query strategy: select("*") on profiles so a missing optional column
// (e.g. full_name before 0004 ran, phone before 0009 ran) doesn't
// blow up the whole page. We pluck fields at runtime with ?? fallbacks.
//
// Columns rendered per segment:
//   Consumers  → User, Plan, Wallet, Scans/mo, Country, Joined
//   Developers → User, Company, API keys, Wallet, Country, Joined
// The "Plan" concept doesn't apply to Developers (they meter through
// wallet credits, not a monthly quota). API-key count doesn't apply to
// Consumers (most will never mint a key).

// Row shape kept intentionally flexible — new columns show up
// automatically without touching this type.
interface Row {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  country_code: string | null;
  created_at: string;
  active_sub_plan: string | null;
  api_key_count: number;
  wallet_credits: number;
  scans_this_month: number;
}

interface LoadResult {
  rows: Row[];
  error?: string;
  diag?: string;
}

async function loadUsers(seg: "consumers" | "developers", q: string): Promise<LoadResult> {
  const supa = supabaseService();

  // For Developers: restrict to user_ids with at least one non-revoked
  // API key. If nobody has one, short-circuit before querying profiles.
  let devUserIds: Set<string> | null = null;
  if (seg === "developers") {
    const { data: keys, error: keysErr } = await supa
      .from("api_keys")
      .select("user_id")
      .is("revoked_at", null);
    if (keysErr) {
      return { rows: [], error: `Couldn't load api_keys: ${keysErr.message}`, diag: keysErr.code };
    }
    devUserIds = new Set((keys ?? []).map((k) => k.user_id));
    if (devUserIds.size === 0) return { rows: [], diag: "no-devs" };
  }

  // select("*") so missing optional columns don't break the whole query.
  // If 0004 (full_name/avatar_url) or 0009 (phone/country_code/etc)
  // hasn't run yet, we just get whatever columns DO exist.
  let query = supa
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (devUserIds) query = query.in("id", Array.from(devUserIds));

  if (q.trim()) {
    // Match on email only (guaranteed column). full_name/company are
    // best-effort — if they exist we'll match them too. Keep the query
    // simple to avoid 42703 on missing columns.
    const like = `%${q.trim().toLowerCase()}%`;
    query = query.ilike("email", like);
  }

  const { data: profiles, error } = await query;
  if (error) {
    console.error("[admin/users] load failed:", error);
    return { rows: [], error: `Couldn't load profiles: ${error.message}`, diag: error.code };
  }
  const userIds = (profiles ?? []).map((p) => p.id);
  if (userIds.length === 0) return { rows: [], diag: "profiles-empty" };

  const [
    { data: subs },
    { data: keys },
    { data: walletLots },
    { data: usage },
  ] = await Promise.all([
    supa
      .from("subscriptions")
      .select("user_id, plan, status")
      .in("user_id", userIds)
      .eq("status", "active"),
    supa
      .from("api_keys")
      .select("user_id, revoked_at")
      .in("user_id", userIds),
    supa
      .from("wallet_lots")
      .select("user_id, credits_remaining")
      .in("user_id", userIds)
      .gt("credits_remaining", 0),
    supa
      .from("usage_daily")
      .select("user_id, scans_count")
      .in("user_id", userIds)
      .gte("day", firstOfMonthISO()),
  ]);

  const subByUser = new Map<string, string>();
  for (const s of subs ?? []) if (!subByUser.has(s.user_id)) subByUser.set(s.user_id, s.plan);
  const keysByUser = new Map<string, number>();
  for (const k of keys ?? []) if (!k.revoked_at) keysByUser.set(k.user_id, (keysByUser.get(k.user_id) ?? 0) + 1);
  const walletByUser = new Map<string, number>();
  for (const w of walletLots ?? []) walletByUser.set(w.user_id, (walletByUser.get(w.user_id) ?? 0) + Number(w.credits_remaining ?? 0));
  const scansByUser = new Map<string, number>();
  for (const u of usage ?? []) scansByUser.set(u.user_id, (scansByUser.get(u.user_id) ?? 0) + Number(u.scans_count ?? 0));

  const rows = (profiles ?? []).map((p) => ({
    id: p.id,
    email: (p.email ?? null) as string | null,
    full_name: (p.full_name ?? null) as string | null,
    company: (p.company ?? null) as string | null,
    country_code: (p.country_code ?? null) as string | null,
    created_at: (p.created_at ?? new Date().toISOString()) as string,
    active_sub_plan: subByUser.get(p.id) ?? null,
    api_key_count: keysByUser.get(p.id) ?? 0,
    wallet_credits: walletByUser.get(p.id) ?? 0,
    scans_this_month: scansByUser.get(p.id) ?? 0,
  }));
  return { rows };
}

function firstOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string; q?: string; created?: string }>;
}) {
  const { seg: segRaw = "consumers", q = "", created } = await searchParams;
  const seg = segRaw === "developers" ? "developers" : "consumers";
  const { rows, error, diag } = await loadUsers(seg, q);

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {seg === "consumers" ? "Consumers" : "Developers"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {seg === "consumers"
              ? "Every signed-up user, newest first."
              : "Users with at least one active API key."}
          </p>
        </div>
        <Link
          href={`/admin/users/new?seg=${seg}`}
          className="rounded-full bg-gradient-ig text-white px-4 py-2 text-sm font-semibold hover:brightness-110 transition shadow-md shadow-primary/20"
        >
          + Add user
        </Link>
      </header>

      {created && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-500 mb-4">
          User <b>{created}</b> created successfully.
        </div>
      )}

      {/* Search — GET form so bookmarks + shareable links work */}
      <form className="flex gap-2 mb-4" action="/admin/users" method="get">
        <input type="hidden" name="seg" value={seg} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search email…"
          className="h-10 flex-1 rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60"
        />
        <button type="submit" className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-semibold hover:opacity-90">
          Search
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive mb-4">
          <div className="font-medium">Query error</div>
          <div className="text-xs mt-1 font-mono">{error}</div>
          <div className="text-[11px] text-muted-foreground mt-2">
            If you see &quot;column ... does not exist&quot; (code 42703),
            run the corresponding migration on Supabase. 0004 adds
            full_name/avatar_url. 0009 adds phone/country_code/company.
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground mb-3">
        {rows.length}
        {rows.length === 200 ? "+" : ""} result{rows.length === 1 ? "" : "s"}
        {diag ? ` · diag: ${diag}` : ""}
      </div>

      {/* Segment-specific column set */}
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>User</Th>
              {seg === "consumers" ? (
                <>
                  <Th>Plan</Th>
                  <Th>Wallet</Th>
                  <Th>Scans / mo</Th>
                </>
              ) : (
                <>
                  <Th>Company</Th>
                  <Th>API keys</Th>
                  <Th>Wallet</Th>
                </>
              )}
              <Th>Country</Th>
              <Th>Joined</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <Td>
                  <div className="font-medium">{r.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                </Td>
                {seg === "consumers" ? (
                  <>
                    <Td>
                      {r.active_sub_plan ? (
                        <Chip>{r.active_sub_plan}</Chip>
                      ) : (
                        <span className="text-muted-foreground">Free</span>
                      )}
                    </Td>
                    <Td><span className="tabular-nums">{r.wallet_credits.toLocaleString()}</span></Td>
                    <Td><span className="tabular-nums">{r.scans_this_month.toLocaleString()}</span></Td>
                  </>
                ) : (
                  <>
                    <Td>{r.company || <span className="text-muted-foreground">—</span>}</Td>
                    <Td>{r.api_key_count}</Td>
                    <Td><span className="tabular-nums">{r.wallet_credits.toLocaleString()}</span></Td>
                  </>
                )}
                <Td>{r.country_code ?? "—"}</Td>
                <Td>{new Date(r.created_at).toLocaleDateString()}</Td>
                <Td>
                  <Link href={`/admin/users/${r.id}?seg=${seg}`} className="text-primary text-xs font-medium hover:underline">
                    View →
                  </Link>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                  {q ? `No ${seg} matched "${q}".` : `No ${seg} yet.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-2 font-semibold">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
      {children}
    </span>
  );
}
