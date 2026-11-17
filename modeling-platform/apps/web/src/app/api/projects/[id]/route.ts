import { deleteProject } from "@/server/experts";
import { withUser } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withUser<Ctx>(async (_req, user, ctx) => {
  await deleteProject(user.id, (await ctx.params).id);
  return new Response(null, { status: 204 });
});
