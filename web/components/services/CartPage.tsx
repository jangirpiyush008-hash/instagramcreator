"use client";

import Link from "next/link";
import { cn } from "@/web/lib/cn";
import { fmtQty } from "@/core/services/catalog";
import { useCart, useCartWithServices } from "./CartContext";

// Cart review page. Shows every added service, lets the user edit qty
// inline (recomputes price), remove items, or continue shopping. Empty
// state points back to /services.

export function CartPage() {
  const { rows } = useCartWithServices();
  const { updateItem, removeItem, totalUsd, hydrated } = useCart();

  if (!hydrated) {
    return (
      <div className="container py-12 max-w-4xl text-center text-muted-foreground text-sm">
        Loading cart…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="container py-16 max-w-2xl text-center">
        <div className="text-5xl mb-4">🛒</div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your cart is empty
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          Browse our growth services and add one to get started.
        </p>
        <Link
          href="/services"
          className="inline-flex items-center gap-2 mt-6 rounded-full bg-gradient-ig text-white px-6 py-3 text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-primary/20"
        >
          Browse services →
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-8 lg:py-10 max-w-4xl">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">
          Cart
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Review your order
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          {rows.length} service{rows.length === 1 ? "" : "s"} · Update
          quantities below or continue browsing.
        </p>
      </header>

      <div className="space-y-3 mb-6">
        {rows.map(({ item, service, price }) => (
          <div
            key={item.serviceId}
            className="rounded-xl border border-border bg-card/60 p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg grid place-items-center text-white text-lg shadow-sm shrink-0 bg-gradient-ig">
                {service.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{service.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground mt-0.5">
                  <span className="uppercase tracking-wider">{service.platform}</span>
                  {service.region && (
                    <span className="uppercase tracking-wider text-primary/80 font-semibold">
                      · {service.region}
                    </span>
                  )}
                  <span>· Rate ${service.retailRateUsd}/1k</span>
                  <span>· Starts {service.startTime}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.serviceId)}
                className="text-muted-foreground hover:text-destructive text-sm px-2 py-1"
                aria-label="Remove"
              >
                Remove
              </button>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground mr-2">
                  Quantity
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateItem(item.serviceId, {
                      qty: Math.max(service.qty.min, item.qty - service.qty.step),
                    })
                  }
                  className="h-8 w-8 rounded-md border border-border hover:bg-muted transition-colors font-mono text-sm"
                  aria-label="Decrease"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={item.qty}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10);
                    updateItem(item.serviceId, {
                      qty: Math.min(service.qty.max, Math.max(service.qty.min, n)),
                    });
                  }}
                  className="h-8 w-24 rounded-md border border-input bg-background/80 px-2 text-sm text-center tabular-nums outline-none focus-visible:border-primary/60"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateItem(item.serviceId, {
                      qty: Math.min(service.qty.max, item.qty + service.qty.step),
                    })
                  }
                  className="h-8 w-8 rounded-md border border-border hover:bg-muted transition-colors font-mono text-sm"
                  aria-label="Increase"
                >
                  +
                </button>
                <span className="text-[11px] text-muted-foreground ml-1">
                  ({fmtQty(item.qty)})
                </span>
              </div>
              <div className="text-lg font-bold tabular-nums text-right">
                ${price.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total + checkout */}
      <div className="rounded-xl border border-border bg-card/80 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Order total
            </div>
            <div className="text-3xl font-bold tabular-nums">
              ${totalUsd.toFixed(2)}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Prices in USD.
            <br />
            No tax on digital services in most regions.
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            href="/services"
            className={cn(
              "flex-1 sm:flex-none text-center px-5 py-3 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium",
            )}
          >
            ← Keep browsing
          </Link>
          <Link
            href="/services/checkout"
            className="flex-1 text-center px-5 py-3 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity text-sm font-semibold shadow-md"
          >
            Proceed to checkout →
          </Link>
        </div>
      </div>
    </div>
  );
}
