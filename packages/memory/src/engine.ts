/**
 * Memory Engine — the single entry point for remembering and recalling.
 *
 * Responsibilities:
 *  - remember(): store a record in the right layer, publish memory.stored.
 *  - recall(): hybrid-ranked retrieval (see recall.ts) with access
 *    reinforcement — recalled memories become easier to recall again.
 *  - buildContext(): format the most relevant memories as quiet context for
 *    a model prompt.
 *  - extractFromConversation(): use a fast model to distill durable
 *    memories (goals, values, beliefs, commitments, breakthroughs) from a
 *    finished session.
 */
import {
  newId,
  nowIso,
  ok,
  type EventBus,
  type MemoryKind,
  type MemoryLayer,
  type MemoryQuery,
  type MemoryRecord,
  type Message,
  type Result,
  type ScoredMemory,
} from "@synapse/shared";
import { parseModelJson, type ModelRouter } from "@synapse/ai";
import type { MemoryStore } from "./store.js";
import { rankMemories } from "./recall.js";

export interface RememberInput {
  userId: string;
  layer: MemoryLayer;
  kind: MemoryKind;
  content: string;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface ExtractedMemory {
  kind: MemoryKind;
  content: string;
  importance?: number;
  tags?: string[];
}

const EXTRACTABLE_KINDS: MemoryKind[] = [
  "fact",
  "goal",
  "value",
  "belief",
  "habit",
  "commitment",
  "breakthrough",
  "preference",
];

export class MemoryEngine {
  constructor(
    private readonly store: MemoryStore,
    private readonly events?: EventBus,
  ) {}

  async remember(input: RememberInput): Promise<MemoryRecord> {
    const record: MemoryRecord = {
      id: newId("mem"),
      userId: input.userId,
      layer: input.layer,
      kind: input.kind,
      content: input.content,
      importance: input.importance ?? 0.5,
      createdAt: nowIso(),
      lastAccessedAt: nowIso(),
      accessCount: 0,
      metadata: input.metadata,
      tags: input.tags ?? [],
    };
    await this.store.insert(record);
    await this.events?.publish("memory.stored", {
      userId: input.userId,
      record,
    });
    return record;
  }

  async recall(query: MemoryQuery): Promise<ScoredMemory[]> {
    const candidates = await this.store.find(query);
    const ranked = rankMemories(candidates, {
      queryText: query.text,
      limit: query.limit ?? 10,
    });
    // Reinforcement: recalled memories strengthen.
    for (const { record } of ranked) {
      record.accessCount += 1;
      record.lastAccessedAt = nowIso();
      await this.store.update(record);
    }
    return ranked;
  }

  /** Format relevant memories as quiet prompt context. */
  async buildContext(userId: string, topic?: string): Promise<string> {
    const [identity, relevant] = await Promise.all([
      this.recall({ userId, layers: ["identity"], limit: 12 }),
      topic
        ? this.recall({
            userId,
            layers: ["long-term", "short-term", "learning"],
            text: topic,
            limit: 8,
          })
        : Promise.resolve([] as ScoredMemory[]),
    ]);
    if (identity.length === 0 && relevant.length === 0) {
      return "Ingen tidligere hukommelse — det her er første session.";
    }
    const section = (title: string, items: ScoredMemory[]) =>
      items.length === 0
        ? ""
        : `${title}:\n${items
            .map(({ record }) => `- [${record.kind}] ${record.content}`)
            .join("\n")}`;
    return [
      "HUKOMMELSE OM BRUGEREN (brug stille og præcist, citér aldrig som arkiv):",
      section("Identitet", identity),
      section("Relevant kontekst", relevant),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  /**
   * Distill durable memories from a finished conversation using a fast
   * model. Extraction failures are non-fatal: better to store nothing than
   * to store wrong data.
   */
  async extractFromConversation(
    userId: string,
    messages: Message[],
    router: ModelRouter,
  ): Promise<Result<MemoryRecord[]>> {
    if (messages.length === 0) return ok([]);
    const transcript = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    const completion = await router.complete({
      task: "memory-extraction",
      json: true,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Du er SYNAPSEs hukommelses-modul. Læs samtalen og returnér KUN gyldig JSON: " +
            '{"memories": [{"kind": "fact|goal|value|belief|habit|commitment|breakthrough|preference", ' +
            '"content": "…", "importance": 0.0-1.0, "tags": ["…"]}]}. ' +
            "Medtag kun det, der faktisk fremgik af samtalen. Skriv content i brugerens sprog.",
        },
        { role: "user", content: transcript },
      ],
    });
    if (!completion.ok) return completion;
    const parsed = parseModelJson<{ memories?: ExtractedMemory[] }>(
      completion.value.content,
    );
    if (!parsed.ok) return parsed;
    const stored: MemoryRecord[] = [];
    for (const memory of parsed.value.memories ?? []) {
      if (!memory?.content || !EXTRACTABLE_KINDS.includes(memory.kind)) {
        continue;
      }
      stored.push(
        await this.remember({
          userId,
          layer: memory.kind === "fact" ? "long-term" : "identity",
          kind: memory.kind,
          content: memory.content,
          importance: clamp01(memory.importance ?? 0.6),
          tags: memory.tags ?? [],
        }),
      );
    }
    return ok(stored);
  }
}

const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1);
