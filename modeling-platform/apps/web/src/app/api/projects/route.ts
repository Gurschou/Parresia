import { createProject, listProjects } from "@/server/experts";
import { withUser } from "@/server/http";

export const GET = withUser(async (_req, user) => Response.json({ items: await listProjects(user.id) }));

export const POST = withUser(async (req, user) => Response.json(await createProject(user.id, await req.json()), { status: 201 }));
