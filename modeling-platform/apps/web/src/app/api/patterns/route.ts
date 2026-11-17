import { withUser } from "@/server/http";
import { createPattern, listPatterns } from "@/server/patterns";

/** GET /api/patterns?category= — det kuraterede mønsterbibliotek med eksempler. */
export const GET = withUser(async (req, user) => {
  const category = new URL(req.url).searchParams.get("category");
  const items = await listPatterns(user.id);
  return Response.json({ items: category ? items.filter((p) => p.category === category) : items });
});

/** POST /api/patterns — { title, category, description?, tags?, examples?: [{ analysisId, excerpt }] } */
export const POST = withUser(async (req, user) => Response.json(await createPattern(user.id, await req.json()), { status: 201 }));
