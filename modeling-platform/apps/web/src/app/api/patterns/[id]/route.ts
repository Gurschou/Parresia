import { withUser } from "@/server/http";
import { deletePattern, updatePattern } from "@/server/patterns";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (req, user, ctx) =>
  Response.json(await updatePattern(user.id, (await ctx.params).id, await req.json())),
);

export const DELETE = withUser<Ctx>(async (_req, user, ctx) => {
  await deletePattern(user.id, (await ctx.params).id);
  return new Response(null, { status: 204 });
});
