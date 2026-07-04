import { NextResponse } from "next/server";
import { DEFAULT_USER_ID, getSynapse } from "@/lib/synapse";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const { orchestrator } = getSynapse();
  const metrics = await orchestrator.metricsFor(DEFAULT_USER_ID);
  return NextResponse.json({ metrics });
}
