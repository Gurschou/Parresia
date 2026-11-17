import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @bm/core eksporterer TypeScript-kilde direkte.
  transpilePackages: ["@bm/core"],
  // Native/WASM-tunge pakker skal ikke bundles af Turbopack.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer", "postgres"],
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
};

export default nextConfig;
