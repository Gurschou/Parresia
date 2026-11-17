import os from "node:os";
import path from "node:path";

/**
 * Rodmappe for lokale data (PGlite-database og uploads).
 *
 * Ligger som standard UDEN FOR projektet (~/.parresia-modeling): PGlite
 * skriver filer ved hver forespørgsel, og en mappe inde i projektet får
 * Next' dev-watcher til at genkompilere og genindlæse siden i en løkke.
 * Overstyr med DATA_DIR (fx /data i Docker).
 */
export function dataDir(): string {
  return expandHome(process.env.DATA_DIR || path.join(os.homedir(), ".parresia-modeling"));
}

/** Udvider "~" (dotenv gør det ikke) og gør stien absolut. */
export function expandHome(p: string): string {
  return path.resolve(p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p);
}
