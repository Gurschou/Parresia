import { compareAnalyses } from "@bm/core";
import { getAnalysisRecords } from "@/server/dashboard";
import { HttpError, withUser } from "@/server/http";

/** GET /api/compare?ids=a,b[,c,d] — side-om-side-sammenligning af 2-4 færdige analyser. */
export const GET = withUser(async (req, user) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length < 2 || ids.length > 4) throw new HttpError(422, "invalid_ids", "Angiv 2-4 analyse-id'er.");
  const records = await getAnalysisRecords(user.id, { ids });
  if (records.length !== new Set(ids).size) throw new HttpError(404, "not_found", "En eller flere analyser findes ikke eller er ikke færdige.");
  return Response.json(compareAnalyses(ids.map((id) => records.find((r) => r.id === id)!)));
});
