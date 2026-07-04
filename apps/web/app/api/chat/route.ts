import { NextResponse } from "next/server";
import { DEFAULT_USER_ID, getSynapse } from "@/lib/synapse";

export const runtime = "nodejs";

interface ChatBody {
  sessionId?: string;
  message?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as ChatBody;
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "message is required" } },
      { status: 400 },
    );
  }
  const { orchestrator } = getSynapse();
  const activeSessionId =
    body.sessionId && orchestrator.hasSession(body.sessionId)
      ? body.sessionId
      : orchestrator.startSession(DEFAULT_USER_ID);

  const result = await orchestrator.handleMessage(activeSessionId, message);
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: result.error.message } },
      { status: 500 },
    );
  }
  const { reply, emotionalState } = result.value;
  return NextResponse.json({
    sessionId: activeSessionId,
    reply: {
      content: reply.content,
      agent: reply.agentId,
      model: reply.model,
      decision: reply.artifacts?.decision ?? null,
    },
    emotion: emotionalState
      ? {
          primaryEmotion: emotionalState.primaryEmotion,
          stress: emotionalState.stress,
          energy: emotionalState.energy,
          clarity: emotionalState.clarity,
        }
      : null,
  });
}
