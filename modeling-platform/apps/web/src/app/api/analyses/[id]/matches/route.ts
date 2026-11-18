import { getAnalysisMatches, ownedCompletedAnalysis } from "@/server/belief-matches";
import { withUser } from "@/server/http";
import { enqueueBeliefMatch } from "@/server/jobs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/analyses/:id/matches — status og resultat af analysens overbevisnings-match. */
export const GET = withUser<Ctx>(async (_req, user, ctx) =>
  Response.json(await getAnalysisMatches(user.id, (await ctx.params).id), { headers: { "Cache-Control": "no-store" } }),
);

/** POST /api/analyses/:id/matches — kør matchet igen (fx efter nye analyser i biblioteket). */
export const POST = withUser<Ctx>(async (_req, user, ctx) => {
  const a = await ownedCompletedAnalysis(user.id, (await ctx.params).id);
  void enqueueBeliefMatch(a.id, a.ownerId);
  return Response.json({ status: "pending" }, { status: 202 });
});
