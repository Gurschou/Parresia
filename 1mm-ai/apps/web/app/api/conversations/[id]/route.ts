import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { conversations, getDb, messages } from "@1mm/database";
import { updateConversationSchema } from "@1mm/shared";
import { ApiError, parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const idSchema = z.uuid();

async function getOwnedConversation(userId: string, rawId: string) {
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) throw new ApiError(400, "Ugyldigt samtale-id.");
  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, parsed.data), eq(conversations.userId, userId)))
    .limit(1);
  if (!conversation) throw new ApiError(404, "Samtalen findes ikke.");
  return { db, conversation };
}

/** GET /api/conversations/:id – conversation + all its messages. */
export const GET = withErrorHandling(
  "/api/conversations/[id]",
  async (request: NextRequest, { params }) => {
    const { user } = await requireUser(request);
    checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);
    const { id } = await params;
    const { db, conversation } = await getOwnedConversation(user.id, id ?? "");

    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        messageType: messages.messageType,
        status: messages.status,
        metadata: messages.metadata,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, user.id)))
      .orderBy(asc(messages.createdAt));

    return NextResponse.json({ conversation, messages: rows });
  },
);

/** PATCH /api/conversations/:id – rename or archive/unarchive. */
export const PATCH = withErrorHandling(
  "/api/conversations/[id]",
  async (request: NextRequest, { params }) => {
    const { user } = await requireUser(request);
    checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);
    const { id } = await params;
    const { db, conversation } = await getOwnedConversation(user.id, id ?? "");
    const input = await parseBody(request, updateConversationSchema);

    const [updated] = await db
      .update(conversations)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.archived !== undefined
          ? { archivedAt: input.archived ? new Date() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, conversation.id), eq(conversations.userId, user.id)))
      .returning();

    return NextResponse.json({ conversation: updated });
  },
);

/** DELETE /api/conversations/:id – permanent delete (messages cascade). */
export const DELETE = withErrorHandling(
  "/api/conversations/[id]",
  async (request: NextRequest, { params }) => {
    const { user } = await requireUser(request);
    checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);
    const { id } = await params;
    const { db, conversation } = await getOwnedConversation(user.id, id ?? "");

    await db
      .delete(conversations)
      .where(and(eq(conversations.id, conversation.id), eq(conversations.userId, user.id)));

    return NextResponse.json({ ok: true });
  },
);
