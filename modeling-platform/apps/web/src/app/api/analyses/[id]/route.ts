import { deleteAnalysis, getAnalysis, updateAnalysis } from "@/server/analyses";
import { withUser } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/analyses/:id — fuld analyse inkl. transskript, resultat og metadata. */
export const GET = withUser<Ctx>(async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const a = await getAnalysis(user.id, id);
  const { uploadPath: _omit, ...publicFields } = a;
  return Response.json(publicFields);
});

/** PATCH /api/analyses/:id — omdøb eller tilknyt ekspert/projekt/sessionsdato. */
export const PATCH = withUser<Ctx>(async (req, user, ctx) => {
  const { id } = await ctx.params;
  const a = await updateAnalysis(user.id, id, await req.json());
  return Response.json({ id: a.id, title: a.title, expertId: a.expertId, projectId: a.projectId, sessionDate: a.sessionDate });
});

/** DELETE /api/analyses/:id */
export const DELETE = withUser<Ctx>(async (_req, user, ctx) => {
  const { id } = await ctx.params;
  await deleteAnalysis(user.id, id);
  return new Response(null, { status: 204 });
});
