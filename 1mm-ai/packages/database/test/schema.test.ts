import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "../src/testing";
import {
  conversations,
  memories,
  messages,
  usageEvents,
  userPreferences,
  users,
} from "../src/schema";
import type { Database } from "../src/client";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(async () => {
  await close();
});

describe("schema & migrations", () => {
  it("applies migrations and inserts a full object graph", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "graph@example.com", passwordHash: "hash" })
      .returning();
    const [conversation] = await db
      .insert(conversations)
      .values({ userId: user!.id, title: "Test", mode: "text" })
      .returning();
    await db.insert(messages).values({
      conversationId: conversation!.id,
      userId: user!.id,
      role: "user",
      content: "hej",
      messageType: "text",
      status: "completed",
    });
    await db.insert(memories).values({
      userId: user!.id,
      sourceConversationId: conversation!.id,
      category: "fact",
      content: "test memory",
    });
    await db.insert(userPreferences).values({ userId: user!.id, key: "k", value: { a: 1 } });
    await db.insert(usageEvents).values({
      userId: user!.id,
      conversationId: conversation!.id,
      eventType: "chat.completed",
      model: "test-model",
      inputUnits: 10,
      outputUnits: 20,
    });

    const rows = await db.select().from(messages).where(eq(messages.userId, user!.id));
    expect(rows).toHaveLength(1);
  });

  it("enforces unique emails", async () => {
    await db.insert(users).values({ email: "unique@example.com", passwordHash: "x" });
    await expect(
      db.insert(users).values({ email: "unique@example.com", passwordHash: "y" }),
    ).rejects.toThrow();
  });

  it("deletes all user data via cascading foreign keys (GDPR delete)", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "delete-me@example.com", passwordHash: "x" })
      .returning();
    const [conversation] = await db
      .insert(conversations)
      .values({ userId: user!.id })
      .returning();
    await db.insert(messages).values({
      conversationId: conversation!.id,
      userId: user!.id,
      role: "user",
      content: "slet mig",
    });
    await db.insert(memories).values({ userId: user!.id, category: "other", content: "m" });

    await db.delete(users).where(eq(users.id, user!.id));

    expect(await db.select().from(conversations).where(eq(conversations.userId, user!.id))).toEqual(
      [],
    );
    expect(await db.select().from(messages).where(eq(messages.userId, user!.id))).toEqual([]);
    expect(await db.select().from(memories).where(eq(memories.userId, user!.id))).toEqual([]);
  });

  it("blocks duplicate messages with the same idempotency key", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "idem@example.com", passwordHash: "x" })
      .returning();
    const [conversation] = await db
      .insert(conversations)
      .values({ userId: user!.id })
      .returning();

    const key = crypto.randomUUID();
    const base = {
      conversationId: conversation!.id,
      userId: user!.id,
      role: "user" as const,
      content: "dobbeltklik",
      idempotencyKey: key,
    };
    await db.insert(messages).values(base);
    await expect(db.insert(messages).values(base)).rejects.toThrow();
  });
});
