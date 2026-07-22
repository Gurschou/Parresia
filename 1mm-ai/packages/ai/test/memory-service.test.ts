import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "@1mm/database/testing";
import { memories, userPreferences, users, type Database } from "@1mm/database";
import { MockAIProvider } from "../src/provider/mock";
import {
  findRelevantMemories,
  processConversationMemories,
  upsertMemoryCandidates,
} from "../src/memory/service";

const provider = new MockAIProvider();

let db: Database;
let close: () => Promise<void>;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  const rows = await db
    .insert(users)
    .values([
      { email: "memory@example.com", passwordHash: "x" },
      { email: "other-memory@example.com", passwordHash: "x" },
    ])
    .returning({ id: users.id });
  userId = rows[0]!.id;
  otherUserId = rows[1]!.id;
});

afterAll(async () => {
  await close();
});

describe("memory service", () => {
  it("creates new memories and de-duplicates identical ones", async () => {
    const candidate = {
      category: "preference" as const,
      content: "Foretrækker korte svar på dansk",
      importance: 0.8,
      confidence: 0.9,
      sensitive: false,
    };

    const first = await upsertMemoryCandidates(db, provider, {
      userId,
      sourceConversationId: null,
      candidates: [candidate],
    });
    expect(first).toEqual({ created: 1, updated: 0 });

    // Same content again → must update, not duplicate.
    const second = await upsertMemoryCandidates(db, provider, {
      userId,
      sourceConversationId: null,
      candidates: [{ ...candidate, importance: 0.9 }],
    });
    expect(second).toEqual({ created: 0, updated: 1 });

    const rows = await db.select().from(memories).where(eq(memories.userId, userId));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.importanceScore)).toBeCloseTo(0.9);
  });

  it("only returns the owner's memories from retrieval", async () => {
    await upsertMemoryCandidates(db, provider, {
      userId: otherUserId,
      sourceConversationId: null,
      candidates: [
        {
          category: "fact",
          content: "Hemmelig oplysning om en anden bruger",
          importance: 0.9,
          confidence: 0.9,
          sensitive: false,
        },
      ],
    });

    const results = await findRelevantMemories(db, provider, {
      userId,
      query: "Hemmelig oplysning om en anden bruger",
    });
    expect(results.every((r) => !r.content.includes("anden bruger"))).toBe(true);
  });

  it("respects the auto-memory opt-out", async () => {
    await db.insert(userPreferences).values({
      userId,
      key: "autoMemoryEnabled",
      value: false,
    });

    const result = await processConversationMemories(db, provider, {
      userId,
      conversationId: crypto.randomUUID(),
      transcript: "user: husk at jeg hedder Mikkel",
    });
    expect(result).toBeNull();
  });
});
