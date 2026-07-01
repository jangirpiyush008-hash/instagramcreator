// Builds a URL to /api/proxy/media that streams a remote media asset through
// our origin. Needed because tiktokcdn / cdninstagram return 403 on direct
// browser fetch (hotlink protection).
//
// Pass `filename` + `download=true` to get a Content-Disposition attachment
// header — clicking the link forces a "Save as…" instead of navigating.

export function proxyMediaUrl(
  raw: string | undefined | null,
  opts?: { filename?: string; download?: boolean },
): string | undefined {
  if (!raw) return undefined;
  const qs = new URLSearchParams({ url: raw });
  if (opts?.filename) qs.set("filename", opts.filename);
  if (opts?.download) qs.set("download", "1");
  return `/api/proxy/media?${qs.toString()}`;
}
