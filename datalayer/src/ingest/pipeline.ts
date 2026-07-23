import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { event } from "../../schema/events.js";
import { hasConsent, categoryForEventType } from "../privacy/consent.js";
import { redactPayload } from "../privacy/redaction.js";
import { SCHEMA_VERSION, validatePayload } from "./eventSchemas.js";
import type { NormalizedEvent, SourceAdapter } from "./adapter.js";
import { normalizedEventSchema } from "./adapter.js";

export interface IngestResult {
  received: number;
  inserted: number;
  /** Duplicates silently skipped by the dedupe index — replays are free. */
  deduplicated: number;
  /** Events dropped because the user has not consented to the category. */
  rejectedNoConsent: number;
  supersededMarked: number;
}

/**
 * The single write path into the Event Log. Idempotent by construction:
 * INSERT ... ON CONFLICT (source, external_id, recorded_at) DO NOTHING.
 *
 * Order of operations per batch:
 *   1. Zod-validate the envelope and the payload per event_type (strict
 *      schemas: unknown keys rejected — first line of the no-PII guarantee).
 *   2. Redact free-text fields (emails, phone numbers, names-after-keywords).
 *   3. Check consent per data category (personalization purpose). Biometric
 *      data is GDPR art. 9 — no consent, no storage. Full stop.
 *   4. Bulk insert with ON CONFLICT DO NOTHING.
 *   5. For corrections, flip is_superseded on the replaced rows (the one
 *      approved write-once update on the Event Log).
 */
export async function ingestEvents(
  rawEvents: NormalizedEvent[],
): Promise<IngestResult> {
  const result: IngestResult = {
    received: rawEvents.length,
    inserted: 0,
    deduplicated: 0,
    rejectedNoConsent: 0,
    supersededMarked: 0,
  };
  if (rawEvents.length === 0) return result;

  const validated = rawEvents.map((raw) => {
    const env = normalizedEventSchema.parse(raw);
    const payload = redactPayload(
      validatePayload(env.eventType, env.payload) as Record<string, unknown>,
    );
    return { ...env, payload };
  });

  // Consent gate, cached per (user, category) within the batch.
  const consentCache = new Map<string, boolean>();
  const admitted: typeof validated = [];
  for (const ev of validated) {
    const category = categoryForEventType(ev.eventType);
    const cacheKey = `${ev.userId}:${category}`;
    let ok = consentCache.get(cacheKey);
    if (ok === undefined) {
      ok = await hasConsent(ev.userId, category, "personalization");
      consentCache.set(cacheKey, ok);
    }
    if (ok) admitted.push(ev);
    else result.rejectedNoConsent++;
  }
  if (admitted.length === 0) return result;

  const rows = admitted.map((ev) => ({
    userId: ev.userId,
    source: ev.source,
    externalId: ev.externalId,
    eventType: ev.eventType,
    recordedAt: ev.recordedAt,
    ...(ev.ingestedAt && { ingestedAt: ev.ingestedAt }),
    payload: ev.payload,
    schemaVersion: SCHEMA_VERSION,
    supersedesEventId: ev.supersedes?.eventId ?? null,
  }));

  const inserted = await db
    .insert(event)
    .values(rows)
    .onConflictDoNothing({
      target: [event.source, event.externalId, event.userId, event.recordedAt],
    })
    .returning({ eventId: event.eventId, externalId: event.externalId });

  result.inserted = inserted.length;
  result.deduplicated = admitted.length - inserted.length;

  // Mark replaced rows as superseded — but only for correction rows that
  // actually landed (a deduped replay must not re-touch old rows).
  const landed = new Set(inserted.map((r) => r.externalId));
  const supersededTargets = admitted
    .filter((ev) => ev.supersedes && landed.has(ev.externalId))
    .map((ev) => ev.supersedes!);
  if (supersededTargets.length > 0) {
    for (const target of supersededTargets) {
      const updated = await db
        .update(event)
        .set({ isSuperseded: true })
        .where(
          and(
            eq(event.eventId, target.eventId),
            eq(event.recordedAt, target.recordedAt),
            eq(event.isSuperseded, false),
          ),
        )
        .returning({ eventId: event.eventId });
      result.supersededMarked += updated.length;
    }
  }

  return result;
}

/** Pull-based sync: fetch everything new from an adapter and ingest it. */
export async function syncFromAdapter(
  adapter: SourceAdapter,
  userId: string,
  since: Date,
): Promise<IngestResult> {
  const events = await adapter.fetchSince(userId, since);
  return ingestEvents(events);
}

/** Push-based sync: translate one webhook delivery and ingest it. */
export async function ingestWebhook(
  adapter: SourceAdapter,
  userId: string,
  body: unknown,
): Promise<IngestResult> {
  const events = await adapter.handleWebhook(userId, body);
  return ingestEvents(events);
}
