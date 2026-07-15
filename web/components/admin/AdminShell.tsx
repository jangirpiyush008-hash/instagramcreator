"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/web/lib/cn";

// Admin panel chrome — LIGHT theme only. Top bar has a 3-way segment
// toggle: Consumers | Developers | Growth. Switching segments ALWAYS
// takes you back to /admin (Overview) — owner request. That keeps the
// mental model "pick your context, then drill in" instead of the URL
// carrying stale filters across contexts.
//
// Sidebar changes shape per segment:
//   Consumers  → All / Active subscribers / Free tier / + Add consumer
//   Developers → All / By wallet / By usage / + Add developer
//   Growth     → All orders / Awaiting / Paid / Delivered

type Segment = "consumers" | "developers" | "growth";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}
interface NavGroup {
  title?: string;
  items: NavItem[];
}

function navFor(seg: Segment): NavGroup[] {
  const overview: NavGroup = {
    items: [{ href: `/admin?seg=${seg}`, label: "Overview", exact: true }],
  };
  if (seg === "growth") {
    return [
      overview,
      {
        title: "Growth orders",
        items: [
          { href: "/admin/orders?seg=growth", label: "All orders" },
          { href: "/admin/orders?seg=growth&status=awaiting_payment", label: "Awaiting payment" },
          { href: "/admin/orders?seg=growth&status=paid", label: "Paid — needs delivery" },
          { href: "/admin/orders?seg=growth&status=delivered", label: "Delivered" },
          { href: "/admin/orders?seg=growth&status=failed", label: "Failed" },
        ],
      },
    ];
  }
  if (seg === "consumers") {
    return [
      overview,
      {
        title: "Consumers",
        items: [
          { href: `/admin/users?seg=consumers`, label: "All consumers" },
          { href: `/admin/users?seg=consumers&status=active`, label: "Active subscribers" },
          { href: `/admin/users?seg=consumers&status=free`, label: "Free tier" },
          { href: `/admin/users/new?seg=consumers`, label: "+ Add consumer" },
        ],
      },
    ];
  }
  // developers
  return [
    overview,
    {
      title: "Developers",
      items: [
        { href: `/admin/users?seg=developers`, label: "All developers" },
        { href: `/admin/users?seg=developers&sort=wallet`, label: "By wallet balance" },
        { href: `/admin/users?seg=developers&sort=usage`, label: "By API usage" },
        { href: `/admin/users/new?seg=developers`, label: "+ Add developer" },
      ],
    },
  ];
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const search = useSearchParams();
  const router = useRouter();
  const seg: Segment = parseSeg(search.get("seg"));

  // Segment switch ALWAYS lands on /admin (Overview) per owner
  // request. Keeps the flow: pick context first, then drill in from
  // the sidebar. Prevents stale filters from a previous segment
  // leaking into the new one.
  const setSeg = useCallback(
    (next: Segment) => {
      router.push(`/admin?seg=${next}`, { scroll: false });
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/admin/auth", { method: "DELETE" });
    } finally {
      window.location.href = "/admin/login";
    }
  }, []);

  const groups = navFor(seg);

  return (
    <div className="min-h-screen flex bg-neutral-50 text-neutral-900">
      {/* SIDEBAR */}
      <aside className="hidden md:flex md:w-64 shrink-0 border-r border-neutral-200 bg-white flex-col">
        <div className="px-5 py-5 border-b border-neutral-200">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight text-neutral-900">
            <span className="h-7 w-7 rounded-lg bg-gradient-ig" aria-hidden />
            <span>Admin</span>
          </Link>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">
            Owner console
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.title && (
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 px-3 mb-2">
                  {g.title}
                </div>
              )}
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = isActive(pathname, search, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "block px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-neutral-200">
          <button
            type="button"
            onClick={logout}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* TOP BAR — 3-way segment toggle on the right */}
        <div className="border-b border-neutral-200 bg-white">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs text-neutral-500">
              {seg === "consumers" && "Viewing consumer web-app users"}
              {seg === "developers" && "Viewing API developers + wallet balances"}
              {seg === "growth" && "Viewing growth-services orders (SMM vertical)"}
            </div>
            <SegmentToggle seg={seg} onChange={setSeg} />
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 px-4 sm:px-6 py-6 lg:py-8">{children}</div>
      </div>
    </div>
  );
}

function parseSeg(raw: string | null): Segment {
  if (raw === "developers") return "developers";
  if (raw === "growth") return "growth";
  return "consumers";
}

// Match "active" based on pathname AND a subset of the query params
// on the item's href. Lets us highlight e.g. /admin/users?seg=consumers
// only when both pathname and seg match.
function isActive(pathname: string, currentSearch: URLSearchParams, item: NavItem): boolean {
  const [itemPath, itemQuery] = item.href.split("?");
  if (item.exact ? pathname !== itemPath : !pathname.startsWith(itemPath!)) return false;
  if (!itemQuery) return true;
  const itemParams = new URLSearchParams(itemQuery);
  for (const [k, v] of itemParams.entries()) {
    if (currentSearch.get(k) !== v) return false;
  }
  return true;
}

// ── Segment toggle: 3-way ─────────────────────────────────────────────
function SegmentToggle({ seg, onChange }: { seg: Segment; onChange: (s: Segment) => void }) {
  const opts: { id: Segment; label: string; icon: string }[] = [
    { id: "consumers", label: "Consumers", icon: "👥" },
    { id: "developers", label: "Developers", icon: "🧑‍💻" },
    { id: "growth", label: "Growth", icon: "📈" },
  ];
  return (
    <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
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
                : "text-neutral-700 hover:text-neutral-900",
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
