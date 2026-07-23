/**
 * The Digital Twin domain model: four stores, one Postgres instance.
 *
 *   Profile Store        schema/profile.ts   strong consistency, normalized
 *   Event Log            schema/events.ts    TimescaleDB hypertable, append-only
 *   Pattern Graph        schema/patterns.ts  relational + pgvector, derived state
 *   Intervention Ledger  schema/ledger.ts    append-only, write-once outcomes
 *
 * Coupling rule: stores reference each other ONLY by opaque ids (user_id,
 * event_id + recorded_at, pattern_id), never by foreign keys across store
 * boundaries (the Profile Store's internal cascade is the one exception,
 * required for single-transaction erasure). This keeps the Pattern Graph
 * and Event Log individually replaceable later.
 */
export * from "./shared.js";
export * from "./profile.js";
export * from "./events.js";
export * from "./patterns.js";
export * from "./ledger.js";
