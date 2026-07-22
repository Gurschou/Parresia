import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { consent } from "../../schema/profile.js";

/**
 * Consent service. All biometric and self-reported data is treated as
 * health data (GDPR art. 9): explicit consent per data CATEGORY per PURPOSE,
 * versioned and timestamped. Never a single boolean.
 *
 * The consent table is append-only: recording a decision inserts a row, and
 * the newest row per (user, category, purpose) is the current state. This
 * preserves the demonstrability requirement of art. 7(1) — we can always
 * show what the user had consented to at any point in time.
 */

export type ConsentCategory =
  | "biometric"
  | "training"
  | "self_report"
  | "protocol"
  | "derived_pattern";

export type ConsentPurpose =
  | "personalization"
  | "cold_start_similarity"
  | "product_improvement"
  | "export";

/** Which consent category governs a given event_type. */
export function categoryForEventType(eventType: string): ConsentCategory {
  if (eventType.startsWith("biometric.")) return "biometric";
  if (eventType.startsWith("workout.")) return "training";
  if (eventType.startsWith("state.")) return "self_report";
  if (eventType.startsWith("protocol.")) return "protocol";
  throw new Error(`no consent category mapped for event_type "${eventType}"`);
}

export async function recordConsent(params: {
  userId: string;
  dataCategory: ConsentCategory;
  purpose: ConsentPurpose;
  granted: boolean;
  policyVersion: string;
}): Promise<void> {
  await db.insert(consent).values(params);
}

/** Current state = newest decision for (user, category, purpose). */
export async function hasConsent(
  userId: string,
  dataCategory: ConsentCategory,
  purpose: ConsentPurpose,
): Promise<boolean> {
  const rows = await db
    .select({ granted: consent.granted })
    .from(consent)
    .where(
      and(
        eq(consent.userId, userId),
        eq(consent.dataCategory, dataCategory),
        eq(consent.purpose, purpose),
      ),
    )
    .orderBy(desc(consent.decidedAt))
    .limit(1);
  return rows[0]?.granted ?? false;
}

/** Full current consent matrix for a user (for the twin snapshot / export). */
export async function getConsentState(
  userId: string,
): Promise<
  Array<{
    dataCategory: ConsentCategory;
    purpose: ConsentPurpose;
    granted: boolean;
    policyVersion: string;
    decidedAt: Date;
  }>
> {
  const rows = await db
    .select()
    .from(consent)
    .where(eq(consent.userId, userId))
    .orderBy(desc(consent.decidedAt));

  const seen = new Set<string>();
  const current: Array<{
    dataCategory: ConsentCategory;
    purpose: ConsentPurpose;
    granted: boolean;
    policyVersion: string;
    decidedAt: Date;
  }> = [];
  for (const row of rows) {
    const key = `${row.dataCategory}:${row.purpose}`;
    if (seen.has(key)) continue;
    seen.add(key);
    current.push({
      dataCategory: row.dataCategory,
      purpose: row.purpose,
      granted: row.granted,
      policyVersion: row.policyVersion,
      decidedAt: row.decidedAt,
    });
  }
  return current;
}
