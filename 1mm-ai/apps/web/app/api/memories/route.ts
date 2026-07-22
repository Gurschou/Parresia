import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getAIProvider } from "@1mm/ai";
import { getDb, memories } from "@1mm/database";
import { createMemorySchema } from "@1mm/shared";
import { parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/memories – all active memories for the current user. */
export const GET = withErrorHandling("/api/memories", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);

  const db = getDb();
  const rows = await db
    .select({
      id: memories.id,
      category: memories.category,
      content: memories.content,
      importanceScore: memories.importanceScore,
      confidenceScore: memories.confidenceScore,
      sourceConversationId: memories.sourceConversationId,
      createdAt: memories.createdAt,
      updatedAt: memories.updatedAt,
      expiresAt: memories.expiresAt,
    })
    .from(memories)
    .where(and(eq(memories.userId, user.id), isNull(memories.deletedAt)))
    .orderBy(desc(memories.updatedAt));

  return NextResponse.json({ memories: rows });
});

/** POST /api/memories – user manually adds a memory. */
export const POST = withErrorHandling("/api/memories", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);

  const input = await parseBody(request, createMemorySchema);
  const db = getDb();
  const provider = getAIProvider();
  const [embedding] = await provider.embed([input.content]);

  const [memory] = await db
    .insert(memories)
    .values({
      userId: user.id,
      category: input.category,
      content: input.content,
      embedding: embedding ?? null,
      importanceScore: "0.80",
      confidenceScore: "1.00",
    })
    .returning({
      id: memories.id,
      category: memories.category,
      content: memories.content,
      createdAt: memories.createdAt,
    });

  return NextResponse.json({ memory }, { status: 201 });
});

/** DELETE /api/memories – "forget everything" (soft delete). */
export const DELETE = withErrorHandling("/api/memories", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);

  const db = getDb();
  await db
    .update(memories)
    .set({ deletedAt: new Date() })
    .where(and(eq(memories.userId, user.id), isNull(memories.deletedAt)));

  return NextResponse.json({ ok: true });
});
