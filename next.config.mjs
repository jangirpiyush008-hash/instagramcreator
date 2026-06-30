import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Next ignores any stray package-lock.json
  // in parent directories (e.g. $HOME) when inferring file-tracing root.
  outputFileTracingRoot: path.resolve(),
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
