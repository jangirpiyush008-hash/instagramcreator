// Normalize a target URL or @handle down to a bare lowercase handle.
// Used by the trial system so IG "@mkbhd", "instagram.com/mkbhd/",
// "https://instagram.com/mkbhd?igsh=xyz" all resolve to the same
// "mkbhd" and count as the same claim.
//
// Also strips protocol, www, trailing slashes, and query params.

export function normalizeHandle(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // Bare @handle form: "@mkbhd"
  if (s.startsWith("@")) {
    const h = s.slice(1).replace(/[/?#].*$/, "");
    return h.length >= 1 ? h : null;
  }

  // URL forms. Try to parse as URL.
  let url: URL;
  try {
    url = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    // Not a URL — treat whole string as a handle after stripping
    // non-handle characters.
    const h = s.replace(/[^a-z0-9._-]/g, "");
    return h.length >= 1 ? h : null;
  }

  // Path is usually /handle or /@handle or /handle/status/... etc.
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  // First path segment, minus optional @.
  const first = parts[0]!.replace(/^@/, "");
  const cleaned = first.replace(/[^a-z0-9._-]/g, "");
  return cleaned.length >= 1 ? cleaned : null;
}

// Rough platform inference from URL — used as a hint, not authoritative.
// The service the user picked already carries the platform on it.
export function guessPlatform(input: string): string | null {
  const s = input.toLowerCase();
  if (s.includes("instagram")) return "instagram";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube") || s.includes("youtu.be")) return "youtube";
  if (s.includes("facebook") || s.includes("fb.com")) return "facebook";
  return null;
}
