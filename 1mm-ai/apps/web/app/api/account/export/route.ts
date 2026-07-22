import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import {
  conversations,
  getDb,
  memories,
  messages,
  usageEvents,
  userPreferences,
} from "@1mm/database";
import { requireUser, withErrorHandling } from "@/lib/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/account/export – full JSON export of the user's own data (GDPR). */
export const GET = withErrorHandling("/api/account/export", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);
  const db = getDb();

  const [conversationRows, messageRows, memoryRows, preferenceRows, usageRows] =
    await Promise.all([
      db.select().from(conversations).where(eq(conversations.userId, user.id)),
      db.select().from(messages).where(eq(messages.userId, user.id)),
      db
        .select({
          id: memories.id,
          category: memories.category,
          content: memories.content,
          importanceScore: memories.importanceScore,
          confidenceScore: memories.confidenceScore,
          createdAt: memories.createdAt,
          updatedAt: memories.updatedAt,
        })
        .from(memories)
        .where(and(eq(memories.userId, user.id), isNull(memories.deletedAt))),
      db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)),
      db.select().from(usageEvents).where(eq(usageEvents.userId, user.id)),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    },
    conversations: conversationRows,
    messages: messageRows,
    memories: memoryRows,
    preferences: preferenceRows,
    usage: usageRows,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="1mm-ai-export.json"',
    },
  });
});
