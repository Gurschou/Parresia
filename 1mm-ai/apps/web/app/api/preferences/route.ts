import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getUserPreference } from "@1mm/ai";
import { getDb, userPreferences, users } from "@1mm/database";
import { updatePreferencesSchema } from "@1mm/shared";
import { parseBody, requireUser, withErrorHandling } from "@/lib/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/preferences – effective preferences with defaults. */
export const GET = withErrorHandling("/api/preferences", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);
  const db = getDb();

  const [autoMemoryEnabled, saveVoiceTranscripts] = await Promise.all([
    getUserPreference(db, user.id, "autoMemoryEnabled", true),
    getUserPreference(db, user.id, "saveVoiceTranscripts", true),
  ]);

  return NextResponse.json({
    preferences: { autoMemoryEnabled, saveVoiceTranscripts, displayName: user.displayName },
  });
});

async function upsertPreference(userId: string, key: string, value: unknown): Promise<void> {
  const db = getDb();
  await db
    .insert(userPreferences)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value, updatedAt: sql`now()` },
    });
}

/** PATCH /api/preferences – update settings (and display name). */
export const PATCH = withErrorHandling("/api/preferences", async (request: NextRequest) => {
  const { user } = await requireUser(request);
  checkRateLimit(`std:${user.id}`, RATE_LIMITS.standard);
  const input = await parseBody(request, updatePreferencesSchema);
  const db = getDb();

  if (input.autoMemoryEnabled !== undefined) {
    await upsertPreference(user.id, "autoMemoryEnabled", input.autoMemoryEnabled);
  }
  if (input.saveVoiceTranscripts !== undefined) {
    await upsertPreference(user.id, "saveVoiceTranscripts", input.saveVoiceTranscripts);
  }
  if (input.displayName !== undefined) {
    await db
      .update(users)
      .set({ displayName: input.displayName, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  return NextResponse.json({ ok: true });
});
