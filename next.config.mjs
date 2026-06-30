import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework version to attackers.
  poweredByHeader: false,
  // Pin the workspace root so Next ignores any stray package-lock.json
  // in parent directories (e.g. $HOME) when inferring file-tracing root.
  outputFileTracingRoot: path.resolve(),
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Force HTTPS for 2 years, include subdomains, preload list eligible.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // MIME sniff protection.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Clickjacking protection — block all framing.
          { key: "X-Frame-Options", value: "DENY" },
          // Limit referer leakage.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restrict powerful browser APIs we don't use.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
