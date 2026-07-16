"use client";

import { useState, useEffect } from "react";
import { cn } from "@/web/lib/cn";
import type { Service } from "@/core/services/catalog";

// Small modal that opens when a customer clicks "Try 50 free" on a
// service card. Collects email + target URL and hits /api/services/trial.
//
// Backend enforces the one-trial-per-person cap via IP + email + handle
// unique indexes, so this UI can be forgiving on client-side validation.

interface Props {
  service: Service | null;
  trialQty: number;
  onClose: () => void;
}

export function TrialModal({ service, trialQty, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<{ orderRef: string; serviceName: string; quantity: number } | null>(null);

  // Reset on service change (opening a different card).
  useEffect(() => {
    setEmail("");
    setTargetUrl("");
    setErr(null);
    setOk(null);
  }, [service?.id]);

  if (!service) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/services/trial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          email: email.trim(),
          targetUrl: targetUrl.trim(),
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Trial claim failed");
        return;
      }
      setOk({
        orderRef: body.orderRef,
        serviceName: body.serviceName,
        quantity: body.quantity,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">
              Free trial
            </div>
            <h3 className="text-lg font-semibold tracking-tight">
              Get {trialQty} {service.category} on us
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{service.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {ok ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm space-y-2">
            <div className="font-semibold text-emerald-600 dark:text-emerald-500">
              ✅ Trial claimed
            </div>
            <div className="text-xs text-foreground/80 leading-relaxed">
              We&apos;ll start delivering{" "}
              <b>{ok.quantity} {service.category}</b> to your{" "}
              {service.platform} in the next 30 minutes. Your order
              reference is <b className="font-mono">{ok.orderRef}</b> —
              save it in case you need to contact support.
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-emerald-500/20 mt-2">
              Trials are strictly one per person. If you need more, our
              paid quantities start at $0.10.
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Your email
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                autoFocus
                className="h-11 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                We&apos;ll email your order confirmation. No spam.
              </div>
            </label>
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {targetLabel(service)}
              </div>
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder={targetPlaceholder(service)}
                required
                className="h-11 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </label>

            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                {err}
              </div>
            )}

            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] text-foreground/80 leading-relaxed">
              ⚠️ One free trial per person, ever. We check IP address,
              email, and handle — trying to claim twice with different
              details won&apos;t work.
            </div>

            <button
              type="submit"
              disabled={busy || !email || !targetUrl}
              className={cn(
                "w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-primary/20",
                busy || !email || !targetUrl
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-gradient-ig text-white hover:brightness-110",
              )}
            >
              {busy ? "Claiming…" : `Claim ${trialQty} free`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function targetLabel(svc: Service): string {
  if (svc.category === "followers") return `${cap(svc.platform)} profile URL or @handle`;
  if (svc.category === "story_views") return "Instagram profile @handle";
  if (svc.category === "live") return `${cap(svc.platform)} live stream URL`;
  if (svc.category === "watch_hours") return "YouTube video URL";
  return `${cap(svc.platform)} post / video URL`;
}
function targetPlaceholder(svc: Service): string {
  if (svc.platform === "instagram" && svc.category === "followers") return "https://instagram.com/username";
  if (svc.platform === "instagram") return "https://instagram.com/p/POSTID";
  if (svc.platform === "tiktok" && svc.category === "followers") return "https://tiktok.com/@username";
  if (svc.platform === "tiktok") return "https://tiktok.com/@username/video/1234";
  if (svc.platform === "youtube") return "https://youtube.com/watch?v=XXXX";
  if (svc.platform === "facebook") return "https://facebook.com/pagename";
  return "https://…";
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
