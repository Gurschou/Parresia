import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client.js";
import {
  appUser,
  athleteBaseline,
  athleteDiscipline,
  goalEvent,
  threshold,
  userIdentity,
  userPreference,
} from "../schema/profile.js";
import { WhoopAdapter } from "../src/ingest/whoop.js";
import { ingestEvents } from "../src/ingest/pipeline.js";
import { recordConsent } from "../src/privacy/consent.js";
import {
  issueIntervention,
  measureOutcomes,
  recordAdherence,
  recordDelivery,
  recordSeen,
} from "../src/loop/index.js";
import { ruleBasedGenerator, simpleEffectMeasurer } from "../src/loop/baseline.js";
import { SEED_ATHLETES, type SeedAthlete } from "./athletes.js";
import { FixtureWhoopClient, generateDay, rng } from "./whoopFixtures.js";

/**
 * Seeds 90 days of realistic data for three fictional athletes by running
 * the REAL pipeline end to end, day by day:
 *
 *   Whoop fixtures -> WhoopAdapter -> idempotent ingest -> Event Log
 *   self-reports   ->                 idempotent ingest -> Event Log
 *   Precision Loop -> measure due outcomes, then maybe issue -> Ledger
 *   adherence      -> protocol events + write-once ledger columns
 *
 * The only seed-specific liberty: ingested_at is set explicitly to a
 * plausible arrival time (~30 min after the source created the record),
 * because the twin snapshot's "what did we know at time T" semantics would
 * otherwise hide historical events from the simulated loop runs.
 *
 * Deterministic: same PRNG seeds, same 90 days, every run.
 */

const DAYS = 90;
const POLICY_VERSION = "2026-06-privacy-v1";

async function resetAll(): Promise<void> {
  // Dev-only wipe. TRUNCATE bypasses the append-only row triggers by
  // design — it exists for seed/test environments, never production paths.
  await db.execute(sql`
    TRUNCATE intervention_effect_evidence, intervention_pattern, intervention,
             pattern_embedding, pattern_evidence, pattern,
             event,
             user_preference, goal_event, threshold, athlete_discipline,
             athlete_baseline, consent, user_identity, app_user
    CASCADE`);
}

async function seedProfile(a: SeedAthlete, windowStart: Date): Promise<void> {
  await db.insert(appUser).values({
    userId: a.userId,
    timezone: a.timezone,
    locale: a.locale,
  });
  await db.insert(userIdentity).values({
    userId: a.userId,
    email: a.email,
    displayName: a.displayName,
  });

  const categories = [
    "biometric",
    "training",
    "self_report",
    "protocol",
    "derived_pattern",
  ] as const;
  for (const category of categories) {
    await recordConsent({
      userId: a.userId,
      dataCategory: category,
      purpose: "personalization",
      granted: true,
      policyVersion: POLICY_VERSION,
    });
    await recordConsent({
      userId: a.userId,
      dataCategory: category,
      purpose: "cold_start_similarity",
      granted: a.consentColdStart,
      policyVersion: POLICY_VERSION,
    });
  }

  await db.insert(athleteBaseline).values({
    userId: a.userId,
    trainingAgeYears: String(a.baseline.trainingAgeYears),
    weeklyHoursAvg: String(a.baseline.weeklyHoursAvg),
    historySummary: a.baseline.historySummary,
  });
  await db.insert(athleteDiscipline).values(
    a.disciplines.map((d) => ({
      userId: a.userId,
      discipline: d.discipline as (typeof athleteDiscipline.$inferInsert)["discipline"],
      isPrimary: d.isPrimary,
    })),
  );
  await db.insert(threshold).values(
    a.thresholds.map((t) => ({
      userId: a.userId,
      kind: t.kind as (typeof threshold.$inferInsert)["kind"],
      value: String(t.value),
      unit: t.unit,
      method: t.method as (typeof threshold.$inferInsert)["method"],
      measuredAt: new Date(windowStart.getTime() - 14 * 86_400_000),
    })),
  );
  await db.insert(goalEvent).values(
    a.goals.map((g) => ({
      userId: a.userId,
      name: g.name,
      eventDate: new Date(windowStart.getTime() + g.dayOffset * 86_400_000)
        .toISOString()
        .slice(0, 10),
      eventType: g.eventType,
      priority: g.priority,
      createdAt: windowStart,
    })),
  );
  await db.insert(userPreference).values(
    a.preferences.map((p) => ({
      userId: a.userId,
      key: p.key,
      value: p.value,
      reportedAt: windowStart,
    })),
  );
}

async function seedAthleteTimeline(
  a: SeedAthlete,
  windowStart: Date,
): Promise<{ interventions: number; corrections: number }> {
  const rand = rng(a.physiology.seed);
  let interventionsIssued = 0;

  for (let day = 0; day < DAYS; day++) {
    const records = generateDay(a, windowStart, day, rand);
    const dayStart = new Date(windowStart.getTime() + day * 86_400_000);
    const at = (h: number, m = 0) =>
      new Date(dayStart.getTime() + (h * 60 + m) * 60_000);

    // --- Whoop data through the real adapter -------------------------
    const client = new FixtureWhoopClient({
      sleeps: [records.sleep],
      recoveries: [records.recovery],
      cycles: [records.cycle],
      workouts: records.workout ? [records.workout] : [],
    });
    const adapter = new WhoopAdapter(client);
    const whoopEvents = await adapter.fetchSince(a.userId, dayStart);
    await ingestEvents(
      whoopEvents.map((ev) => ({
        ...ev,
        // Wearable data arrives a bit after it was recorded — and the twin
        // snapshot's ingested_at semantics must see it during simulation.
        ingestedAt: new Date(ev.recordedAt.getTime() + 45 * 60_000),
      })),
    );

    // --- Morning self-reports (energy/mood track recovery, with noise) --
    const scale = (base: number) =>
      Math.max(1, Math.min(10, Math.round(base + (rand() - 0.5) * 3)));
    const energy = scale(records.derived.recoveryScore / 10);
    const mood = scale(records.derived.recoveryScore / 10 + 0.5);
    const selfReports: Array<{
      type: "state.energy" | "state.mood" | "state.pain";
      payload: Record<string, unknown>;
    }> = [
      { type: "state.energy", payload: { value: energy } },
      { type: "state.mood", payload: { value: mood } },
    ];
    if (records.derived.inPatch && rand() < 0.3) {
      selfReports.push({
        type: "state.pain",
        payload: {
          value: scale(4),
          location: a.physiology.sport === "running" ? "achilles" : "lower_back",
        },
      });
    }
    await ingestEvents(
      selfReports.map((r, i) => ({
        userId: a.userId,
        source: "self_report" as const,
        externalId: `sr-${a.physiology.seed}-${day}-${r.type}`,
        eventType: r.type,
        recordedAt: at(8, 15 + i),
        ingestedAt: at(8, 16 + i),
        payload: r.payload,
      })),
    );

    // --- Precision Loop: close due windows, then consider a new one ----
    await measureOutcomes(a.userId, simpleEffectMeasurer, at(9, 0));

    const issued = await issueIntervention(a.userId, ruleBasedGenerator, at(9, 0));
    if (issued) {
      interventionsIssued++;
      await recordDelivery(issued.interventionId, "push", at(9, 5));
      const seen = rand() < 0.85;
      if (seen) await recordSeen(issued.interventionId, at(9, 30 + Math.round(rand() * 300)));

      // Adherence that evening, correlated with the athlete's reliability.
      const roll = rand();
      const steps = ["in_bed_by", "no_screens", "cool_room"].map((step, i) => ({
        step,
        status:
          roll < a.physiology.adherenceRate
            ? ("completed" as const)
            : roll < a.physiology.adherenceRate + 0.25
              ? i === 0
                ? ("completed" as const)
                : ("skipped" as const)
              : ("skipped" as const),
        at: at(22, 30 + i),
      }));
      await recordAdherence({
        userId: a.userId,
        interventionId: issued.interventionId,
        protocolId: "sleep-extension-v1",
        steps,
      });
    }
  }

  // Close any windows still open at the end of the 90 days.
  await measureOutcomes(
    a.userId,
    simpleEffectMeasurer,
    new Date(windowStart.getTime() + (DAYS + 2) * 86_400_000),
  );

  // --- One retroactive Whoop correction (the supersede path) ----------
  // Whoop re-scores day 10's sleep a day later: same base id, newer
  // updated_at => new event with ":rev" external_id superseding the original.
  const correctedDay = 10;
  const correctionRand = rng(a.physiology.seed); // fresh PRNG; values differ from original day anyway
  const corrected = generateDay(a, windowStart, correctedDay, correctionRand);
  const sleep = corrected.sleep as Record<string, unknown>;
  const original: Record<string, unknown> = {
    ...sleep,
    id: `sl-${a.physiology.seed}-${correctedDay}`,
  };
  original.updated_at = new Date(
    new Date(original.created_at as string).getTime() + 26 * 3600 * 1000,
  ).toISOString();
  const adapter = new WhoopAdapter(
    new FixtureWhoopClient({ sleeps: [original], recoveries: [], cycles: [], workouts: [] }),
  );
  const correctionEvents = await adapter.fetchSince(a.userId, windowStart);
  const result = await ingestEvents(correctionEvents);

  return { interventions: interventionsIssued, corrections: result.supersededMarked };
}

async function main(): Promise<void> {
  const windowStart = new Date(Date.now() - DAYS * 86_400_000);
  windowStart.setUTCHours(0, 0, 0, 0);

  console.log(`resetting database and seeding ${DAYS} days from ${windowStart.toISOString()}`);
  await resetAll();

  for (const athlete of SEED_ATHLETES) {
    await seedProfile(athlete, windowStart);
    const { interventions, corrections } = await seedAthleteTimeline(
      athlete,
      windowStart,
    );
    console.log(
      `  ${athlete.displayName}: seeded (${interventions} interventions issued, ${corrections} correction(s) superseded)`,
    );
  }

  const counts = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM app_user)     AS users,
      (SELECT count(*) FROM event)        AS events,
      (SELECT count(*) FROM pattern)      AS patterns,
      (SELECT count(*) FROM intervention) AS interventions`);
  console.log("totals:", counts.rows[0]);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
