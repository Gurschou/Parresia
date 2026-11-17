import { ANALYSIS_STATUSES } from "@/db/schema";
import { createAnalysis, listAnalyses } from "@/server/analyses";
import { withUser } from "@/server/http";

/** GET /api/analyses?expertId=&projectId=&status= — liste over brugerens analyser. */
export const GET = withUser(async (req, user) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const items = await listAnalyses(user.id, {
    expertId: url.searchParams.get("expertId") ?? undefined,
    projectId: url.searchParams.get("projectId") ?? undefined,
    status: ANALYSIS_STATUSES.find((s) => s === status),
  });
  return Response.json({ items });
});

/**
 * POST /api/analyses — opret og start en analyse.
 * Body (JSON): { transcript | uploadId, title?, expertId?, projectId?, sessionDate?, context? }
 * Svarer 202 med analysen; fremdrift kan polles på /api/analyses/:id/status.
 */
export const POST = withUser(async (req, user) => {
  const body = await req.json();
  const analysis = await createAnalysis(user.id, body);
  return Response.json(
    { id: analysis.id, status: analysis.status, title: analysis.title },
    { status: 202, headers: { Location: `/api/analyses/${analysis.id}` } },
  );
});
