import { getBeliefMatchView } from "@/server/belief-matches";
import { withUser } from "@/server/http";

/** GET /api/beliefs?person=<personKey> — overbevisnings-match for én person + overblik over alle. */
export const GET = withUser(async (req, user) => {
  const person = new URL(req.url).searchParams.get("person") ?? undefined;
  return Response.json(await getBeliefMatchView(user.id, person), { headers: { "Cache-Control": "no-store" } });
});
