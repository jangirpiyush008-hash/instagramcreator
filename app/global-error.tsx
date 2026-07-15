"use client";

import { useEffect } from "react";

// Root-layout error boundary. Only fires when the root layout itself
// throws — meaning we can't rely on any of the layout's HTML/CSS being
// in the DOM. Next.js requires us to render our own <html> + <body>.
// Kept extremely minimal (inline styles, no dependencies) so this
// boundary itself can't throw.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error]", error, "digest:", error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#0a0a12",
          color: "#e5e5e5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 480, width: "100%" }}>
          <div
            style={{
              border: "1px solid rgba(239, 68, 68, 0.35)",
              background: "rgba(239, 68, 68, 0.06)",
              padding: "1.5rem",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgba(239, 68, 68, 0.8)",
                marginBottom: 8,
              }}
            >
              DecodeCreator — critical error
            </div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 600,
                margin: "0 0 12px 0",
              }}
            >
              The app couldn&apos;t start
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#a3a3a3" }}>
              Something went wrong loading the page. Please try again — if
              this keeps happening, email us the reference below.
            </p>
            {error.message ? (
              <pre
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#a3a3a3",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {error.message}
                {error.digest ? `\n\ndigest: ${error.digest}` : ""}
              </pre>
            ) : null}
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: "#fafafa",
                  color: "#0a0a12",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <a
                href="mailto:support.decodecreator@gmail.com"
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fafafa",
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Email support
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
