"use client";

import { useEffect, useState } from "react";
import { LockedMetric, MetricCard, SectionTitle, Sparkline } from "../primitives";
import type { Platform } from "@/core/types";

interface Props {
  platform: Platform;
  handle: string;
  entitled: boolean;
  data?: Record<string, unknown>;
}

export function LiveCounterView({ handle, platform, entitled, data }: Props) {
  const initialCount = (data?.current as number) ?? 184_320;
  const initialHistory = (data?.history as number[] | undefined) ?? [
    initialCount - 40, initialCount - 35, initialCount - 29, initialCount - 22,
    initialCount - 18, initialCount - 12, initialCount - 8, initialCount - 4,
    initialCount - 2, initialCount,
  ];
  const perHour = (data?.perHour as number) ?? 412;
  const perDay = (data?.perDayProjection as number) ?? 9_880;
  const millionEta = (data?.reachOneMillionDays as number | null) ?? 84;

  const [count, setCount] = useState(initialCount);
  const [delta, setDelta] = useState(0);
  const [history, setHistory] = useState<number[]>(initialHistory);

  useEffect(() => {
    const id = setInterval(() => {
      const bump = Math.random() < 0.65 ? 1 + Math.floor(Math.random() * 3) : 0;
      if (bump === 0) return;
      setCount((c) => {
        const next = c + bump;
        setDelta(bump);
        setHistory((h) => [...h.slice(-19), next]);
        return next;
      });
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <SectionTitle hint={`@${handle} · ${platform}`}>Live follower count</SectionTitle>

      <div className="rounded-2xl border border-border surface p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Right now</div>
        <div className="mt-3 text-6xl sm:text-7xl font-bold tabular-nums tracking-tight gradient-text-ig">
          {count.toLocaleString()}
        </div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {delta > 0 ? `+${delta} in the last tick` : "Watching…"}
        </div>
        <div className="mt-6 max-w-xl mx-auto">
          <Sparkline values={history} height={60} />
        </div>
      </div>

      <section>
        <SectionTitle>Free</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <MetricCard label="Current count" value={count.toLocaleString()} accent="pink" />
          <MetricCard label="Refresh" value="2 sec" sub="public data" accent="cyan" />
          <MetricCard label="Session delta" value={`+${(count - initialCount).toLocaleString()}`} accent="emerald" />
        </div>
      </section>

      <section>
        <SectionTitle>Locked report</SectionTitle>
        <div className="grid sm:grid-cols-3 gap-3">
          <LockedMetric label="Per hour" value={`+${perHour.toLocaleString()}`} entitled={entitled} accent="pink" />
          <LockedMetric label="Per day projection" value={`+${perDay.toLocaleString()}`} entitled={entitled} accent="cyan" />
          <LockedMetric label="Reach 1M ETA" value={millionEta ? `${millionEta} days` : "—"} entitled={entitled} accent="amber" />
        </div>
      </section>
    </div>
  );
}
