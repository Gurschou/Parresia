/**
 * Bygger artifact-udgaven til ÉN selvstændig HTML-fil (dist/parresia-modeling.html),
 * klar til at blive udgivet som Claude Artifact:
 *   1. tjekker eksempel-analyserne mod schemaet (og at citater er ordrette)
 *   2. kompilerer Tailwind 4 (kun klasser brugt i src/)
 *   3. bundler src/main.tsx med esbuild (React 18 fra cdnjs som globals)
 *   4. skriver siden efter artifact-kontrakten (ingen doctype/html/head/body)
 *
 *   pnpm --filter @bm/artifact build   [--dev  = uminificeret]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { checkExamples } from "./check-examples";
import { reactGlobals } from "./react-shim";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const dev = process.argv.includes("--dev");
mkdirSync(dist, { recursive: true });

// 1. Eksempler
const problems = checkExamples();
if (problems.length) {
  console.error("✗ Eksempel-analyserne er ugyldige:\n  " + problems.join("\n  "));
  process.exit(1);
}

// 2. CSS
const require = createRequire(import.meta.url);
const twCli = join(dirname(require.resolve("@tailwindcss/cli/package.json")), "dist", "index.mjs");
const cssOut = join(dist, "styles.css");
execFileSync(process.execPath, [twCli, "-i", join(root, "src/styles.css"), "-o", cssOut, ...(dev ? [] : ["--minify"])], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const css = readFileSync(cssOut, "utf8");

// 3. JS
const result = await build({
  entryPoints: [join(root, "src/main.tsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  minify: !dev,
  write: false,
  jsx: "transform",
  plugins: [reactGlobals],
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": '"production"',
    // pdfkit/fontkit læser import.meta.url ved indlæsning; giv en gyldig URL.
    "import.meta.url": '"https://artifact.invalid/app.js"',
  },
  logLevel: "warning",
});
const js = result.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");

// 4. HTML (artifact-kontrakt: <title> først, ingen doctype/html/head/body)
const html = `<title>Parresia Modeling Studio</title>
<meta name="description" content="Advanced Behavioral Modeling: transskript → kognitive strategier, overbevisninger, værdier, meta-programmer og VAKOG med Claude.">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400..800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>
<script>${js}</script>
`;
const out = join(dist, "parresia-modeling.html");
writeFileSync(out, html);
console.log(`✓ ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB · css ${(css.length / 1024).toFixed(0)} KB · js ${(js.length / 1024).toFixed(0)} KB)`);
