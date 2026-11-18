import { withUser } from "@/server/http";
import { backfillModeling } from "@/server/jobs";

/** POST /api/modeling/backfill — modellér hver person, der endnu ikke har et kort. */
export const POST = withUser(async (_req, user) => Response.json({ queued: await backfillModeling(user.id) }, { status: 202 }));
