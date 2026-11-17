import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import type { ReportDocument } from "./blocks";
import { ReportPdf, type PdfFonts } from "./pdf-document";

export { ReportPdf, pdfText } from "./pdf-document";

/**
 * Node-lag for PDF: finder Plus Jakarta Sans + Fraunces (@fontsource) og
 * renderer til en Buffer. Falder tilbage til Helvetica, hvis skrifttyperne
 * ikke findes, så PDF-generering aldrig fejler.
 */

let fontsReady: PdfFonts | null = null;

function findFontFile(pkg: string, file: string): string | null {
  if (process.env.PDF_FONT_DIR) {
    const p = path.join(process.env.PDF_FONT_DIR, file);
    if (existsSync(p)) return p;
  }
  const bases = [path.join(process.cwd(), "package.json"), import.meta.url].filter((b): b is string => typeof b === "string");
  for (const base of bases) {
    try {
      const p = createRequire(base).resolve(`${pkg}/files/${file}`);
      if (existsSync(p)) return p;
    } catch {
      /* prøv næste base */
    }
  }
  return null;
}

export function ensureFonts(): PdfFonts {
  if (fontsReady) return fontsReady;
  const j = (w: number, style = "normal") => findFontFile("@fontsource/plus-jakarta-sans", `plus-jakarta-sans-latin-${w}-${style}.woff`);
  const f = (w: number, style = "normal") => findFontFile("@fontsource/fraunces", `fraunces-latin-${w}-${style}.woff`);
  const sans = [j(400), j(700), j(400, "italic")];
  const serif = [f(600), f(400, "italic")];
  if (sans.every(Boolean) && serif.every(Boolean)) {
    Font.register({
      family: "Jakarta",
      fonts: [
        { src: sans[0]!, fontWeight: 400 },
        { src: sans[1]!, fontWeight: 700 },
        { src: sans[2]!, fontWeight: 400, fontStyle: "italic" },
      ],
    });
    Font.register({
      family: "Fraunces",
      fonts: [
        { src: serif[0]!, fontWeight: 600 },
        { src: serif[1]!, fontWeight: 400, fontStyle: "italic" },
      ],
    });
    fontsReady = { sans: "Jakarta", serif: "Fraunces" };
  } else {
    fontsReady = { sans: "Helvetica", serif: "Times-Roman" };
  }
  return fontsReady;
}

/** Renderer rapporten til en PDF-buffer. */
export async function renderPdf(doc: ReportDocument): Promise<Buffer> {
  // Kaldes som funktion: React-PDF skal have <Document> som rod-element,
  // ellers mister dynamiske tekster (sidetal) deres anden render-runde.
  return renderToBuffer(ReportPdf({ doc, fonts: ensureFonts() }));
}
