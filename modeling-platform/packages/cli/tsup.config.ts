import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  // @bm/core er TypeScript-kilde i workspacet → bundles ind; tredjepartspakker forbliver eksterne.
  noExternal: ["@bm/core"],
  banner: { js: "#!/usr/bin/env node" },
});
