import { eq, isNull, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { appUser } from "../../schema/profile.js";
import { event } from "../../schema/events.js";
import { pattern } from "../../schema/patterns.js";
import { intervention } from "../../schema/ledger.js";

/**
 * GDPR art. 17 erasure — one transaction, per store:
 *
 *  PROFILE STORE   hard delete. `DELETE FROM app_user` cascades to
 *                  user_identity (the PII), consent, baseline, disciplines,
 *                  thresholds, goals, preferences.
 *
 *  EVENT LOG       hard delete. Biometric events are art. 9 health data;
 *                  there is no overriding ground to retain them. The
 *                  append-only trigger blocks DELETE, so this path sets the
 *                  `onemm.privacy_erasure` GUC (transaction-local) that the
 *                  trigger recognizes — erasure is the single sanctioned
 *                  deletion path, and it cannot be invoked by accident.
 *
 *  PATTERN GRAPH   hard delete. Patterns are derived FROM the individual's
 *                  data and are about the individual — they go with the
 *                  data (evidence and embeddings cascade from pattern).
 *
 *  INTERVENTION LEDGER — ANONYMIZED, NOT DELETED. Documented decision:
 *      The ledger is the record of what the system decided, on what basis,
 *      and whether its hypotheses held. Erasing it would erase the evidence
 *      of the system's own behavior — including its mistakes — which we
 *      need for safety accountability and scientific/statistical evaluation
 *      (GDPR art. 17(3)(d); recital 156). The retained row is anonymized:
 *      user_id is nulled and anonymized_at set (enforced write-once by the
 *      ledger trigger). trigger_context is PII-free BY CONSTRUCTION — it
 *      contains only physiological values, coarse profile-signature bands
 *      and opaque ids whose referents no longer exist after this
 *      transaction. Once no living row links the ledger entry to a person,
 *      the entry is anonymous information outside the GDPR's scope
 *      (recital 26). If this reasoning is ever successfully challenged,
 *      flip `HARD_DELETE_LEDGER` and the same path hard-deletes instead.
 */
const HARD_DELETE_LEDGER = false;

export interface ErasureReceipt {
  userId: string;
  erasedAt: string;
  profileDeleted: boolean;
  eventsDeleted: number;
  patternsDeleted: number;
  interventionsAnonymized: number;
  interventionsDeleted: number;
}

export async function eraseUser(userId: string): Promise<ErasureReceipt> {
  return db.transaction(async (tx) => {
    // Sanctioned-deletion flag for the event append-only trigger,
    // scoped to this transaction only.
    await tx.execute(sql`SELECT set_config('onemm.privacy_erasure', 'on', true)`);

    const eventsDeleted = await tx
      .delete(event)
      .where(eq(event.userId, userId))
      .returning({ id: event.eventId });

    const patternsDeleted = await tx
      .delete(pattern)
      .where(eq(pattern.userId, userId))
      .returning({ id: pattern.patternId });

    let interventionsAnonymized = 0;
    let interventionsDeleted = 0;
    if (HARD_DELETE_LEDGER) {
      const deleted = await tx
        .delete(intervention)
        .where(eq(intervention.userId, userId))
        .returning({ id: intervention.interventionId });
      interventionsDeleted = deleted.length;
    } else {
      const anonymized = await tx
        .update(intervention)
        .set({ userId: null, anonymizedAt: new Date() })
        .where(
          and(
            eq(intervention.userId, userId),
            isNull(intervention.anonymizedAt),
          ),
        )
        .returning({ id: intervention.interventionId });
      interventionsAnonymized = anonymized.length;
    }

    // Last: the profile root. Cascades take user_identity (PII) and the
    // rest of the Profile Store with it.
    const profileRows = await tx
      .delete(appUser)
      .where(eq(appUser.userId, userId))
      .returning({ id: appUser.userId });

    return {
      userId,
      erasedAt: new Date().toISOString(),
      profileDeleted: profileRows.length > 0,
      eventsDeleted: eventsDeleted.length,
      patternsDeleted: patternsDeleted.length,
      interventionsAnonymized,
      interventionsDeleted,
    };
  });
}
