"use client";

import { useState } from "react";
import { Button } from "@/web/components/ui/Button";
import { Input } from "@/web/components/ui/Input";
import { supabaseBrowser } from "@/web/lib/supabase-browser";

// Supabase's Redirect URL allowlist does strict URL matching — query params
// like ?next=/account cause Supabase to reject the redirect and silently fall
// back to Site URL (home page). We keep the URL clean here and let the
// callback route always send authed users to /account. Deep-link "return to
// where you came from" can be added later via a cookie.
//
// `mode` only changes button/copy — the underlying Supabase flow is identical
// for signin vs signup (magic-link OR Google auto-creates users on first
// login and just signs them in on subsequent ones).
export function LoginForm({
  next: _next,
  mode = "signin",
}: {
  next: string;
  mode?: "signin" | "signup";
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "submitting" });
    const supabase = supabaseBrowser();
    const siteUrl = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });
    if (error) {
      setState({ kind: "error", message: error.message });
      return;
    }
    setState({ kind: "sent" });
  }

  async function google() {
    const supabase = supabaseBrowser();
    const siteUrl = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) setState({ kind: "error", message: error.message });
  }

  if (state.kind === "sent") {
    return (
      <div className="rounded-lg border border-border p-5 text-sm">
        {mode === "signup" ? "Confirmation link" : "Magic link"} sent to{" "}
        <span className="font-medium">{email}</span>. Open it from the same
        browser to finish {mode === "signup" ? "creating your account" : "signing in"}.
      </div>
    );
  }

  const submitLabel =
    state.kind === "submitting"
      ? "Sending…"
      : mode === "signup"
      ? "Create account with email"
      : "Send magic link";

  const googleLabel =
    mode === "signup" ? "Sign up with Google" : "Continue with Google";

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={state.kind === "submitting"}
      >
        {submitLabel}
      </Button>
      <div className="text-center text-xs text-muted-foreground">or</div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={google}
      >
        {googleLabel}
      </Button>
      {state.kind === "error" && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
