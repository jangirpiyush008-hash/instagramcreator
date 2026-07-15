import { NextResponse, type NextRequest } from "next/server";

// Subdomain router. Both decodecreator.com AND admin.decodecreator.com
// point at the same Railway service — we distinguish per-request here.
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
  if (!isAdminHost) return NextResponse.next();

  const url = req.nextUrl.clone();

  // Only rewrite the path once. If someone hits
  // admin.decodecreator.com/admin/users we don't want /admin/admin/users.
  if (url.pathname.startsWith("/admin")) return NextResponse.next();

  // Special-case the API routes so they still work under the subdomain
  // without being nested under /admin. Convention: admin panel calls
  // /api/admin/*, which lives at /api/admin/* on both hosts.
  if (url.pathname.startsWith("/api/")) return NextResponse.next();

  // Rewrite everything else to the /admin subtree.
  //   /              → /admin
  //   /users         → /admin/users
  //   /users/xyz     → /admin/users/xyz
  url.pathname = `/admin${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

// Skip Next.js internals + static files to keep this middleware cheap.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|llms.txt).*)",
  ],
};
