import { NextResponse } from "next/server";
import { DEFAULT_USER_ID, getSynapse } from "@/lib/synapse";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const { patterns } = getSynapse();
  const list = await patterns.listByUser(DEFAULT_USER_ID);
  return NextResponse.json({
    patterns: list.sort((a, b) => b.confidence - a.confidence),
  });
}
