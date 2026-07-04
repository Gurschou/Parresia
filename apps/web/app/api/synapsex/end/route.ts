import { NextResponse } from "next/server";
import { getSynapse } from "@/lib/synapse";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
  };
  if (!body.sessionId) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "sessionId is required" } },
      { status: 400 },
    );
  }
  const { synapsex } = getSynapse();
  const result = await synapsex.endIntake(body.sessionId);
  if (!result.ok) {
    const status =
      result.error.name === "NotFoundError"
        ? 404
        : result.error.name === "ValidationError"
          ? 400
          : 500;
    return NextResponse.json(
      { error: { code: "INTERNAL", message: result.error.message } },
      { status },
    );
  }
  return NextResponse.json({ briefing: result.value });
}
