import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, users } from "@1mm/database";
import { requireUser, withErrorHandling } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/account – permanently deletes the user and ALL related data.
 * Conversations, messages, memories, preferences and usage events are removed
 * by cascading foreign keys.
 */
export const DELETE = withErrorHandling("/api/account", async (request: NextRequest) => {
  const { user, requestId } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);

  const db = getDb();
  await db.delete(users).where(eq(users.id, user.id));

  logger.info("account_deleted", { requestId, userId: user.id });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
});
