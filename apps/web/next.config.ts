import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@synapse/shared",
    "@synapse/ai",
    "@synapse/memory",
    "@synapse/intelligence",
    "@synapse/agents",
  ],
  // Workspace packages use NodeNext-style ".js" import specifiers that
  // resolve to ".ts" sources; teach webpack the same mapping.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"],
      ".mjs": [".mjs", ".mts"],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
};

export default nextConfig;
