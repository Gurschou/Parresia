import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { conversations, getDb } from "@1mm/database";
import { chatStopSchema } from "@1mm/shared";
import { parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { stopGeneration } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling("/api/chat/stop", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  const input = await parseBody(request, chatStopSchema);

  // Ownership check before touching the stream registry.
  const db = getDb();
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, user.id)))
    .limit(1);
  if (!conversation) {
    return NextResponse.json({ error: { message: "Samtalen findes ikke." } }, { status: 404 });
  }

  const stopped = stopGeneration(input.conversationId);
  return NextResponse.json({ stopped });
});
