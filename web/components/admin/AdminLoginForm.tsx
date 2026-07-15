"use client";

import { useState } from "react";
import { cn } from "@/web/lib/cn";

export function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Login failed");
        setSubmitting(false);
        return;
      }
      // Full reload so the layout auth check re-runs server-side.
      window.location.href = "/admin";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-border bg-card/60 p-5"
    >
      <label className="block">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Admin password
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          className={cn(
            "h-11 w-full rounded-lg border bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 transition-all font-mono",
            error ? "border-destructive" : "border-input",
          )}
        />
      </label>
      {error && <div className="text-xs text-destructive">{error}</div>}
      <button
        type="submit"
        disabled={submitting || password.length === 0}
        className={cn(
          "w-full h-11 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-primary/20",
          submitting || password.length === 0
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-gradient-ig text-white hover:brightness-110",
        )}
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
