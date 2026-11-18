import { withUser } from "@/server/http";
import { getModelingView } from "@/server/modeling";

/** GET /api/modeling?person=<nøgle>&analysis=<id> — personer og det aktuelle modelleringskort. */
export const GET = withUser(async (req, user) => {
  const url = new URL(req.url);
  const view = await getModelingView(user.id, url.searchParams.get("person") ?? undefined, url.searchParams.get("analysis") ?? undefined);
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
});
