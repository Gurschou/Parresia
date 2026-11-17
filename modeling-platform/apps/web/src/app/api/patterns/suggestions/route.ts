import { withUser } from "@/server/http";
import { getPatternSuggestions } from "@/server/patterns";

/** GET /api/patterns/suggestions?projectId=&minExperts= — automatisk fundne fælles mønstre. */
export const GET = withUser(async (req, user) => {
  const url = new URL(req.url);
  const min = Number(url.searchParams.get("minExperts") ?? 2);
  const items = await getPatternSuggestions(user.id, {
    projectId: url.searchParams.get("projectId") ?? undefined,
    minExperts: Number.isFinite(min) && min >= 1 ? min : 2,
  });
  return Response.json({ items });
});
