import { ownedCompletedAnalysis } from "@/server/belief-matches";
import { withUser } from "@/server/http";
import { enqueueModeling } from "@/server/jobs";
import { getAnalysisModeling } from "@/server/modeling";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/analyses/:id/model — status og indhold af analysens modelleringskort. */
export const GET = withUser<Ctx>(async (_req, user, ctx) =>
  Response.json(await getAnalysisModeling(user.id, (await ctx.params).id), { headers: { "Cache-Control": "no-store" } }),
);

/** POST /api/analyses/:id/model — modellér personen igen ud fra alle samtalerne. */
export const POST = withUser<Ctx>(async (_req, user, ctx) => {
  const a = await ownedCompletedAnalysis(user.id, (await ctx.params).id);
  void enqueueModeling(a.id, a.ownerId);
  return Response.json({ status: "pending" }, { status: 202 });
});
