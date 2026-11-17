import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @bm/core eksporterer TypeScript-kilde direkte.
  transpilePackages: ["@bm/core"],
  // Native/WASM-tunge pakker skal ikke bundles af Turbopack.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer", "postgres"],
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  // Lokale data (PGlite-database, uploads) må aldrig ende i et deploy-output.
  outputFileTracingExcludes: { "*": ["./data/**/*", "./test/**/*", "./e2e/**/*"] },
  turbopack: {
    // Uploads, PGlite-mappe, ffmpeg-arbejdsmapper og PDF-skrifttyper slås op
    // ved runtime (konfigureret via env). Det er bevidst, så advarslen om
    // dynamisk filadgang undertrykkes for netop disse server-moduler.
    ignoreIssue: [
      { path: /(server\/uploads|db\/index|media\/index|transcription\/(index|providers)|report\/pdf)\.tsx?$/, title: /Dynamic filesystem access/ },
    ],
  },
};

export default nextConfig;
