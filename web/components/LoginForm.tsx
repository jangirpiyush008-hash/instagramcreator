"use client";

import { useState } from "react";
import { Button } from "@/web/components/ui/Button";
import { Input } from "@/web/components/ui/Input";
import { supabaseBrowser } from "@/web/lib/supabase-browser";

export function LoginForm({ next }: { next: string }) {
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
        emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
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
      options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setState({ kind: "error", message: error.message });
  }

  if (state.kind === "sent") {
    return (
      <div className="rounded-lg border border-border p-5 text-sm">
        Magic link sent to <span className="font-medium">{email}</span>. Open it
        from the same browser.
      </div>
    );
  }

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
        {state.kind === "submitting" ? "Sending…" : "Send magic link"}
      </Button>
      <div className="text-center text-xs text-muted-foreground">or</div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={google}
      >
        Continue with Google
      </Button>
      {state.kind === "error" && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
