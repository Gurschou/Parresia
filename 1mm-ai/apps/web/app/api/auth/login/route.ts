import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, users } from "@1mm/database";
import { loginSchema } from "@1mm/shared";
import { parseBody, withErrorHandling } from "@/lib/api";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling("/api/auth/login", async (request: NextRequest) => {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);

  const input = await parseBody(request, loginSchema);
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.email, input.email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  // Same error for unknown email and wrong password (no user enumeration).
  const invalid = NextResponse.json(
    { error: { message: "Forkert e-mail eller adgangskode." } },
    { status: 401 },
  );
  if (!user) return invalid;
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) return invalid;

  const token = await createSessionToken(user.id);
  const response = NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
    token,
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
});
