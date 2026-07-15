"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/web/lib/cn";

// Admin panel chrome. Left sidebar navigation + top bar with the
// Consumers ↔ Developers segment toggle. Both live on every admin
// page so a segment choice persists as the user navigates.
//
// Segment state lives in the URL as ?seg=consumers|developers so it
// survives navigation, shareable links, and browser back. Default is
// consumers (bigger audience, most common admin task = look at web-app
// users).

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/orders", label: "Growth orders" },
];

type Segment = "consumers" | "developers";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const search = useSearchParams();
  const router = useRouter();
  const seg: Segment = (search.get("seg") as Segment) === "developers" ? "developers" : "consumers";

  const setSeg = useCallback(
    (next: Segment) => {
      const p = new URLSearchParams(search.toString());
      p.set("seg", next);
      router.push(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, router, search],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/admin/auth", { method: "DELETE" });
    } finally {
      window.location.href = "/admin/login";
    }
  }, []);

  return (
    <div className="min-h-screen flex bg-background">
      {/* SIDEBAR */}
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 border-r border-border bg-card/40 flex-col">
        <div className="px-5 py-5 border-b border-border/60">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="h-7 w-7 rounded-lg bg-gradient-ig" aria-hidden />
            <span>Admin</span>
          </Link>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
            Owner console
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={`${item.href}?seg=${seg}`}
                className={cn(
                  "block px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/80 hover:text-foreground hover:bg-muted/60",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border/60">
          <button
            type="button"
            onClick={logout}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* TOP BAR — segment toggle lives here */}
        <div className="border-b border-border bg-background/60 backdrop-blur">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <SegmentToggle seg={seg} onChange={setSeg} />
            <div className="hidden sm:block text-xs text-muted-foreground">
              {seg === "consumers"
                ? "Viewing: web-app users, subscriptions, per-user scans"
                : "Viewing: API users, wallet balances, API keys"}
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 px-4 sm:px-6 py-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}

// ── Segment toggle ─────────────────────────────────────────────────────
function SegmentToggle({ seg, onChange }: { seg: Segment; onChange: (s: Segment) => void }) {
  const opts: { id: Segment; label: string; icon: string }[] = [
    { id: "consumers", label: "Consumers", icon: "👥" },
    { id: "developers", label: "Developers", icon: "🧑‍💻" },
  ];
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card/70 p-1">
      {opts.map((o) => {
        const active = seg === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={cn(
              "px-4 sm:px-5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all",
              active
                ? "bg-gradient-ig text-white shadow"
                : "text-foreground/70 hover:text-foreground",
            )}
          >
            <span className="mr-1.5" aria-hidden>{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
