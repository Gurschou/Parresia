import { getAnalysis } from "@/server/analyses";
import { withUser } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/analyses/:id/status — let polling-endpoint til fremdrift. */
export const GET = withUser<Ctx>(async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const a = await getAnalysis(user.id, id);
  return Response.json(
    {
      id: a.id,
      status: a.status,
      progress: a.progress,
      stageMessage: a.stageMessage,
      errorCode: a.errorCode,
      errorMessage: a.errorMessage,
      updatedAt: a.updatedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
