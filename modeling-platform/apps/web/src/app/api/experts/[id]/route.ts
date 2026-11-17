import { deleteExpert, getExpert, updateExpert } from "@/server/experts";
import { withUser } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser<Ctx>(async (_req, user, ctx) => Response.json(await getExpert(user.id, (await ctx.params).id)));

export const PATCH = withUser<Ctx>(async (req, user, ctx) =>
  Response.json(await updateExpert(user.id, (await ctx.params).id, await req.json())),
);

/** Sletter eksperten; tilknyttede analyser bevares (ekspert-feltet nulstilles). */
export const DELETE = withUser<Ctx>(async (_req, user, ctx) => {
  await deleteExpert(user.id, (await ctx.params).id);
  return new Response(null, { status: 204 });
});
