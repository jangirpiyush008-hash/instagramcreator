"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/web/components/ui/Button";
import { Card, CardBody } from "@/web/components/ui/Card";
import type { Plan, Region } from "@/core/types";
import { PRICING } from "@/core/constants";
import { formatAmount } from "@/core/utils/currency";

export function Paywall({
  scanKey,
  region,
  isAuthed,
}: {
  scanKey: string;
  region: Region;
  isAuthed: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cfg = PRICING[region];

  async function checkout(plan: Plan) {
    setError(null);
    if (!isAuthed) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setLoading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, scanKey: plan === "one_time" ? scanKey : undefined }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Checkout failed (${res.status})`);
      }
      const j = (await res.json()) as { url: string };
      window.location.href = j.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setLoading(null);
    }
  }

  return (
    <Card className="border-2">
      <CardBody className="space-y-5">
        <div>
          <h3 className="text-xl font-semibold">Unlock the full report</h3>
          <p className="text-muted-foreground text-sm mt-1">
            One-time unlock for this scan, or subscribe for unlimited scans and
            account monitoring.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Button
            size="lg"
            variant="outline"
            disabled={loading !== null}
            onClick={() => checkout("one_time")}
          >
            {loading === "one_time"
              ? "Redirecting…"
              : `Unlock this report — ${formatAmount(cfg.oneTime, region)}`}
          </Button>
          <Button
            size="lg"
            disabled={loading !== null}
            onClick={() => checkout("monthly")}
          >
            {loading === "monthly"
              ? "Redirecting…"
              : `Subscribe — ${formatAmount(cfg.monthly, region)}/mo`}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Annual plan also available — {formatAmount(cfg.annual, region)}/year.
          Cancel anytime.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
