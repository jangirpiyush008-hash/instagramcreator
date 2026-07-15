"use client";

import { useEffect, useState } from "react";

// Client shim: POST /api/checkout the moment we render, then window.location
// to the Razorpay hosted-checkout URL that comes back. Kept as its own
// tiny component so the parent CheckoutPage stays a fast server render.

export function CheckoutClient({
  tierId,
  scanKey,
}: {
  tierId: string;
  scanKey?: string;
}) {
  const [state, setState] = useState<
    | { kind: "creating" }
    | { kind: "redirecting"; url: string }
    | { kind: "error"; message: string }
  >({ kind: "creating" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: tierId, scanKey }),
    })
      .then(async (r) => {
        const j = (await r.json()) as
          | { ok: true; url: string }
          | { ok: false; error: string };
        if (cancelled) return;
        if (!j.ok) {
          setState({ kind: "error", message: j.error });
          return;
        }
        setState({ kind: "redirecting", url: j.url });
        window.location.href = j.url;
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Checkout failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tierId, scanKey]);

  if (state.kind === "error") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{state.message}</p>
        <p className="text-xs text-muted-foreground">
          Try again in a moment, or email{" "}
          <a href="mailto:support.decodecreator@gmail.com" className="underline">
            support
          </a>{" "}
          if this keeps happening.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
      {state.kind === "redirecting" ? "Redirecting to Razorpay…" : "Preparing checkout…"}
    </div>
  );
}
