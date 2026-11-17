import { getDashboard } from "@/server/dashboard";
import { withUser } from "@/server/http";

/** GET /api/dashboard?projectId=&expertId= — aggregerede mønstre på tværs af analyser. */
export const GET = withUser(async (req, user) => {
  const url = new URL(req.url);
  return Response.json(
    await getDashboard(user.id, {
      projectId: url.searchParams.get("projectId") ?? undefined,
      expertId: url.searchParams.get("expertId") ?? undefined,
    }),
  );
});
