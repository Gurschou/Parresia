import { errorResponse, jsonError } from "@/server/http";
import { RegisterSchema, UserExistsError, createUser } from "@/server/users";

/** POST /api/register — opret bruger (e-mail + adgangskode). */
export async function POST(req: Request) {
  try {
    const input = RegisterSchema.parse(await req.json());
    const user = await createUser(input);
    return Response.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof UserExistsError) return jsonError(409, "user_exists", err.message);
    return errorResponse(err);
  }
}
