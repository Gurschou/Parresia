import { retryAnalysis } from "@/server/analyses";
import { withUser } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/analyses/:id/retry — kør en fejlet analyse igen. */
export const POST = withUser<Ctx>(async (_req, user, ctx) => {
  const { id } = await ctx.params;
  await retryAnalysis(user.id, id);
  return Response.json({ id, status: "queued" }, { status: 202 });
});
