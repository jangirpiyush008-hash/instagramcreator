import type { Metadata } from "next";
import Link from "next/link";
import { supabaseService } from "@/core/database/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Users — Admin",
  robots: { index: false, follow: false, nocache: true },
};

// Users list with the Consumers ↔ Developers segment filter.
//   Consumers: every profile row (default view)
//   Developers: profiles that have at least one API key
//
// Also supports keyword search (email / full_name / company) via a
// query param. Ranked by created_at desc — newest signups first.

interface Row {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  country_code: string | null;
  created_at: string;
  active_sub_plan: string | null;
  active_sub_status: string | null;
  api_key_count: number;
  wallet_credits: number;
}

async function loadUsers(seg: "consumers" | "developers", q: string): Promise<Row[]> {
  const supa = supabaseService();

  // If the segment is developers, restrict to user_ids that have an
  // api_key row. Cheaper to fetch the id-set first than to right-join
  // client-side.
  let devUserIds: Set<string> | null = null;
  if (seg === "developers") {
    const { data: keys } = await supa
      .from("api_keys")
      .select("user_id")
      .is("revoked_at", null);
    devUserIds = new Set((keys ?? []).map((k) => k.user_id));
    if (devUserIds.size === 0) return [];
  }

  let query = supa
    .from("profiles")
    .select(
      "id, email, full_name, company, country_code, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (devUserIds) query = query.in("id", Array.from(devUserIds));

  if (q.trim()) {
    // Free-text search across email + full_name + company via ilike.
    // Postgres handles it cheaply on <10k rows without an index; add
    // one later if perf tanks.
    const like = `%${q.trim().toLowerCase()}%`;
    query = query.or(
      `email.ilike.${like},full_name.ilike.${like},company.ilike.${like}`,
    );
  }

  const { data: profiles, error } = await query;
  if (error) {
    console.error("[admin/users] load failed:", error);
    return [];
  }
  const userIds = (profiles ?? []).map((p) => p.id);
  if (userIds.length === 0) return [];

  // Enrich each user with: active sub plan, api_key count, wallet credits.
  const [{ data: subs }, { data: keys }, { data: walletLots }] = await Promise.all([
    supa
      .from("subscriptions")
      .select("user_id, plan, status, current_period_end")
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
  ]);

  const subByUser = new Map<string, { plan: string; status: string }>();
  for (const s of subs ?? []) {
    if (!subByUser.has(s.user_id)) subByUser.set(s.user_id, { plan: s.plan, status: s.status });
  }
  const keysByUser = new Map<string, number>();
  for (const k of keys ?? []) {
    if (k.revoked_at) continue;
    keysByUser.set(k.user_id, (keysByUser.get(k.user_id) ?? 0) + 1);
  }
  const walletByUser = new Map<string, number>();
  for (const w of walletLots ?? []) {
    walletByUser.set(w.user_id, (walletByUser.get(w.user_id) ?? 0) + Number(w.credits_remaining ?? 0));
  }

  return (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    company: p.company,
    country_code: p.country_code,
    created_at: p.created_at,
    active_sub_plan: subByUser.get(p.id)?.plan ?? null,
    active_sub_status: subByUser.get(p.id)?.status ?? null,
    api_key_count: keysByUser.get(p.id) ?? 0,
    wallet_credits: walletByUser.get(p.id) ?? 0,
  }));
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string; q?: string }>;
}) {
  const { seg: segRaw = "consumers", q = "" } = await searchParams;
  const seg = segRaw === "developers" ? "developers" : "consumers";
  const rows = await loadUsers(seg, q);

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
      </header>

      {/* Search — GET form so bookmarks + shareable links work */}
      <form className="flex gap-2 mb-4" action="/admin/users" method="get">
        <input type="hidden" name="seg" value={seg} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search email, name, or company…"
          className="h-10 flex-1 rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60"
        />
        <button
          type="submit"
          className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-semibold hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="text-xs text-muted-foreground mb-3">
        {rows.length}
        {rows.length === 200 ? "+" : ""} result{rows.length === 1 ? "" : "s"}
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>User</Th>
              <Th>Plan</Th>
              <Th>API keys</Th>
              <Th>Wallet</Th>
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
                  {r.company && (
                    <div className="text-[10px] text-muted-foreground/70">{r.company}</div>
                  )}
                </Td>
                <Td>
                  {r.active_sub_plan ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {r.active_sub_plan}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Free</span>
                  )}
                </Td>
                <Td>{r.api_key_count}</Td>
                <Td>
                  <span className="tabular-nums">{r.wallet_credits.toLocaleString()}</span>
                </Td>
                <Td>{r.country_code ?? "—"}</Td>
                <Td>{new Date(r.created_at).toLocaleDateString()}</Td>
                <Td>
                  <Link
                    href={`/admin/users/${r.id}?seg=${seg}`}
                    className="text-primary text-xs font-medium hover:underline"
                  >
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
