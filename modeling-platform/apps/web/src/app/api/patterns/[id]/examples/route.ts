import { withUser } from "@/server/http";
import { addPatternExample, removePatternExample } from "@/server/patterns";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/patterns/:id/examples — tilføj et eksempel { analysisId, excerpt } til et mønster. */
export const POST = withUser<Ctx>(async (req, user, ctx) =>
  Response.json(await addPatternExample(user.id, (await ctx.params).id, await req.json()), { status: 201 }),
);

/** DELETE /api/patterns/:id/examples?exampleId= */
export const DELETE = withUser<Ctx>(async (req, user, ctx) => {
  const exampleId = new URL(req.url).searchParams.get("exampleId") ?? "";
  await removePatternExample(user.id, (await ctx.params).id, exampleId);
  return new Response(null, { status: 204 });
});
