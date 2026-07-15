"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { computePrice, getServiceById, type Service } from "@/core/services/catalog";

// Guest cart. Persisted in localStorage so a user who leaves and comes
// back keeps their pending orders. No login required — the checkout
// page collects email + target handle per item at pay time.
//
// Storage key: `dc-services-cart` → { v: 1, items: [{serviceId, qty, targetUrl}] }
// targetUrl (Instagram profile URL / TikTok post URL / etc.) is set at
// checkout time by default, but we allow it here too so the cart card
// can show it if the user has already typed it.

const STORAGE_KEY = "dc-services-cart";
const CART_VERSION = 1;

export interface CartItem {
  serviceId: string;
  qty: number;
  targetUrl?: string;
}

interface Stored {
  v: number;
  items: CartItem[];
}

interface CartContextValue {
  items: CartItem[];
  count: number;                      // total item count in cart
  totalUsd: number;                   // sum across all items
  addItem: (serviceId: string, qty: number, targetUrl?: string) => void;
  updateItem: (serviceId: string, patch: Partial<CartItem>) => void;
  removeItem: (serviceId: string) => void;
  clear: () => void;
  hydrated: boolean;                  // false during SSR — used to hide count until mounted
}

const CartContext = createContext<CartContextValue | null>(null);

function loadStored(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored;
    if (parsed.v !== CART_VERSION) return [];
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function save(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Stored = { v: CART_VERSION, items };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    // Fire a custom event so other tabs / widgets react to changes.
    window.dispatchEvent(new CustomEvent("dc-cart:change"));
  } catch {
    // localStorage disabled — cart works for this tab only.
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadStored());
    setHydrated(true);
    // Sync across tabs.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(loadStored());
    };
    const onCustom = () => setItems(loadStored());
    window.addEventListener("storage", onStorage);
    window.addEventListener("dc-cart:change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("dc-cart:change", onCustom);
    };
  }, []);

  const addItem = useCallback((serviceId: string, qty: number, targetUrl?: string) => {
    setItems((prev) => {
      // If the same service is already in the cart, bump its qty instead
      // of adding a duplicate row. UX matches every e-commerce cart.
      const existing = prev.find((i) => i.serviceId === serviceId);
      const next: CartItem[] = existing
        ? prev.map((i) =>
            i.serviceId === serviceId
              ? { ...i, qty: i.qty + qty, targetUrl: targetUrl ?? i.targetUrl }
              : i,
          )
        : [...prev, { serviceId, qty, targetUrl }];
      save(next);
      return next;
    });
  }, []);

  const updateItem = useCallback((serviceId: string, patch: Partial<CartItem>) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.serviceId === serviceId ? { ...i, ...patch } : i));
      save(next);
      return next;
    });
  }, []);

  const removeItem = useCallback((serviceId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.serviceId !== serviceId);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    save([]);
  }, []);

  // Derived totals. computePrice needs the Service — resolve lazily
  // via getServiceById so an ID that's been removed from the catalog
  // silently skips instead of crashing the whole cart.
  const totalUsd = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      const svc = getServiceById(it.serviceId);
      if (svc) sum += computePrice(svc, it.qty);
    }
    return Math.round(sum * 100) / 100;
  }, [items]);

  const value: CartContextValue = {
    items,
    count: items.length,
    totalUsd,
    addItem,
    updateItem,
    removeItem,
    clear,
    hydrated,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

// Convenience: get the resolved Service for each cart item + its price.
// Skips items whose serviceId no longer exists in the catalog.
export function useCartWithServices(): {
  rows: { item: CartItem; service: Service; price: number }[];
} {
  const { items } = useCart();
  const rows = items
    .map((item) => {
      const service = getServiceById(item.serviceId);
      if (!service) return null;
      return { item, service, price: computePrice(service, item.qty) };
    })
    .filter((r): r is { item: CartItem; service: Service; price: number } => r !== null);
  return { rows };
}
