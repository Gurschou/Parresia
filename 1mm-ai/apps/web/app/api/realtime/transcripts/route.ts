import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getUserPreference } from "@1mm/ai";
import { conversations, getDb, messages } from "@1mm/database";
import { saveTranscriptSchema } from "@1mm/shared";
import { ApiError, parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/realtime/transcripts
 * Persists a finished voice-turn transcript as a message. Raw audio is never
 * stored; transcripts are stored only while the user's preference allows it.
 */
export const POST = withErrorHandling("/api/realtime/transcripts", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);

  const input = await parseBody(request, saveTranscriptSchema);
  const db = getDb();

  const allowed = await getUserPreference(db, user.id, "saveVoiceTranscripts", true);
  if (!allowed) {
    return NextResponse.json({ saved: false, reason: "transcripts-disabled" });
  }

  const [conversation] = await db
    .select({ id: conversations.id, mode: conversations.mode })
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, user.id)))
    .limit(1);
  if (!conversation) throw new ApiError(404, "Samtalen findes ikke.");

  const [message] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      userId: user.id,
      role: input.role,
      content: input.content,
      messageType: "transcript",
      status: "completed",
    })
    .returning({ id: messages.id, createdAt: messages.createdAt });

  const now = new Date();
  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      updatedAt: now,
      // A text conversation that gains voice turns becomes "mixed".
      mode: conversation.mode === "text" ? "mixed" : conversation.mode,
    })
    .where(and(eq(conversations.id, conversation.id), eq(conversations.userId, user.id)));

  return NextResponse.json({ saved: true, message }, { status: 201 });
});
