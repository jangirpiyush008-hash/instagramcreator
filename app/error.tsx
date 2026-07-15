"use client";

import { useEffect } from "react";

// Route-scoped error boundary. Next.js renders this whenever a client
// component in the App Router throws during render or an event handler.
// Without it the user sees Next's default "Application error: a
// client-side exception has occurred" screen — no reset button, no
// context, no support path.

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console with as much detail as we have —
    // the digest is what Next.js stamps on the server-side log so
    // support can correlate a user report with a server trace.
    console.error("[app/error]", error, "digest:", error.digest);
  }, [error]);

  return (
    <div className="container max-w-2xl py-16">
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 space-y-4">
        <div className="text-xs uppercase tracking-wider text-destructive/80">
          Something broke
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          The page hit an unexpected error
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is on us. Please try again — if it keeps happening, email us
          the error reference below and we&apos;ll dig in.
        </p>
        {error.message && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Technical details
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-muted-foreground">
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          </details>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={reset}
            className="text-sm px-4 py-2 rounded-md bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <a
            href="/"
            className="text-sm px-4 py-2 rounded-md border border-border hover:bg-muted transition-colors"
          >
            Go home
          </a>
          <a
            href={`mailto:support.decodecreator@gmail.com?subject=Error report${
              error.digest ? ` (${error.digest})` : ""
            }`}
            className="text-sm px-4 py-2 rounded-md border border-border hover:bg-muted transition-colors"
          >
            Email support
          </a>
        </div>
      </div>
    </div>
  );
}
