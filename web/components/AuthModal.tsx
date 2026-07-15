"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/web/lib/supabase-browser";

// Global auth modal. Opens whenever the URL carries ?auth=signin or
// ?auth=signup. Any component can trigger it by linking to
// `?auth=signin` — no context provider or event bus needed.
//
// Google OAuth is intentionally kept as a button that redirects out
// (Google's security policy forbids OAuth inside a popup/iframe).
// Email + alphanumeric password flow stays fully in-modal.

type Mode = "signin" | "signup";

const PASSWORD_MIN = 8;
// Alphanumeric only — letters + numbers, no symbols. Also require at
// least one of each so a "12345678" doesn't sneak through.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/;

export function AuthModal() {
  const params = useSearchParams();
  const router = useRouter();
  const modeParam = params.get("auth");
  const mode: Mode | null =
    modeParam === "signin" || modeParam === "signup" ? modeParam : null;

  // Preserve the return-to path when redirecting through Google.
  const nextRaw = params.get("next");
  const next =
    nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/account";

  function close() {
    // Strip only the auth param, keep any other query state (fresh=1, etc).
    const p = new URLSearchParams(params.toString());
    p.delete("auth");
    const qs = p.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname);
  }

  // Escape key + click-outside handled by the overlay onClick + a keydown effect.
  useEffect(() => {
    if (!mode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (!mode) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "signup" ? "Start your free trial" : "Sign in"}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <AuthPanel mode={mode} next={next} onClose={close} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

function AuthPanel({ mode, next, onClose }: { mode: Mode; next: string; onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // e.g. "check your inbox"

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(null);

    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    if (!PASSWORD_RE.test(password)) {
      setError(
        `Password must be at least ${PASSWORD_MIN} characters, letters + numbers only, and include at least one of each.`,
      );
      return;
    }

    setBusy("email");
    try {
      const supabase = supabaseBrowser();
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (err) {
          setError(friendlyAuthError(err.message));
          return;
        }
        // If Supabase is configured to require confirmation, session is null
        // until the user clicks the email link.
        if (!data.session) {
          setPending(
            `We sent a confirmation link to ${email}. Open it in the same browser to activate your account.`,
          );
          return;
        }
        // Auto-confirmed → land straight on account.
        router.push(next);
        router.refresh();
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          setError(friendlyAuthError(err.message));
          return;
        }
        onClose();
        router.push(next);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setError(null);
    setBusy("google");
    try {
      const supabase = supabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (err) setError(friendlyAuthError(err.message));
      // On success this call navigates to Google — no need to reset busy.
    } catch {
      setBusy(null);
    }
  }

  const title = mode === "signup" ? "Start your free trial" : "Welcome back";
  const subtitle =
    mode === "signup"
      ? "5 free scans a day, no card required. 20/mo scans on the free tier once you sign up."
      : "Sign in to your DecodeCreator account.";
  const submitLabel =
    busy === "email" ? "Working…" : mode === "signup" ? "Start Trial" : "Sign in";

  return (
    <div className="p-6 sm:p-8 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground text-xl leading-none"
        >
          ×
        </button>
      </div>

      {pending ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm">
          {pending}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={google}
            disabled={busy !== null}
            className="w-full h-11 rounded-lg border border-border bg-background hover:bg-muted transition text-sm font-medium inline-flex items-center justify-center gap-3 disabled:opacity-60"
          >
            <GoogleG />
            {busy === "google" ? "Redirecting…" : mode === "signup" ? "Sign up with Google" : "Continue with Google"}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Password</span>
              <div className="relative mt-1">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={PASSWORD_MIN}
                  placeholder={mode === "signup" ? "at least 8 chars, letters + numbers" : "your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 rounded-lg border border-border bg-background px-3 pr-16 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
              {mode === "signup" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Alphanumeric only. Letters + numbers, no symbols.
                </p>
              )}
            </label>

            <button
              type="submit"
              disabled={busy !== null}
              className="w-full h-11 rounded-lg bg-gradient-ig text-white text-sm font-medium hover:brightness-110 transition disabled:opacity-60"
            >
              {submitLabel}
            </button>
          </form>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="text-center text-xs text-muted-foreground">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <a
                  href={`?auth=signin${next !== "/account" ? `&next=${encodeURIComponent(next)}` : ""}`}
                  className="text-primary hover:underline"
                >
                  Sign in
                </a>
              </>
            ) : (
              <>
                New to DecodeCreator?{" "}
                <a
                  href={`?auth=signup${next !== "/account" ? `&next=${encodeURIComponent(next)}` : ""}`}
                  className="text-primary hover:underline"
                >
                  Start free trial
                </a>
              </>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            By {mode === "signup" ? "signing up" : "signing in"}, you agree to our{" "}
            <a href="/terms" className="underline hover:text-foreground">Terms</a> and{" "}
            <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
          </p>
        </>
      )}
    </div>
  );
}

// Map Supabase's raw error strings to user-friendly copy.
function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Wrong email or password.";
  if (lower.includes("user already registered")) return "An account with that email already exists — sign in instead.";
  if (lower.includes("email not confirmed")) return "Check your inbox and click the confirmation link before signing in.";
  if (lower.includes("email rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (lower.includes("weak password") || lower.includes("password")) return "Password too weak — 8+ characters, letters + numbers.";
  return raw;
}

function GoogleG() {
  // Google's official "G" mark — inline SVG, brand-accurate colors.
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .5 4.1 1.5l3-2.9C17.2 1.9 14.7 1 12 1 7.4 1 3.4 3.7 1.4 7.6l3.5 2.7C5.9 7.2 8.7 5 12 5z"
      />
      <path
        fill="#34A853"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6l3.6 2.8c2.1-2 3.3-4.9 3.3-8.6z"
      />
      <path
        fill="#FBBC05"
        d="M4.9 14.3c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2L1.4 7.6C.5 9 0 10.4 0 12s.5 3 1.4 4.4l3.5-2.1z"
      />
      <path
        fill="#4285F4"
        d="M12 23c3 0 5.5-1 7.3-2.6l-3.6-2.8c-1 .7-2.3 1.1-3.7 1.1-3.3 0-6.1-2.2-7.1-5.2L1.4 16.4C3.4 20.3 7.4 23 12 23z"
      />
    </svg>
  );
}
