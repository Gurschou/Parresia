import { createExpert, listExperts } from "@/server/experts";
import { withUser } from "@/server/http";

/** GET /api/experts — brugerens modeller/eksperter med antal analyser. */
export const GET = withUser(async (_req, user) => Response.json({ items: await listExperts(user.id) }));

/** POST /api/experts — opret en model/ekspert { name, role?, description?, projectId? }. */
export const POST = withUser(async (req, user) => Response.json(await createExpert(user.id, await req.json()), { status: 201 }));
