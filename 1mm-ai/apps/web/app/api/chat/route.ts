import type { NextRequest } from "next/server";
import { getAIProvider } from "@1mm/ai";
import { getDb } from "@1mm/database";
import { chatRequestSchema, toSseFrame } from "@1mm/shared";
import { parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { runChatTurn } from "@/lib/chat-service";
import { logger } from "@/lib/logger";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat – streams the assistant's answer as server-sent events.
 * The generator in chat-service owns all persistence; this handler is pure
 * transport.
 */
export const POST = withErrorHandling("/api/chat", async (request: NextRequest) => {
  const { user, requestId } = await requireUser(request);
  checkRateLimit(`chat:${user.id}`, RATE_LIMITS.chat);

  const input = await parseBody(request, chatRequestSchema);
  const db = getDb();
  const provider = getAIProvider();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runChatTurn({
          db,
          provider,
          userId: user.id,
          displayName: user.displayName,
          conversationId: input.conversationId,
          message: input.message,
          idempotencyKey: input.idempotencyKey,
          clientSignal: request.signal,
          requestId,
        })) {
          controller.enqueue(encoder.encode(toSseFrame(event)));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        logger.error("chat_stream_crashed", {
          requestId,
          userId: user.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        controller.enqueue(
          encoder.encode(
            toSseFrame({
              type: "error",
              message: "Der opstod en serverfejl under streaming.",
              retryable: true,
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Request-Id": requestId,
    },
  });
});
