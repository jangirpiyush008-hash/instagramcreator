"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/web/lib/supabase-browser";

// Header "My Profile" dropdown. Renders the gradient pill button as
// before; clicking it opens a small menu with Settings / Subscription /
// Watchlist / API / Sign out. The user's display name + email live
// inside the dropdown header rather than on a permanent chip beside the
// avatar — keeps the top bar tight.
//
// Closes on outside-click, Escape, or route change (via the router).

interface Props {
  name?: string | null;
  email: string;
  avatarUrl?: string | null;
}

const MENU_ITEMS: { label: string; href: string; description?: string }[] = [
  {
    label: "Settings",
    href: "/account?tab=profile",
    description: "Name, avatar, password, email preferences",
  },
  {
    label: "Subscription",
    href: "/account?tab=subscription",
    description: "Plan, credits, invoices",
  },
  {
    label: "Watchlist",
    href: "/account?tab=watchlist",
    description: "Handles you're tracking",
  },
  {
    label: "API & Wallet",
    href: "/developer",
    description: "Keys, usage, top-up",
  },
];

export function ProfileMenu({ name, email, avatarUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabaseBrowser().auth.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }, [router, signingOut]);

  const displayName = name?.trim() || email.split("@")[0] || "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${displayName} · ${email}`}
        className="rounded-full bg-gradient-ig text-white pl-1 pr-4 py-1 font-semibold hover:brightness-110 transition shadow-md shadow-primary/20 flex items-center gap-2 text-sm"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-7 w-7 rounded-full border border-white/40 object-cover"
          />
        ) : (
          <span className="h-7 w-7 rounded-full bg-white/20 grid place-items-center text-xs font-bold">
            {initial}
          </span>
        )}
        <span>My Profile</span>
        <svg
          className={"h-3.5 w-3.5 opacity-80 transition-transform " + (open ? "rotate-180" : "")}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.04l3.71-3.81a.75.75 0 111.08 1.04l-4.25 4.36a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 rounded-2xl border border-border bg-card shadow-lg shadow-black/10 overflow-hidden z-50"
        >
          {/* Header — name + email inside the menu, not on the header pill */}
          <div className="p-4 border-b border-border/70 bg-muted/40">
            <div className="text-sm font-semibold truncate">{displayName}</div>
            <div className="text-xs text-foreground/60 truncate">{email}</div>
          </div>
          <div className="py-1">
            {MENU_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 hover:bg-muted/60 transition-colors"
                role="menuitem"
              >
                <div className="text-sm font-medium">{item.label}</div>
                {item.description && (
                  <div className="text-[11px] text-foreground/60 leading-snug">
                    {item.description}
                  </div>
                )}
              </Link>
            ))}
          </div>
          <div className="border-t border-border/70">
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-60"
              role="menuitem"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
