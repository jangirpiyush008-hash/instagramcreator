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
  // Node built-ins that some server-only code transitively touches
  // (e.g. face-analyzer-aws.ts imports 'node:crypto' for SigV4). The
  // tool registry is imported by client components for metadata, which
  // drags the full server-side tool tree into the client dependency
  // graph. This fallback tells webpack to substitute an empty stub for
  // `node:*` in browser bundles — the actual code that uses these
  // modules never runs in the browser, so no runtime error.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
        os: false,
        path: false,
      };
    }
    return config;
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
