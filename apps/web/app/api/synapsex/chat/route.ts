import { NextResponse } from "next/server";
import { DEFAULT_USER_ID, getSynapse } from "@/lib/synapse";

export const runtime = "nodejs";

interface Body {
  sessionId?: string;
  message?: string;
  athleteName?: string;
  coachName?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as Body;
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "message is required" } },
      { status: 400 },
    );
  }
  const { synapsex } = getSynapse();
  let sessionId = body.sessionId;
  let opening: string | null = null;
  if (!sessionId || !synapsex.hasSession(sessionId)) {
    const started = synapsex.startIntake({
      userId: DEFAULT_USER_ID,
      athleteName: body.athleteName,
      coachName: body.coachName,
    });
    sessionId = started.sessionId;
    opening = started.opening;
  }
  const result = await synapsex.handleMessage(sessionId, message);
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: result.error.message } },
      { status: 500 },
    );
  }
  return NextResponse.json({
    sessionId,
    opening,
    reply: result.value,
  });
}
