import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@1mm/shared", "@1mm/ai", "@1mm/database", "@1mm/ui"],
  // Native/server-only deps must not be bundled by webpack/turbopack.
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
};

export default nextConfig;
