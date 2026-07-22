import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { conversations, getDb } from "@1mm/database";
import { createConversationSchema } from "@1mm/shared";
import { parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/conversations – the authenticated user's conversations only. */
export const GET = withErrorHandling("/api/conversations", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);

  const includeArchived = request.nextUrl.searchParams.get("archived") === "1";
  const db = getDb();
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      mode: conversations.mode,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      lastMessageAt: conversations.lastMessageAt,
      archivedAt: conversations.archivedAt,
    })
    .from(conversations)
    .where(
      includeArchived
        ? eq(conversations.userId, user.id)
        : and(eq(conversations.userId, user.id), isNull(conversations.archivedAt)),
    )
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
    .limit(200);

  return NextResponse.json({ conversations: rows });
});

/** POST /api/conversations – create an empty conversation. */
export const POST = withErrorHandling("/api/conversations", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);

  const input = await parseBody(request, createConversationSchema);
  const db = getDb();
  const [conversation] = await db
    .insert(conversations)
    .values({ userId: user.id, title: input.title ?? null, mode: input.mode })
    .returning();

  return NextResponse.json({ conversation }, { status: 201 });
});
