/** File-backed BriefingRepository for local development persistence. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Briefing } from "@synapse/intelligence";
import type { BriefingRepository } from "@synapse/agents";

export class FileBriefingRepository implements BriefingRepository {
  private readonly path: string;
  private briefings = new Map<string, Briefing>();
  private loaded = false;

  constructor(dataDir: string) {
    this.path = join(dataDir, "briefings.json");
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.path, "utf-8");
      for (const briefing of JSON.parse(raw) as Briefing[]) {
        this.briefings.set(briefing.id, briefing);
      }
    } catch {
      // first run
    }
  }

  async save(briefing: Briefing): Promise<void> {
    await this.load();
    this.briefings.set(briefing.id, briefing);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      JSON.stringify([...this.briefings.values()], null, 2),
      "utf-8",
    );
  }

  async listByUser(userId: string): Promise<Briefing[]> {
    await this.load();
    return [...this.briefings.values()]
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
