"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/web/lib/cn";

// Form to create a new user from the admin panel. Two modes:
//   - Password: admin sets the password directly (owner comps a friend)
//   - Magic link: admin creates the account, user gets an email to set
//     their own password (softer onboarding for pilot customers)
//
// Optional: seed starter wallet credits so a comped user has something
// to spend immediately.

interface Props { seg: string }

export function CreateUserForm({ seg }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"password" | "invite">("password");
  const [password, setPassword] = useState("");
  const [seedCredits, setSeedCredits] = useState("");
  const [seedNote, setSeedNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    email: string;
    password?: string;
    userId: string;
    creditsGiven?: number;
  } | null>(null);

  const submit = async () => {
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("Enter a valid email");
      return;
    }
    if (mode === "password" && password.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim() || undefined,
          mode,
          password: mode === "password" ? password : undefined,
          seed_credits: seedCredits ? parseInt(seedCredits, 10) : undefined,
          seed_note: seedNote.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Create failed");
      } else {
        setResult({
          email: email.trim(),
          password: mode === "password" ? password : undefined,
          userId: body.user_id,
          creditsGiven: body.credits_given,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-6 space-y-4">
        <div className="text-emerald-600 dark:text-emerald-500 font-semibold">
          ✅ User created
        </div>
        <div className="text-sm space-y-2">
          <KV k="Email" v={result.email} />
          {result.password && <KV k="Password" v={result.password} mono />}
          <KV k="User ID" v={result.userId} mono />
          {result.creditsGiven ? <KV k="Wallet credits" v={`${result.creditsGiven.toLocaleString()} given`} /> : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {result.password
            ? "Share the credentials manually — we don't email them for you when you set the password directly."
            : "An invite email was sent — the user picks their own password via the link."}
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.push(`/admin/users/${result.userId}?seg=${seg}`)}
            className="text-sm px-4 py-2 rounded-lg bg-foreground text-background font-semibold hover:opacity-90"
          >
            Open user →
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null); setEmail(""); setFullName(""); setPassword(""); setSeedCredits(""); setSeedNote("");
            }}
            className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted"
          >
            Create another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5 space-y-4">
      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alice@company.com"
          className={inputCls}
          autoFocus
        />
      </Field>
      <Field label="Full name (optional)">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Alice Smith"
          className={inputCls}
        />
      </Field>

      <Field label="How to onboard">
        <div className="flex gap-2">
          <ModeButton active={mode === "password"} onClick={() => setMode("password")} label="Set password" hint="You choose it now" />
          <ModeButton active={mode === "invite"} onClick={() => setMode("invite")} label="Email invite" hint="They set their own via link" />
        </div>
      </Field>

      {mode === "password" && (
        <Field label="Password" hint="Min 8 chars. Share this manually with the user.">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="strong-random-password"
            className={cn(inputCls, "font-mono")}
          />
        </Field>
      )}

      <div className="border-t border-border/60 pt-4 space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Optional: seed wallet credits
        </div>
        <Field label="Credits to give">
          <input
            type="text"
            inputMode="numeric"
            value={seedCredits}
            onChange={(e) => setSeedCredits(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="0"
            className={cn(inputCls, "tabular-nums")}
          />
        </Field>
        <Field label="Note (shows in wallet history)">
          <input
            type="text"
            value={seedNote}
            onChange={(e) => setSeedNote(e.target.value)}
            placeholder="Comp / Pilot / etc."
            className={inputCls}
          />
        </Field>
      </div>

      {err && <div className="text-xs text-destructive">{err}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !email}
        className={cn(
          "w-full h-11 rounded-lg text-sm font-semibold transition-all",
          submitting || !email
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-gradient-ig text-white hover:brightness-110 shadow-md shadow-primary/20",
        )}
      >
        {submitting ? "Creating…" : "Create user"}
      </button>
    </div>
  );
}

const inputCls = "h-11 w-full rounded-lg border border-input bg-background/80 px-3 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </label>
  );
}

function ModeButton({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 text-left rounded-lg border p-3 transition-colors",
        active ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/30",
      )}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
    </button>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 pb-1">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("font-medium text-right break-all", mono && "font-mono")}>{v}</span>
    </div>
  );
}
