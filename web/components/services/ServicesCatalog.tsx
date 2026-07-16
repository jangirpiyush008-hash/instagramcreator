"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/web/lib/cn";
import {
  SERVICES,
  type Service,
  type ServicePlatform,
  fmtQty,
} from "@/core/services/catalog";
import { useCart } from "./CartContext";
import { TrialModal } from "./TrialModal";

// Grid of every active service, filterable by platform. Each card has
// an inline quantity picker + Add-to-cart button so the user doesn't
// need to open a separate product page.

type PlatformFilter = "all" | ServicePlatform;

const PLATFORM_TABS: { id: PlatformFilter; label: string; gradient: string }[] = [
  { id: "all", label: "All", gradient: "bg-foreground" },
  { id: "instagram", label: "Instagram", gradient: "bg-gradient-ig" },
  { id: "tiktok", label: "TikTok", gradient: "bg-gradient-tt" },
  { id: "youtube", label: "YouTube", gradient: "bg-gradient-yt" },
  { id: "facebook", label: "Facebook", gradient: "bg-blue-600" },
];

export function ServicesCatalog() {
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [trialFor, setTrialFor] = useState<Service | null>(null);
  const { count, totalUsd } = useCart();

  const visible = useMemo(() => {
    if (platform === "all") return SERVICES.filter((s) => s.isActive);
    return SERVICES.filter((s) => s.isActive && s.platform === platform);
  }, [platform]);

  return (
    <div className="container py-8 lg:py-10 max-w-6xl">
      {/* Header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">
            Growth Services
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Boost your reach on any platform
          </h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
            Real growth campaigns for creators and small brands. Pick a
            service, choose your quantity, add to cart. Guest checkout, no
            account needed.
          </p>
        </div>
        {count > 0 && (
          <Link
            href="/services/cart"
            className="inline-flex items-center gap-3 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity shadow-md"
          >
            <span>🛒 {count} in cart</span>
            <span className="tabular-nums text-primary bg-background/10 rounded-full px-2 py-0.5">
              ${totalUsd.toFixed(2)}
            </span>
            <span aria-hidden>→</span>
          </Link>
        )}
      </header>

      {/* Platform tabs */}
      <div className="inline-flex rounded-full border border-border bg-background/60 p-1 mb-6 flex-wrap">
        {PLATFORM_TABS.map((tab) => {
          const active = platform === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPlatform(tab.id)}
              aria-pressed={active}
              className={cn(
                "px-4 sm:px-5 py-2 text-sm rounded-full transition-all font-medium",
                active
                  ? `${tab.gradient} text-white shadow-md`
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="text-sm text-muted-foreground mb-4">
        {visible.length} service{visible.length === 1 ? "" : "s"}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((svc) => (
          <ServiceCard key={svc.id} service={svc} onTrialClick={() => setTrialFor(svc)} />
        ))}
      </div>

      {/* Trial modal — one instance controlled by the outer state */}
      <TrialModal service={trialFor} trialQty={50} onClose={() => setTrialFor(null)} />

      {/*
        Back-to-main link — kept at the bottom of the page rather than
        the top nav so this vertical remains one-way discoverable
        (visitors landing here via direct URL can click over to
        DecodeCreator, but the main site doesn't expose this page).
      */}
      <div className="mt-16 flex justify-center">
        <a
          href="https://decodecreator.com"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          ← Go to DecodeCreator (analytics for public IG / TikTok / YouTube accounts)
        </a>
      </div>
    </div>
  );
}

// ── Single service card with inline qty picker + add button ─────────────
function ServiceCard({ service, onTrialClick }: { service: Service; onTrialClick: () => void }) {
  const { items, addItem } = useCart();
  const [qty, setQty] = useState<number>(service.qty.min);

  const price = (service.retailRateUsd * qty) / 1000;

  // If this service is already in the cart, we swap the "Add to cart"
  // button for a "View cart →" link. Users don't need to re-add; if
  // they want a different quantity they can adjust in the cart directly.
  const inCart = items.find((i) => i.serviceId === service.id);

  const handleAdd = () => {
    addItem(service.id, qty);
  };

  const platformColor = platformClass(service.platform);

  return (
    <div className="rounded-xl border border-border bg-card/60 p-5 flex flex-col hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            "h-10 w-10 rounded-lg grid place-items-center text-white text-lg shadow-sm shrink-0",
            platformColor,
          )}
        >
          {service.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm leading-tight">{service.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {service.platform}
            </span>
            {service.region && (
              <span className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold">
                {service.region}
              </span>
            )}
            {service.refill && (
              <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">
                ♻ refill
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-foreground/70 leading-relaxed line-clamp-2 mb-4">
        {service.blurb}
      </p>

      <div className="mt-auto space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Starts in</span>
          <span className="font-medium">{service.startTime}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Rate</span>
          <span className="font-medium tabular-nums">
            ${service.retailRateUsd} / 1k
          </span>
        </div>

        {/* Quantity picker */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Quantity
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(service.qty.min, q - service.qty.step))}
              className="h-9 w-9 rounded-lg border border-border hover:bg-muted transition-colors font-mono"
              aria-label="Decrease"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={qty}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10);
                setQty(Math.min(service.qty.max, Math.max(service.qty.min, n)));
              }}
              className="h-9 flex-1 rounded-lg border border-input bg-background/80 px-3 text-sm text-center tabular-nums outline-none focus-visible:border-primary/60"
            />
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(service.qty.max, q + service.qty.step))}
              className="h-9 w-9 rounded-lg border border-border hover:bg-muted transition-colors font-mono"
              aria-label="Increase"
            >
              +
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
            <span>Min: {fmtQty(service.qty.min)}</span>
            <span>Max: {fmtQty(service.qty.max)}</span>
          </div>
        </div>

        {/* Price + Add / View cart */}
        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {inCart ? "In cart" : "Price"}
            </div>
            {inCart ? (
              <div className="text-xl font-bold tabular-nums text-emerald-500">
                × {inCart.qty.toLocaleString()}
              </div>
            ) : (
              <div className="text-xl font-bold tabular-nums">
                ${price.toFixed(2)}
              </div>
            )}
          </div>
          {inCart ? (
            <Link
              href="/services/cart"
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:brightness-110 transition-all inline-flex items-center gap-1.5"
            >
              View cart <span aria-hidden>→</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-all"
            >
              Add to cart
            </button>
          )}
        </div>

        {/*
          Free-trial button — separate row so it doesn't compete with
          the primary "Add to cart" CTA. Anti-abuse (1 per person ever)
          is enforced server-side via IP + email + handle unique keys.
        */}
        <button
          type="button"
          onClick={onTrialClick}
          className="w-full mt-2 py-2 rounded-lg text-xs font-medium border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors"
        >
          🎁 Try 50 free — no card
        </button>
      </div>
    </div>
  );
}

function platformClass(p: ServicePlatform): string {
  if (p === "instagram") return "bg-gradient-ig";
  if (p === "tiktok") return "bg-gradient-tt";
  if (p === "youtube") return "bg-gradient-yt";
  if (p === "facebook") return "bg-blue-600";
  return "bg-foreground";
}
