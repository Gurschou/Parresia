import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getAIProvider } from "@1mm/ai";
import { getDb, memories } from "@1mm/database";
import { updateMemorySchema } from "@1mm/shared";
import { ApiError, parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const idSchema = z.uuid();

async function getOwnedMemory(userId: string, rawId: string) {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) throw new ApiError(400, "Ugyldigt memory-id.");
  const db = getDb();
  const [memory] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(
      and(eq(memories.id, parsed.data), eq(memories.userId, userId), isNull(memories.deletedAt)),
    )
    .limit(1);
  if (!memory) throw new ApiError(404, "Denne memory findes ikke.");
  return { db, memoryId: memory.id };
}

/** PATCH /api/memories/:id – edit content or category (re-embeds content). */
export const PATCH = withErrorHandling(
  "/api/memories/[id]",
  async (request: NextRequest, { params }) => {
    const { user } = await requireUser(request);
    checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);
    const { id } = await params;
    const { db, memoryId } = await getOwnedMemory(user.id, id ?? "");
    const input = await parseBody(request, updateMemorySchema);

    let embedding: number[] | undefined;
    if (input.content !== undefined) {
      const provider = getAIProvider();
      [embedding] = await provider.embed([input.content]);
    }

    const [updated] = await db
      .update(memories)
      .set({
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(embedding ? { embedding } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(memories.id, memoryId), eq(memories.userId, user.id)))
      .returning({
        id: memories.id,
        category: memories.category,
        content: memories.content,
        updatedAt: memories.updatedAt,
      });

    return NextResponse.json({ memory: updated });
  },
);

/** DELETE /api/memories/:id – soft delete a single memory. */
export const DELETE = withErrorHandling(
  "/api/memories/[id]",
  async (request: NextRequest, { params }) => {
    const { user } = await requireUser(request);
    checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);
    const { id } = await params;
    const { db, memoryId } = await getOwnedMemory(user.id, id ?? "");

    await db
      .update(memories)
      .set({ deletedAt: new Date() })
      .where(and(eq(memories.id, memoryId), eq(memories.userId, user.id)));

    return NextResponse.json({ ok: true });
  },
);
