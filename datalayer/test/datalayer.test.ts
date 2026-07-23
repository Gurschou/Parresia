import { randomUUID } from "node:crypto";
import { sql, eq, and } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, closeDb, pool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { appUser, userIdentity } from "../schema/profile.js";
import { event } from "../schema/events.js";
import { pattern } from "../schema/patterns.js";
import { intervention } from "../schema/ledger.js";
import { ingestEvents } from "../src/ingest/pipeline.js";
import { WhoopAdapter, type WhoopClient } from "../src/ingest/whoop.js";
import { recordConsent } from "../src/privacy/consent.js";
import { eraseUser } from "../src/privacy/deletion.js";
import { exportUserData } from "../src/privacy/export.js";
import { redactText, redactForLog } from "../src/privacy/redaction.js";
import { getTwinSnapshot } from "../src/twin/index.js";
import {
  issueIntervention,
  measureOutcomes,
  recordAdherence,
  recordDelivery,
} from "../src/loop/index.js";
import { ruleBasedGenerator, simpleEffectMeasurer } from "../src/loop/baseline.js";
import { recordObservation, deriveStatus } from "../src/loop/patternService.js";

/**
 * Integration tests against a real Postgres 16 + TimescaleDB + pgvector
 * instance (DATABASE_URL). Each test uses its own user; created users are
 * erased afterwards through the real erasure path.
 */

const createdUsers: string[] = [];

/** Drizzle wraps Postgres errors; match against the full cause chain. */
async function expectDbRejection(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (err) {
    error = err;
  }
  expect(error).toBeDefined();
  const messages: string[] = [];
  let cursor: unknown = error;
  while (cursor instanceof Error) {
    messages.push(cursor.message);
    cursor = cursor.cause;
  }
  expect(messages.join(" | ")).toMatch(pattern);
}

async function makeUser(): Promise<string> {
  const [row] = await db
    .insert(appUser)
    .values({ timezone: "Europe/Copenhagen" })
    .returning({ userId: appUser.userId });
  const userId = row!.userId;
  createdUsers.push(userId);
  await db.insert(userIdentity).values({
    userId,
    email: `test-${userId.slice(0, 8)}@example.dk`,
    displayName: "Test Athlete",
  });
  for (const category of [
    "biometric",
    "training",
    "self_report",
    "protocol",
    "derived_pattern",
  ] as const) {
    await recordConsent({
      userId,
      dataCategory: category,
      purpose: "personalization",
      granted: true,
      policyVersion: "test-v1",
    });
  }
  return userId;
}

function recoveryEvent(userId: string, recordedAt: Date, ingestedAt?: Date) {
  return {
    userId,
    source: "whoop" as const,
    externalId: `whoop-recovery-${recordedAt.getTime()}`,
    eventType: "biometric.recovery" as const,
    recordedAt,
    ...(ingestedAt && { ingestedAt }),
    payload: { recovery_score: 33, hrv_rmssd_ms: 48.5, resting_hr_bpm: 55 },
  };
}

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  for (const userId of createdUsers) {
    try {
      await eraseUser(userId);
    } catch {
      // already erased by the test itself
    }
  }
  await closeDb();
});

describe("Event Log", () => {
  it("ingest is idempotent: replaying a batch inserts nothing", async () => {
    const userId = await makeUser();
    const batch = [recoveryEvent(userId, new Date("2026-06-01T06:00:00Z"))];

    const first = await ingestEvents(batch);
    expect(first.inserted).toBe(1);

    const replay = await ingestEvents(batch);
    expect(replay.inserted).toBe(0);
    expect(replay.deduplicated).toBe(1);
  });

  it("rejects events without consent for the category", async () => {
    const userId = await makeUser();
    await recordConsent({
      userId,
      dataCategory: "biometric",
      purpose: "personalization",
      granted: false, // withdrawal = new append-only row
      policyVersion: "test-v2",
    });
    const result = await ingestEvents([
      recoveryEvent(userId, new Date("2026-06-02T06:00:00Z")),
    ]);
    expect(result.inserted).toBe(0);
    expect(result.rejectedNoConsent).toBe(1);
  });

  it("rejects payloads with unknown keys (strict schemas, no-PII guard)", async () => {
    const userId = await makeUser();
    await expect(
      ingestEvents([
        {
          ...recoveryEvent(userId, new Date("2026-06-03T06:00:00Z")),
          payload: {
            recovery_score: 50,
            hrv_rmssd_ms: 60,
            resting_hr_bpm: 50,
            athlete_name: "Freja", // must be rejected
          },
        },
      ]),
    ).rejects.toThrow();
  });

  it("blocks UPDATE and DELETE via the append-only trigger", async () => {
    const userId = await makeUser();
    await ingestEvents([recoveryEvent(userId, new Date("2026-06-04T06:00:00Z"))]);

    await expectDbRejection(
      db
        .update(event)
        .set({ payload: { tampered: true } })
        .where(eq(event.userId, userId)),
      /append-only/,
    );

    await expectDbRejection(
      db.delete(event).where(eq(event.userId, userId)),
      /append-only/,
    );
  });

  it("handles Whoop corrections as superseding revisions, idempotently", async () => {
    const userId = await makeUser();
    const base = {
      id: "abc",
      start: "2026-06-05T22:00:00Z",
      end: "2026-06-06T06:00:00Z",
      created_at: "2026-06-06T06:10:00Z",
      updated_at: "2026-06-06T06:10:00Z",
      nap: false,
      score_state: "SCORED",
      score: {
        stage_summary: {
          total_in_bed_time_milli: 8 * 3600_000,
          total_awake_time_milli: 30 * 60_000,
          total_light_sleep_time_milli: 4 * 3600_000,
          total_slow_wave_sleep_time_milli: 90 * 60_000,
          total_rem_sleep_time_milli: 2 * 3600_000,
        },
        sleep_performance_percentage: 88,
        sleep_efficiency_percentage: 93.5,
      },
    };
    const client: WhoopClient = {
      getSleeps: async () => [base],
      getRecoveries: async () => [],
      getCycles: async () => [],
      getWorkouts: async () => [],
    };
    const adapter = new WhoopAdapter(client);

    const original = await adapter.fetchSince(userId, new Date(0));
    const r1 = await ingestEvents(original);
    expect(r1.inserted).toBe(1);

    // Whoop re-scores: same id, newer updated_at.
    const corrected = {
      ...base,
      updated_at: "2026-06-07T09:00:00Z",
      score: { ...base.score, sleep_performance_percentage: 91 },
    };
    const revEvents = await new WhoopAdapter({
      ...client,
      getSleeps: async () => [corrected],
    }).fetchSince(userId, new Date(0));
    expect(revEvents[0]!.externalId).toMatch(/^whoop-sleep-abc:rev/);
    expect(revEvents[0]!.supersedes).toBeDefined();

    const r2 = await ingestEvents(revEvents);
    expect(r2.inserted).toBe(1);
    expect(r2.supersededMarked).toBe(1);

    // Replaying the correction is a no-op (and doesn't re-touch old rows).
    const r3 = await ingestEvents(revEvents);
    expect(r3.inserted).toBe(0);
    expect(r3.supersededMarked).toBe(0);

    const rows = await db
      .select({ externalId: event.externalId, isSuperseded: event.isSuperseded })
      .from(event)
      .where(and(eq(event.userId, userId), eq(event.eventType, "biometric.sleep")));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.externalId === "whoop-sleep-abc")!.isSuperseded).toBe(true);
  });
});

describe("Twin snapshot", () => {
  it("excludes events not yet ingested at atTime (what did we KNOW)", async () => {
    const userId = await makeUser();
    const recordedAt = new Date("2026-06-08T06:00:00Z");
    // Recorded Monday, ingested two days late.
    await ingestEvents([
      recoveryEvent(userId, recordedAt, new Date("2026-06-10T12:00:00Z")),
    ]);

    const before = await getTwinSnapshot(userId, new Date("2026-06-09T00:00:00Z"));
    expect(before.recentEvents).toHaveLength(0);

    const after = await getTwinSnapshot(userId, new Date("2026-06-11T00:00:00Z"));
    expect(after.recentEvents).toHaveLength(1);
    expect(after.profile.consents.length).toBeGreaterThan(0);
  });
});

describe("Intervention Ledger", () => {
  async function issueOne(userId: string): Promise<string> {
    // Low recovery + short sleep so the rule generator fires.
    const now = new Date("2026-06-15T08:00:00Z");
    await ingestEvents([
      recoveryEvent(userId, new Date("2026-06-15T06:00:00Z"), new Date("2026-06-15T06:30:00Z")),
      {
        userId,
        source: "whoop" as const,
        externalId: "whoop-sleep-led-1",
        eventType: "biometric.sleep" as const,
        recordedAt: new Date("2026-06-14T22:30:00Z"),
        ingestedAt: new Date("2026-06-15T06:30:00Z"),
        payload: { duration_min: 350, is_nap: false },
      },
    ]);
    const issued = await issueIntervention(userId, ruleBasedGenerator, now);
    expect(issued).not.toBeNull();
    return issued!.interventionId;
  }

  it("freezes trigger_context and rejects any modification of it", async () => {
    const userId = await makeUser();
    const id = await issueOne(userId);

    await expectDbRejection(
      db
        .update(intervention)
        .set({ triggerContext: { tampered: true } })
        .where(eq(intervention.interventionId, id)),
      /frozen/,
    );

    await expectDbRejection(
      db.delete(intervention).where(eq(intervention.interventionId, id)),
      /append-only/,
    );
  });

  it("outcome columns are write-once", async () => {
    const userId = await makeUser();
    const id = await issueOne(userId);

    await recordDelivery(id, "push", new Date("2026-06-15T08:05:00Z"));
    await expectDbRejection(
      recordDelivery(id, "email", new Date("2026-06-15T09:00:00Z")),
      /write-once/,
    );
  });

  it("closes the loop: adherence, measured effect, pattern feedback", async () => {
    const userId = await makeUser();
    const id = await issueOne(userId);

    await recordAdherence({
      userId,
      interventionId: id,
      protocolId: "sleep-extension-v1",
      steps: [
        { step: "in_bed_by", status: "completed", at: new Date("2026-06-15T22:00:00Z") },
        { step: "no_screens", status: "skipped", at: new Date("2026-06-15T22:30:00Z") },
      ],
    });

    // Recovery rebounds inside the 48h outcome window.
    await ingestEvents([
      {
        ...recoveryEvent(userId, new Date("2026-06-16T06:00:00Z")),
        payload: { recovery_score: 61, hrv_rmssd_ms: 70, resting_hr_bpm: 49 },
      },
      {
        ...recoveryEvent(userId, new Date("2026-06-17T06:00:00Z")),
        payload: { recovery_score: 66, hrv_rmssd_ms: 74, resting_hr_bpm: 48 },
      },
    ]);

    const results = await measureOutcomes(
      userId,
      simpleEffectMeasurer,
      new Date("2026-06-17T09:00:00Z"),
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.outcome).toBe("confirmed");

    const [row] = await db
      .select()
      .from(intervention)
      .where(eq(intervention.interventionId, id));
    expect(row!.adherence).toBe("partial");
    expect(row!.hypothesisOutcome).toBe("confirmed");
    expect(row!.measuredEffect).toMatchObject({ metric: "recovery_score" });

    // The verdict fed the Pattern Graph.
    const patterns = await db
      .select()
      .from(pattern)
      .where(eq(pattern.userId, userId));
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.observationCount).toBe(1);
    expect(patterns[0]!.status).toBe("hypothesis");
  });
});

describe("Pattern Graph rules", () => {
  it("n < 5 can never leave hypothesis status", () => {
    expect(deriveStatus(2, 0.99)).toBe("hypothesis");
    expect(deriveStatus(5, 0.6)).toBe("emerging");
    expect(deriveStatus(10, 0.75)).toBe("established");
  });

  it("repeated observations update the same pattern row", async () => {
    const userId = await makeUser();
    const input = {
      userId,
      antecedent: {
        metric: "hrv_rmssd_ms",
        relation: "below_baseline_pct" as const,
        value: 15,
        window_hours: 48,
      },
      consequent: {
        metric: "session_quality",
        direction: "decrease" as const,
        magnitude_pct: 20,
        window_hours: 24,
      },
      supporting: true,
      observedAt: new Date(),
      strength: 0.4,
      evidence: [],
    };
    const first = await recordObservation(input);
    const second = await recordObservation(input);
    expect(second.patternId).toBe(first.patternId);
    expect(second.n).toBe(2);
    expect(second.confidence).toBeGreaterThan(first.confidence);
  });
});

describe("Privacy", () => {
  it("erasure hard-deletes profile/events/patterns and anonymizes the ledger", async () => {
    const userId = await makeUser();
    await ingestEvents([
      recoveryEvent(userId, new Date("2026-06-20T06:00:00Z"), new Date("2026-06-20T06:30:00Z")),
      {
        userId,
        source: "whoop" as const,
        externalId: "whoop-sleep-erasure-1",
        eventType: "biometric.sleep" as const,
        recordedAt: new Date("2026-06-19T22:30:00Z"),
        ingestedAt: new Date("2026-06-20T06:30:00Z"),
        payload: { duration_min: 340, is_nap: false },
      },
    ]);
    const issued = await issueIntervention(
      userId,
      ruleBasedGenerator,
      new Date("2026-06-20T08:00:00Z"),
    );
    expect(issued).not.toBeNull();

    const receipt = await eraseUser(userId);
    expect(receipt.profileDeleted).toBe(true);
    expect(receipt.eventsDeleted).toBeGreaterThan(0);
    expect(receipt.interventionsAnonymized).toBe(1);

    const users = await db.select().from(appUser).where(eq(appUser.userId, userId));
    expect(users).toHaveLength(0);
    const identities = await db
      .select()
      .from(userIdentity)
      .where(eq(userIdentity.userId, userId));
    expect(identities).toHaveLength(0);
    const events = await db.select().from(event).where(eq(event.userId, userId));
    expect(events).toHaveLength(0);

    const [ledgerRow] = await db
      .select()
      .from(intervention)
      .where(eq(intervention.interventionId, issued!.interventionId));
    expect(ledgerRow!.userId).toBeNull();
    expect(ledgerRow!.anonymizedAt).not.toBeNull();
    expect(ledgerRow!.triggerContext).toBeDefined(); // record survives, person is gone
  });

  it("exports all stores for one user in machine-readable form", async () => {
    const userId = await makeUser();
    await ingestEvents([recoveryEvent(userId, new Date("2026-06-21T06:00:00Z"))]);
    const dump = await exportUserData(userId);
    expect(dump.format).toBe("1mm-twin-export/v1");
    expect(dump.profile.identity).toBeTruthy();
    expect(dump.eventLog).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(dump))).toBeTruthy(); // serializable
  });

  it("redaction scrubs emails, CPR numbers and phone numbers", () => {
    expect(redactText("skriv til freja@example.dk")).toBe("skriv til [redacted-email]");
    expect(redactText("cpr 010190-1234")).toBe("cpr [redacted-id]");
    expect(redactText("ring +45 12 34 56 78")).toBe("ring [redacted-phone]");

    const log = redactForLog({ userId: "11111111-1111-4111-8111-111111111111", note: "x" });
    expect((log as { userId: string }).userId).toBe("11111111…");
  });

  it("free text in payloads is redacted at ingest", async () => {
    const userId = await makeUser();
    await ingestEvents([
      {
        userId,
        source: "self_report" as const,
        externalId: randomUUID(),
        eventType: "state.pain" as const,
        recordedAt: new Date("2026-06-22T08:00:00Z"),
        payload: { value: 4, note: "min læge (laege@klinik.dk) siger ro på" },
      },
    ]);
    const [row] = await db
      .select({ payload: event.payload })
      .from(event)
      .where(and(eq(event.userId, userId), eq(event.eventType, "state.pain")));
    expect(JSON.stringify(row!.payload)).toContain("[redacted-email]");
    expect(JSON.stringify(row!.payload)).not.toContain("klinik.dk");
  });
});

describe("Continuous aggregates", () => {
  it("daily rollup excludes superseded rows", async () => {
    const userId = await makeUser();
    const recordedAt = new Date("2026-06-25T06:00:00Z");
    await ingestEvents([
      { ...recoveryEvent(userId, recordedAt), externalId: "cagg-orig" },
    ]);
    const [orig] = await db
      .select({ eventId: event.eventId })
      .from(event)
      .where(and(eq(event.userId, userId), eq(event.externalId, "cagg-orig")));
    await ingestEvents([
      {
        ...recoveryEvent(userId, recordedAt),
        externalId: "cagg-orig:rev2",
        payload: { recovery_score: 80, hrv_rmssd_ms: 90, resting_hr_bpm: 44 },
        supersedes: { eventId: orig!.eventId, recordedAt },
      },
    ]);

    await pool.query(
      "CALL refresh_continuous_aggregate('daily_biometrics', NULL, NULL)",
    );
    const { rows } = await pool.query(
      "SELECT avg_recovery_score FROM daily_biometrics WHERE user_id = $1",
      [userId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].avg_recovery_score)).toBe(80); // only the correction counts
  });
});
