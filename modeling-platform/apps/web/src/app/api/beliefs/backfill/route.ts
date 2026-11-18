import { withUser } from "@/server/http";
import { backfillBeliefMatches } from "@/server/jobs";

/** POST /api/beliefs/backfill — match alle færdige analyser, der ikke er matchet endnu. */
export const POST = withUser(async (_req, user) => Response.json({ queued: await backfillBeliefMatches(user.id) }, { status: 202 }));
