"use client";

import type { WalletLot } from "@/core/billing/wallet";

// Prominent balance card for /developer. Shows total credits available,
// how many are expiring in the next 30 days (nudge to use them), and
// (below) the underlying lot history so users can see each purchase.

interface Props {
  credits: number;
  lots: WalletLot[];
}

export function WalletBalanceCard({ credits, lots }: Props) {
  const now = Date.now();
  const in30Days = now + 30 * 24 * 60 * 60 * 1000;
  const expiringSoon = lots
    .filter((l) => {
      const t = new Date(l.expiresAt).getTime();
      return t > now && t < in30Days;
    })
    .reduce((s, l) => s + l.creditsRemaining, 0);

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-foreground/70 font-semibold">
            Wallet balance
          </div>
          <div className="text-4xl sm:text-5xl font-bold tabular-nums mt-2 gradient-text-ig">
            {credits.toLocaleString("en-IN")}
          </div>
          <div className="text-sm text-foreground/70 mt-1">
            credits available
          </div>
          {expiringSoon > 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-3 font-medium">
              ⚠ {expiringSoon.toLocaleString("en-IN")} credits expiring in the next 30 days
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-foreground/60">
            Credits deduct from subscription first, wallet second
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lot history table ───────────────────────────────────────────────────
// Renders each purchase (or refund / promo grant) with the amount
// consumed vs remaining and the exact expiry date. Purely informational —
// no actions here; top-ups go through the WalletPacks component.
export function WalletHistory({ lots }: { lots: WalletLot[] }) {
  if (lots.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-6 text-sm text-foreground/70">
        No wallet activity yet. Buy your first pack above to start using credits.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-foreground/60 border-b border-border">
            <th className="text-left px-4 py-3">Purchased</th>
            <th className="text-left px-4 py-3">Source</th>
            <th className="text-right px-4 py-3">Granted</th>
            <th className="text-right px-4 py-3">Remaining</th>
            <th className="text-right px-4 py-3">Expires</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => {
            const expiresDate = new Date(l.expiresAt);
            const daysLeft = Math.max(
              0,
              Math.round((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            );
            const almostGone = daysLeft <= 30;
            return (
              <tr key={l.id} className="border-b border-border/50 last:border-b-0">
                <td className="px-4 py-2 text-xs text-foreground/70">
                  {new Date(l.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-xs">{sourceLabel(l.source)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {l.creditsGranted.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {l.creditsRemaining.toLocaleString("en-IN")}
                </td>
                <td
                  className={
                    "px-4 py-2 text-right text-xs " +
                    (almostGone ? "text-amber-600 dark:text-amber-400 font-medium" : "text-foreground/60")
                  }
                >
                  {expiresDate.toLocaleDateString()}
                  <span className="block text-[10px]">
                    ({daysLeft} day{daysLeft === 1 ? "" : "s"} left)
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Human-readable label for the source field. Free-text so we can add
// new source types without a mapping migration.
function sourceLabel(source: string): string {
  if (source.startsWith("topup:topup-")) {
    const pack = source.slice("topup:topup-".length);
    return `Pack — $${pack}`;
  }
  if (source === "topup:custom") return "Custom recharge";
  if (source.startsWith("promo:")) return `Promo — ${source.slice("promo:".length)}`;
  if (source.startsWith("refund:")) return `Refund — ${source.slice("refund:".length)}`;
  return source;
}
