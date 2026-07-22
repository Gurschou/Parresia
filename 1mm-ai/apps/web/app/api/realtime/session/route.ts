import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  buildSystemInstructions,
  findRelevantMemories,
  getAIProvider,
  VOICE_INSTRUCTION_SUFFIX,
} from "@1mm/ai";
import { conversations, getDb } from "@1mm/database";
import { realtimeSessionRequestSchema } from "@1mm/shared";
import { ApiError, parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { logger } from "@/lib/logger";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/realtime/session
 *
 * Mints a SHORT-LIVED Realtime client secret for the authenticated user.
 * The normal OPENAI_API_KEY never leaves this server – only the ephemeral
 * `ek_…` value is returned, and only to a logged-in, rate-limited user.
 * The assistant instructions are attached server-side so the client cannot
 * manipulate them.
 */
export const POST = withErrorHandling("/api/realtime/session", async (request: NextRequest) => {
  const { user, requestId } = await requireUser(request);
  checkRateLimit(`realtime:${user.id}`, RATE_LIMITS.realtimeSession);

  const input = await parseBody(request, realtimeSessionRequestSchema);
  const db = getDb();
  const provider = getAIProvider();

  // Optional conversation context (must belong to the user).
  let summary: string | null = null;
  if (input.conversationId) {
    const [conversation] = await db
      .select({ summary: conversations.summary })
      .from(conversations)
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, user.id)))
      .limit(1);
    if (!conversation) throw new ApiError(404, "Samtalen findes ikke.");
    summary = conversation.summary;
  }

  let memories: { category: string; content: string }[] = [];
  try {
    memories = await findRelevantMemories(db, provider, {
      userId: user.id,
      query: "stemmesamtale kontekst præferencer",
      limit: 5,
    });
  } catch {
    // Voice must work even if memory retrieval hiccups.
  }

  const instructions =
    buildSystemInstructions({
      displayName: user.displayName,
      memories: memories.map((m) => ({ category: m.category as never, content: m.content })),
      conversationSummary: summary,
    }) + VOICE_INSTRUCTION_SUFFIX;

  // Pseudonymous abuse identifier – never the raw user id or email.
  const safetyIdentifier = createHash("sha256").update(user.id).digest("hex").slice(0, 32);

  const secret = await provider.createRealtimeClientSecret({
    instructions,
    safetyIdentifier,
    transcribeInput: true,
  });

  logger.info("realtime_session_created", { requestId, userId: user.id, model: secret.model });

  return NextResponse.json({
    clientSecret: secret.value,
    expiresAt: secret.expiresAt,
    model: secret.model,
  });
});
