// Hash an IP for anon rate-limit keying. Stable per-day, not reversible.
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// Extract the caller's real IP. Header priority is deliberate: platform-
// set headers first (Railway, Vercel, Cloudflare), then a right-most-hop
// parse of X-Forwarded-For as a last resort, then a fixed sentinel.
//
// Why the order matters:
// A client can send ANY value in X-Forwarded-For / X-Real-IP — nothing
// stops it. The naïve "grab X-Forwarded-For[0]" pattern lets an attacker
// mint an unlimited number of anon rate-limit buckets by rotating the
// header value. Railway proxies APPEND the real IP to X-Forwarded-For,
// so the RIGHT-MOST entry is trustworthy, not the left-most.
//
// Railway sets `x-envoy-external-address` to the real edge IP —
// use that when present. Vercel sets `x-vercel-forwarded-for`. Both
// are stamped by the platform's own proxy and cannot be spoofed by the
// upstream client.
export function getClientIp(headers: Headers): string {
  // 1. Platform-set headers (trusted — client can't set these)
  const railway = headers.get("x-envoy-external-address");
  if (railway) return railway.trim();

  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();

  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  // 2. X-Real-IP — usually set by nginx-style proxies AFTER stripping
  //    any client-supplied value. Trusted second-tier.
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // 3. X-Forwarded-For fallback — take the RIGHT-MOST entry (last proxy
  //    hop before us). Reverse-proxies APPEND to XFF; the real edge IP
  //    is at the end of the chain, not the beginning. Any client-supplied
  //    values sit at the LEFT (their fake header, then our proxy's real
  //    IP appended) — so right-most is safe from spoofing.
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]!;
  }

  // 4. Nothing usable. Return a stable sentinel — better than throwing;
  //    the caller will bucket all unheadered requests together, which
  //    at least caps global anon usage.
  return "0.0.0.0";
}
