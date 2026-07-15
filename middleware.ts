import { NextResponse, type NextRequest } from "next/server";

// Subdomain router + admin-context marker. Both decodecreator.com AND
// admin.decodecreator.com point at the same Railway service — we
// distinguish per-request here and set an `x-dc-is-admin` request
// header the root layout reads to decide whether to render the
// marketing chrome (nav + footer + cookie banner).
//
// Rules:
//   host = admin.decodecreator.com  → rewrite to /admin/* (owner panel)
//   host = anything else            → pass through untouched
//
// Rewrite ≠ redirect: the URL bar shows the admin subdomain, but Next
// serves the /admin/* route tree. Users never see the internal path.
//
// The /admin route tree stays reachable on the main domain too during
// dev (localhost:3000/admin) — makes local iteration painless. In prod
// we can hide it via a check here if needed; today it's unnecessary
// because /admin/* enforces its own session-cookie auth anyway.

const ADMIN_HOST_SUFFIX = "admin.";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const isAdminHost = host.startsWith(ADMIN_HOST_SUFFIX);
  const isAdminPath = req.nextUrl.pathname.startsWith("/admin");
  const isAdminContext = isAdminHost || isAdminPath;

  // Build a mutated request-header set that includes x-dc-is-admin.
  // Server components read this via headers() in the root layout to
  // decide whether to render the marketing chrome. RESPONSE headers
  // wouldn't work — only REQUEST headers forwarded via NextResponse
  // are visible to the server-side rendering pass.
  const forwardHeaders = new Headers(req.headers);
  if (isAdminContext) forwardHeaders.set("x-dc-is-admin", "1");
  const opts = { request: { headers: forwardHeaders } };

  if (!isAdminHost) return NextResponse.next(opts);

  const url = req.nextUrl.clone();

  // Only rewrite the path once. If someone hits
  // admin.decodecreator.com/admin/users we don't want /admin/admin/users.
  if (url.pathname.startsWith("/admin")) return NextResponse.next(opts);

  // Special-case the API routes so they still work under the subdomain
  // without being nested under /admin. Convention: admin panel calls
  // /api/admin/*, which lives at /api/admin/* on both hosts.
  if (url.pathname.startsWith("/api/")) return NextResponse.next(opts);

  // Rewrite everything else to the /admin subtree.
  //   /              → /admin
  //   /users         → /admin/users
  //   /users/xyz     → /admin/users/xyz
  url.pathname = `/admin${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url, opts);
}

// Skip Next.js internals + static files to keep this middleware cheap.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|llms.txt).*)",
  ],
};
