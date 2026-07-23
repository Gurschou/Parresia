-- ============================================================================
-- 0000_init.sql — 1MM Digital Twin, initial schema
--
-- One PostgreSQL 16 instance, EU region. TimescaleDB for the Event Log,
-- pgvector for pattern embeddings. Migrations are hand-maintained SQL (see
-- drizzle.config.ts for why); applied in order by src/db/migrate.ts.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid on older builds

-- ============================================================================
-- Shared enums
-- ============================================================================

CREATE TYPE user_status AS ENUM ('active', 'deletion_requested', 'deleted');

CREATE TYPE consent_category AS ENUM
  ('biometric', 'training', 'self_report', 'protocol', 'derived_pattern');

CREATE TYPE consent_purpose AS ENUM
  ('personalization', 'cold_start_similarity', 'product_improvement', 'export');

CREATE TYPE discipline AS ENUM
  ('road_cycling', 'gravel', 'mtb', 'running', 'trail_running', 'triathlon',
   'swimming', 'xc_skiing', 'rowing');

CREATE TYPE threshold_kind AS ENUM
  ('ftp_watts', 'lthr_bpm', 'css_pace_sec_per_100m',
   'run_threshold_pace_sec_per_km', 'max_hr_bpm', 'vo2max_est');

CREATE TYPE threshold_method AS ENUM
  ('field_test', 'lab_test', 'estimated', 'self_reported');

CREATE TYPE goal_priority AS ENUM ('A', 'B', 'C');
CREATE TYPE goal_status AS ENUM ('upcoming', 'completed', 'cancelled');

CREATE TYPE event_source AS ENUM
  ('whoop', 'self_report', 'protocol', 'system', 'manual');

CREATE TYPE pattern_status AS ENUM
  ('hypothesis', 'emerging', 'established', 'retired');

CREATE TYPE evidence_role AS ENUM ('antecedent', 'outcome');

CREATE TYPE adherence AS ENUM ('full', 'partial', 'none', 'unknown');

CREATE TYPE hypothesis_outcome AS ENUM
  ('confirmed', 'partially_confirmed', 'refuted', 'inconclusive');

CREATE TYPE delivery_channel AS ENUM ('push', 'email', 'in_app', 'sms');

-- ============================================================================
-- 1. PROFILE STORE — normalized, strongly consistent, cascade-erasable.
--    All tables cascade from app_user: GDPR art. 17 erasure of the profile
--    is one DELETE in one transaction.
-- ============================================================================

CREATE TABLE app_user (
  user_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timezone   text NOT NULL DEFAULT 'Europe/Copenhagen',
  locale     text NOT NULL DEFAULT 'da-DK',
  status     user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The ONLY table containing PII. Everything else references the opaque
-- user_id, which is what makes whitelist-based redaction enforceable.
CREATE TABLE user_identity (
  user_id      uuid PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
  email        text NOT NULL,
  display_name text NOT NULL,
  auth_subject text
);

-- Append-only consent ledger: latest row per (user, category, purpose) wins.
-- Withdrawal = new row with granted=false. Never updated (art. 7(1) proof).
CREATE TABLE consent (
  consent_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  data_category  consent_category NOT NULL,
  purpose        consent_purpose NOT NULL,
  granted        boolean NOT NULL,
  policy_version text NOT NULL,
  decided_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_current_idx
  ON consent (user_id, data_category, purpose, decided_at DESC);

CREATE TABLE athlete_baseline (
  user_id            uuid PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
  training_age_years numeric(4,1),
  weekly_hours_avg   numeric(4,1),
  history_summary    text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE athlete_discipline (
  user_id    uuid NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  discipline discipline NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, discipline)
);

-- Threshold history: newest row per (user, kind) is the current value.
CREATE TABLE threshold (
  threshold_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  kind         threshold_kind NOT NULL,
  value        numeric(8,2) NOT NULL,
  unit         text NOT NULL,
  method       threshold_method NOT NULL,
  measured_at  timestamptz NOT NULL
);
CREATE INDEX threshold_current_idx ON threshold (user_id, kind, measured_at DESC);

CREATE TABLE goal_event (
  goal_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  name          text NOT NULL,
  event_date    date NOT NULL,
  event_type    text NOT NULL,
  priority      goal_priority NOT NULL,
  status        goal_status NOT NULL DEFAULT 'upcoming',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goal_event_user_idx ON goal_event (user_id, event_date);

CREATE TABLE user_preference (
  preference_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  key           text NOT NULL,
  value         jsonb NOT NULL,
  reported_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_preference_idx ON user_preference (user_id, key, reported_at DESC);

-- ============================================================================
-- 2. EVENT LOG — TimescaleDB hypertable, append-only.
--    time dimension: recorded_at; space dimension: user_id.
--    Deliberately NO FK to app_user (erasure is explicit, lifecycle
--    decoupled; see schema/events.ts for the full rationale).
-- ============================================================================

CREATE TABLE event (
  event_id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  source              event_source NOT NULL,
  external_id         text NOT NULL,
  event_type          text NOT NULL,
  recorded_at         timestamptz NOT NULL,
  ingested_at         timestamptz NOT NULL DEFAULT now(),
  payload             jsonb NOT NULL,
  schema_version      smallint NOT NULL DEFAULT 1,
  supersedes_event_id uuid,
  is_superseded       boolean NOT NULL DEFAULT false,
  -- Hypertable constraint: PK and unique indexes must include BOTH
  -- partitioning columns (recorded_at time dimension, user_id space
  -- dimension). Harmless for dedupe: an external event always belongs to
  -- the same user and carries the same recorded_at on re-delivery.
  PRIMARY KEY (event_id, user_id, recorded_at)
);

SELECT create_hypertable(
  'event', 'recorded_at',
  partitioning_column => 'user_id',
  number_partitions   => 4,
  chunk_time_interval => INTERVAL '7 days'
);

-- Idempotent ingest: replays hit ON CONFLICT DO NOTHING on this index.
CREATE UNIQUE INDEX event_dedupe_idx
  ON event (source, external_id, user_id, recorded_at);
CREATE INDEX event_user_time_idx ON event (user_id, recorded_at DESC);
CREATE INDEX event_user_type_time_idx ON event (user_id, event_type, recorded_at DESC);

-- Append-only enforcement. The single approved exception: flipping
-- is_superseded false->true (once) when a correction row is written, so
-- continuous aggregates can exclude stale rows. Everything else is frozen.
CREATE FUNCTION event_append_only_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only the privacy erasure path may delete; it sets this GUC.
    IF current_setting('onemm.privacy_erasure', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'event log is append-only: DELETE rejected (use privacy erasure)';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id            IS DISTINCT FROM OLD.event_id
       OR NEW.user_id          IS DISTINCT FROM OLD.user_id
       OR NEW.source           IS DISTINCT FROM OLD.source
       OR NEW.external_id      IS DISTINCT FROM OLD.external_id
       OR NEW.event_type       IS DISTINCT FROM OLD.event_type
       OR NEW.recorded_at      IS DISTINCT FROM OLD.recorded_at
       OR NEW.ingested_at      IS DISTINCT FROM OLD.ingested_at
       OR NEW.payload          IS DISTINCT FROM OLD.payload
       OR NEW.schema_version   IS DISTINCT FROM OLD.schema_version
       OR NEW.supersedes_event_id IS DISTINCT FROM OLD.supersedes_event_id
    THEN
      RAISE EXCEPTION 'event log is append-only: corrections are new rows (supersedes_event_id)';
    END IF;
    IF OLD.is_superseded = true AND NEW.is_superseded = false THEN
      RAISE EXCEPTION 'is_superseded is write-once';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER event_append_only
  BEFORE UPDATE OR DELETE ON event
  FOR EACH ROW EXECUTE FUNCTION event_append_only_guard();

-- ----------------------------------------------------------------------------
-- Continuous aggregates: daily and weekly rollups.
-- Payload fields are extracted per event_type; superseded rows are excluded.
-- Buckets are UTC; per-user local-day queries go through src/twin (which
-- knows the user's timezone) — accepted imprecision for this phase.
-- ----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW daily_biometrics
WITH (timescaledb.continuous) AS
SELECT
  user_id,
  time_bucket('1 day', recorded_at) AS day,
  avg((payload->>'hrv_rmssd_ms')::numeric)
    FILTER (WHERE event_type = 'biometric.recovery')   AS avg_hrv_rmssd_ms,
  avg((payload->>'resting_hr_bpm')::numeric)
    FILTER (WHERE event_type = 'biometric.recovery')   AS avg_resting_hr_bpm,
  avg((payload->>'recovery_score')::numeric)
    FILTER (WHERE event_type = 'biometric.recovery')   AS avg_recovery_score,
  sum((payload->>'duration_min')::numeric)
    FILTER (WHERE event_type = 'biometric.sleep')      AS sleep_duration_min,
  avg((payload->>'sleep_efficiency_pct')::numeric)
    FILTER (WHERE event_type = 'biometric.sleep')      AS avg_sleep_efficiency_pct,
  sum((payload->>'strain')::numeric)
    FILTER (WHERE event_type = 'biometric.strain')     AS total_strain,
  avg((payload->>'value')::numeric)
    FILTER (WHERE event_type = 'state.energy')         AS avg_energy,
  avg((payload->>'value')::numeric)
    FILTER (WHERE event_type = 'state.mood')           AS avg_mood,
  count(*)                                             AS event_count
FROM event
WHERE NOT is_superseded
GROUP BY user_id, time_bucket('1 day', recorded_at)
WITH NO DATA;

CREATE MATERIALIZED VIEW weekly_training_load
WITH (timescaledb.continuous) AS
SELECT
  user_id,
  time_bucket('7 days', recorded_at) AS week,
  count(*) FILTER (WHERE event_type LIKE 'workout.%')  AS session_count,
  sum((payload->>'duration_min')::numeric)
    FILTER (WHERE event_type LIKE 'workout.%')         AS total_duration_min,
  sum((payload->>'strain')::numeric)
    FILTER (WHERE event_type LIKE 'workout.%')         AS total_strain,
  sum((payload->>'distance_km')::numeric)
    FILTER (WHERE event_type LIKE 'workout.%')         AS total_distance_km
FROM event
WHERE NOT is_superseded
GROUP BY user_id, time_bucket('7 days', recorded_at)
WITH NO DATA;

SELECT add_continuous_aggregate_policy('daily_biometrics',
  start_offset      => INTERVAL '30 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('weekly_training_load',
  start_offset      => INTERVAL '90 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '6 hours');

-- ============================================================================
-- 3. PATTERN GRAPH — relational + pgvector. Derived state; the only store
--    with in-place updates (confidence/n move with evidence).
-- ============================================================================

CREATE TABLE pattern (
  pattern_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  antecedent        jsonb NOT NULL,
  consequent        jsonb NOT NULL,
  strength          numeric(4,3) NOT NULL,
  confidence        numeric(4,3) NOT NULL
                      CHECK (confidence >= 0 AND confidence <= 1),
  observation_count integer NOT NULL DEFAULT 0,
  status            pattern_status NOT NULL DEFAULT 'hypothesis',
  first_observed_at timestamptz NOT NULL,
  last_observed_at  timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  semantic_key      text NOT NULL,
  -- "Never present a hypothesis as knowledge": established requires n >= 10.
  CONSTRAINT pattern_status_requires_n CHECK (
    status <> 'established' OR observation_count >= 10
  )
);
CREATE UNIQUE INDEX pattern_semantic_idx ON pattern (user_id, semantic_key);
CREATE INDEX pattern_user_idx ON pattern (user_id, status);

CREATE TABLE pattern_evidence (
  pattern_id  uuid NOT NULL REFERENCES pattern(pattern_id) ON DELETE CASCADE,
  event_id    uuid NOT NULL,
  recorded_at timestamptz NOT NULL,
  role        evidence_role NOT NULL,
  weight      numeric(4,3) NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pattern_id, event_id)
);

CREATE TABLE pattern_embedding (
  pattern_id      uuid PRIMARY KEY REFERENCES pattern(pattern_id) ON DELETE CASCADE,
  embedding       vector(1536) NOT NULL,
  embedding_model text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- HNSW over cosine distance: cold-start similarity search across users.
CREATE INDEX pattern_embedding_hnsw_idx ON pattern_embedding
  USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- 4. INTERVENTION LEDGER — append-only with write-once outcome columns.
--    Auditability enforced by trigger, not by convention.
-- ============================================================================

CREATE TABLE intervention (
  intervention_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid,          -- NULL only after anonymization
  issued_at        timestamptz NOT NULL DEFAULT now(),

  -- Frozen at issue:
  trigger_context   jsonb NOT NULL,
  hypothesis        jsonb NOT NULL,
  intervention_type text NOT NULL,
  content           jsonb NOT NULL,
  model_version     text NOT NULL,
  prompt_version    text NOT NULL,
  outcome_window    tstzrange NOT NULL,

  -- Write-once outcome columns (NULL -> value, never changed again):
  delivery_channel      delivery_channel,
  delivered_at          timestamptz,
  seen_at               timestamptz,
  adherence             adherence,
  adherence_recorded_at timestamptz,
  measured_effect       jsonb,
  hypothesis_outcome    hypothesis_outcome,
  effect_measured_at    timestamptz,

  anonymized_at         timestamptz
);

CREATE INDEX intervention_user_idx ON intervention (user_id, issued_at DESC);
CREATE INDEX intervention_type_outcome_idx
  ON intervention (intervention_type, hypothesis_outcome);
-- "Which intervention types work for users with this profile signature?"
-- => trigger_context->'profile_signature' @> '{...}' via GIN.
CREATE INDEX intervention_signature_idx
  ON intervention USING gin ((trigger_context -> 'profile_signature'));
-- Post-protocol scheduler: find interventions whose window has closed but
-- whose effect is unmeasured.
CREATE INDEX intervention_open_window_idx
  ON intervention (upper(outcome_window))
  WHERE hypothesis_outcome IS NULL;

-- The ledger's integrity rules, in one place:
--   DELETE  -> always rejected (anonymize instead; see src/privacy/deletion.ts)
--   UPDATE  -> immutable columns frozen; outcome columns write-once;
--              anonymization may null user_id and set anonymized_at.
CREATE FUNCTION intervention_ledger_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'intervention ledger is append-only: DELETE rejected; anonymize instead';
  END IF;

  -- Frozen-at-issue columns.
  IF NEW.intervention_id   IS DISTINCT FROM OLD.intervention_id
     OR NEW.issued_at      IS DISTINCT FROM OLD.issued_at
     OR NEW.trigger_context  IS DISTINCT FROM OLD.trigger_context
     OR NEW.hypothesis       IS DISTINCT FROM OLD.hypothesis
     OR NEW.intervention_type IS DISTINCT FROM OLD.intervention_type
     OR NEW.content          IS DISTINCT FROM OLD.content
     OR NEW.model_version    IS DISTINCT FROM OLD.model_version
     OR NEW.prompt_version   IS DISTINCT FROM OLD.prompt_version
     OR NEW.outcome_window   IS DISTINCT FROM OLD.outcome_window
  THEN
    RAISE EXCEPTION 'intervention ledger: frozen columns cannot be modified';
  END IF;

  -- user_id may only change to NULL, together with anonymized_at (erasure).
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NEW.user_id IS NOT NULL OR NEW.anonymized_at IS NULL THEN
      RAISE EXCEPTION 'intervention ledger: user_id may only be nulled by anonymization';
    END IF;
  END IF;
  IF OLD.anonymized_at IS NOT NULL
     AND NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at THEN
    RAISE EXCEPTION 'intervention ledger: anonymized_at is write-once';
  END IF;

  -- Outcome columns: NULL -> value once; never value -> other value.
  IF OLD.delivery_channel IS NOT NULL AND NEW.delivery_channel IS DISTINCT FROM OLD.delivery_channel THEN
    RAISE EXCEPTION 'intervention ledger: delivery_channel is write-once';
  END IF;
  IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    RAISE EXCEPTION 'intervention ledger: delivered_at is write-once';
  END IF;
  IF OLD.seen_at IS NOT NULL AND NEW.seen_at IS DISTINCT FROM OLD.seen_at THEN
    RAISE EXCEPTION 'intervention ledger: seen_at is write-once';
  END IF;
  IF OLD.adherence IS NOT NULL AND NEW.adherence IS DISTINCT FROM OLD.adherence THEN
    RAISE EXCEPTION 'intervention ledger: adherence is write-once';
  END IF;
  IF OLD.adherence_recorded_at IS NOT NULL AND NEW.adherence_recorded_at IS DISTINCT FROM OLD.adherence_recorded_at THEN
    RAISE EXCEPTION 'intervention ledger: adherence_recorded_at is write-once';
  END IF;
  IF OLD.measured_effect IS NOT NULL AND NEW.measured_effect IS DISTINCT FROM OLD.measured_effect THEN
    RAISE EXCEPTION 'intervention ledger: measured_effect is write-once';
  END IF;
  IF OLD.hypothesis_outcome IS NOT NULL AND NEW.hypothesis_outcome IS DISTINCT FROM OLD.hypothesis_outcome THEN
    RAISE EXCEPTION 'intervention ledger: hypothesis_outcome is write-once';
  END IF;
  IF OLD.effect_measured_at IS NOT NULL AND NEW.effect_measured_at IS DISTINCT FROM OLD.effect_measured_at THEN
    RAISE EXCEPTION 'intervention ledger: effect_measured_at is write-once';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER intervention_ledger_append_only
  BEFORE UPDATE OR DELETE ON intervention
  FOR EACH ROW EXECUTE FUNCTION intervention_ledger_guard();

-- Junction: which patterns the intervention was built on, with confidence/n
-- FROZEN at issue time (the live pattern row drifts; the ledger must not).
-- No FK to pattern (patterns may be retired or erased; the ledger survives).
CREATE TABLE intervention_pattern (
  intervention_id     uuid NOT NULL REFERENCES intervention(intervention_id) ON DELETE RESTRICT,
  pattern_id          uuid NOT NULL,
  confidence_at_issue numeric(4,3) NOT NULL,
  n_at_issue          integer NOT NULL,
  PRIMARY KEY (intervention_id, pattern_id)
);
CREATE INDEX intervention_pattern_pattern_idx ON intervention_pattern (pattern_id);

-- Which events measured_effect was computed from (audit trail).
CREATE TABLE intervention_effect_evidence (
  intervention_id uuid NOT NULL REFERENCES intervention(intervention_id) ON DELETE RESTRICT,
  event_id        uuid NOT NULL,
  recorded_at     timestamptz NOT NULL,
  PRIMARY KEY (intervention_id, event_id)
);
