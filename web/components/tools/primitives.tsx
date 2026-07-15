"use client";

import { cn } from "@/web/lib/cn";
import { BLURRED_PLACEHOLDER } from "@/core/constants";

// Yellow-tinted disclaimer strip. Used to surface per-tool data caveats
// (e.g. YouTube tools showing that their signals are proxied/estimated
// rather than direct because YouTube Data API doesn't expose the same
// primitives as IG/TT). Keeps disclosures visible without hiding them
// in the fine-print methodology block.
export function CaveatBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 leading-relaxed">
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
        {children}
      </h3>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  accent,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "pink" | "cyan" | "amber" | "emerald" | "red" | "muted";
  className?: string;
}) {
  const accentBar = {
    pink: "bg-gradient-ig",
    cyan: "bg-[hsl(187_95%_50%)]",
    amber: "bg-amber-400",
    emerald: "bg-emerald-400",
    red: "bg-red-500",
    muted: "bg-muted",
  }[accent ?? "muted"];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card/60 p-5",
        className,
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", accentBar)} />
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-3xl font-semibold mt-2 tracking-tight">{value}</div>
      {sub && <div className="text-sm text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function LockedMetric({
  label,
  value,
  sub,
  entitled,
  accent,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  entitled: boolean;
  accent?: "pink" | "cyan" | "amber" | "emerald" | "red" | "muted";
  className?: string;
}) {
  return (
    <MetricCard
      label={label}
      accent={accent}
      className={className}
      value={
        <span className={entitled ? "" : "blur-locked"} aria-hidden={!entitled}>
          {entitled ? value : BLURRED_PLACEHOLDER}
        </span>
      }
      sub={
        sub && (
          <span className={entitled ? "" : "blur-locked"} aria-hidden={!entitled}>
            {entitled ? sub : "••• •••"}
          </span>
        )
      }
    />
  );
}

export function StatusBadge({
  status,
  label,
}: {
  status: "ok" | "warn" | "bad";
  label: string;
}) {
  const cls = {
    ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    bad: "bg-red-500/15 text-red-300 border-red-500/30",
  }[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        cls,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "ok"
            ? "bg-emerald-400"
            : status === "warn"
            ? "bg-amber-400"
            : "bg-red-400",
        )}
      />
      {label}
    </span>
  );
}

export function Avatar({
  name,
  size = 40,
  hueSeed,
}: {
  name: string;
  size?: number;
  hueSeed?: number;
}) {
  const hue = hueSeed ?? hash(name) % 360;
  const initials = name
    .replace(/^@/, "")
    .split(/[\s._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white shrink-0"
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${
          (hue + 60) % 360
        } 85% 50%))`,
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Gauge({
  value,
  max = 10,
  label,
  entitled,
}: {
  value: number;
  max?: number;
  label?: string;
  entitled: boolean;
}) {
  const clamped = Math.min(Math.max(value, 0), max);
  const pct = clamped / max;
  const angle = pct * 180 - 90; // -90 (left) to +90 (right)
  const r = 80;
  const cx = 100;
  const cy = 100;

  // colour ramps: cool → warm
  const color = pct < 0.33 ? "#f87171" : pct < 0.66 ? "#fbbf24" : "#34d399";

  return (
    <div className="relative">
      <svg viewBox="0 0 200 120" className="w-full h-auto max-w-[260px] mx-auto">
        <defs>
          <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          stroke="hsl(240 8% 18%)"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          stroke="url(#gauge-grad)"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${Math.PI * r} ${Math.PI * r}`}
          strokeDashoffset={Math.PI * r * (1 - pct)}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
        <circle cx={cx} cy={cy} r="6" fill={color} />
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(((angle - 90) * Math.PI) / 180) * (r - 8)}
          y2={cy + Math.sin(((angle - 90) * Math.PI) / 180) * (r - 8)}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <div className="text-center -mt-4">
        <div
          className={cn(
            "text-3xl font-semibold tracking-tight tabular-nums",
            entitled ? "" : "blur-locked",
          )}
        >
          {entitled ? `${value.toFixed(2)}%` : "••••"}
        </div>
        {label && (
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        )}
      </div>
    </div>
  );
}

export function Donut({
  segments,
  entitled,
  size = 200,
}: {
  segments: { label: string; pct: number; color: string }[];
  entitled: boolean;
  size?: number;
}) {
  const total = segments.reduce((a, s) => a + s.pct, 0);
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="hsl(240 8% 16%)"
          strokeWidth="18"
          fill="none"
        />
        {segments.map((s, i) => {
          const len = (s.pct / total) * circumference;
          const node = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              stroke={s.color}
              strokeWidth="18"
              fill="none"
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ filter: entitled ? "none" : "blur(7px)" }}
            />
          );
          offset += len;
          return node;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={cn(
          "text-3xl font-semibold tabular-nums",
          entitled ? "" : "blur-locked",
        )}>
          {entitled ? `${Math.round(segments[0]?.pct ?? 0)}%` : "••••"}
        </div>
        <div className="text-xs text-muted-foreground">{segments[0]?.label ?? ""}</div>
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  height = 56,
  className,
  blurred,
}: {
  values: number[];
  height?: number;
  className?: string;
  blurred?: boolean;
}) {
  if (values.length === 0) return null;
  const w = 200;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 6) - 3}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className={cn("w-full", blurred && "blur-locked", className)}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(322 95% 60%)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="hsl(322 95% 60%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${points} ${w},${height}`}
        fill="url(#spark-fill)"
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke="hsl(322 95% 64%)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PreviewBanner({ phase }: { phase: 1 | 2 | 3 }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm flex items-center gap-3">
      <span className="rounded-full bg-amber-400/20 text-amber-300 px-2 py-0.5 text-xs font-medium uppercase tracking-wider">
        Preview · Phase {phase}
      </span>
      <span className="text-muted-foreground">
        Layout shown with sample data — backend wiring ships in Phase {phase}.
      </span>
    </div>
  );
}
