import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Минимальный self-contained сервер в .next/standalone — под Docker/Dokploy.
  output: "standalone",
  // Expose the single USE_MOCK flag to the client bundle under the same literal
  // name, so src/lib/mock/config.ts reads it identically on server and client.
  env: {
    USE_MOCK: process.env.USE_MOCK ?? "",
  },
};

export default nextConfig;
