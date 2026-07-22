import { z } from "zod";
import { eventTypeSchema } from "./eventSchemas.js";

/**
 * The normalized event every source adapter must emit. This is the ONLY
 * shape the ingest pipeline accepts; adapters own the mapping from
 * source-specific payloads to it.
 */
export const normalizedEventSchema = z
  .object({
    userId: z.string().uuid(),
    source: z.enum(["whoop", "self_report", "protocol", "system", "manual"]),
    /**
     * The source's stable id for this observation, INCLUDING revision:
     * a corrected observation must produce a DIFFERENT external_id
     * (convention: "<id>:rev<n>") plus supersedesEventId. Identical
     * re-deliveries produce the same external_id and dedupe to nothing.
     */
    externalId: z.string().min(1),
    eventType: eventTypeSchema,
    recordedAt: z.date(),
    /**
     * When we received the event. Omit in normal operation (defaults to
     * now() at insert). Only historical backfills/replays that KNOW the
     * original arrival time may set it — never to fake freshness.
     */
    ingestedAt: z.date().optional(),
    payload: z.unknown(),
    /** Set on corrections: the event_id (+recorded_at) of the replaced row. */
    supersedes: z
      .object({ eventId: z.string().uuid(), recordedAt: z.date() })
      .optional(),
  })
  .strict();

export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;

/**
 * A source of events. Two entry styles behind one interface:
 *  - pull (fetchSince): poll the source's API for anything new/changed
 *  - push (handleWebhook): translate one webhook delivery
 * Both return NormalizedEvents; both go through the same idempotent
 * ingest pipeline, so a webhook and a later backfill of the same data
 * cannot create duplicates.
 */
export interface SourceAdapter {
  readonly source: NormalizedEvent["source"];
  /** All events recorded or revised since `since` for this user. */
  fetchSince(userId: string, since: Date): Promise<NormalizedEvent[]>;
  /** Translate one webhook payload. Throws ZodError on malformed input. */
  handleWebhook(userId: string, body: unknown): Promise<NormalizedEvent[]>;
}
