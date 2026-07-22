import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, users } from "@1mm/database";
import { registerSchema } from "@1mm/shared";
import { parseBody, withErrorHandling } from "@/lib/api";
import { createSessionToken, hashPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling("/api/auth/register", async (request: NextRequest) => {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);

  const input = await parseBody(request, registerSchema);
  const db = getDb();

  const email = input.email.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: { message: "Der findes allerede en konto med denne e-mail." } },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, displayName: input.displayName ?? null })
    .returning({ id: users.id, email: users.email, displayName: users.displayName });

  if (!user) {
    return NextResponse.json(
      { error: { message: "Kontoen kunne ikke oprettes." } },
      { status: 500 },
    );
  }

  logger.info("user_registered", { userId: user.id });

  const token = await createSessionToken(user.id);
  const response = NextResponse.json({ user, token }, { status: 201 });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
});
