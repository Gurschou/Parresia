/** File-backed PatternRepository for local development persistence. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DetectedPattern } from "@synapse/shared";
import type { PatternRepository } from "@synapse/intelligence";

export class FilePatternRepository implements PatternRepository {
  private readonly path: string;
  private patterns = new Map<string, DetectedPattern>();
  private loaded = false;

  constructor(dataDir: string) {
    this.path = join(dataDir, "patterns.json");
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.path, "utf-8");
      for (const pattern of JSON.parse(raw) as DetectedPattern[]) {
        this.patterns.set(pattern.id, pattern);
      }
    } catch {
      // first run
    }
  }

  async listByUser(userId: string): Promise<DetectedPattern[]> {
    await this.load();
    return [...this.patterns.values()].filter((p) => p.userId === userId);
  }

  async save(pattern: DetectedPattern): Promise<void> {
    await this.load();
    this.patterns.set(pattern.id, pattern);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      JSON.stringify([...this.patterns.values()], null, 2),
      "utf-8",
    );
  }
}
