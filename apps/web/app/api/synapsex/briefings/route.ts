import { NextResponse } from "next/server";
import { DEFAULT_USER_ID, getSynapse } from "@/lib/synapse";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const { synapsex } = getSynapse();
  const briefings = await synapsex.listBriefings(DEFAULT_USER_ID);
  return NextResponse.json({ briefings });
}
