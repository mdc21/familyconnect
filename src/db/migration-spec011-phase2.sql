-- ============================================================
-- SPEC-011 Phase 2 — Field Hub & Offline Sync Schema
-- offline_batch_record, field_hub, sync_conflict
-- ============================================================

-- ── Field Hub registry ────────────────────────────────────────────────────────
-- Tracks registered Field Hubs (Tier-2 nodes) and their last sync state.
CREATE TABLE IF NOT EXISTS field_hub (
    hub_id              TEXT PRIMARY KEY,              -- e.g. HUB-NP-RASUWAGADHI-001
    name                TEXT NOT NULL,
    event_id            TEXT REFERENCES disaster_event(event_id),
    location_name       TEXT,                          -- human-readable: "Rasuwagadhi Relief Camp"
    lat                 NUMERIC,
    lng                 NUMERIC,
    status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DECOMMISSIONED')),
    last_sync_at        TIMESTAMPTZ,
    last_batch_id       TEXT,
    total_records_synced INT DEFAULT 0,
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    registered_by       TEXT                           -- coordinator who provisioned the hub
);

CREATE INDEX IF NOT EXISTS idx_field_hub_event ON field_hub(event_id);
CREATE INDEX IF NOT EXISTS idx_field_hub_status ON field_hub(status);

-- ── Offline batch records ──────────────────────────────────────────────────────
-- Stores each record received from a Field Hub via POST /api/v1/sync/batch.
-- Processed asynchronously: RECEIVED → PROCESSING → APPLIED | CONFLICT | BLOCKED | FAILED.
CREATE TABLE IF NOT EXISTS offline_batch_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id              TEXT REFERENCES field_hub(hub_id),
    batch_id            TEXT,
    record_type         TEXT NOT NULL,                 -- submission.safety | submission.missing | etc.
    local_ref           TEXT,                          -- FC-LOCAL-XXXXXX assigned by the Field Hub
    body                JSONB NOT NULL DEFAULT '{}',
    captured_at         TIMESTAMPTZ,                   -- when the field worker captured the record (offline)
    captured_by         TEXT,                          -- caseworker ID at Field Hub
    idempotency_key     UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    status              TEXT NOT NULL DEFAULT 'RECEIVED'
                        CHECK (status IN ('RECEIVED', 'PROCESSING', 'APPLIED', 'CONFLICT', 'DUPLICATE', 'BLOCKED', 'FAILED')),
    conflict_type       TEXT,                          -- POTENTIAL_DUPLICATE | SELF_RESOLVED | STALE_APPROVAL | MERGE_CONFLICT
    conflict_detail     JSONB,
    applied_record_id   UUID,                          -- UUID of the resulting DB record if APPLIED
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at        TIMESTAMPTZ,
    error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_obr_hub ON offline_batch_record(hub_id);
CREATE INDEX IF NOT EXISTS idx_obr_batch ON offline_batch_record(batch_id);
CREATE INDEX IF NOT EXISTS idx_obr_status ON offline_batch_record(status);
CREATE INDEX IF NOT EXISTS idx_obr_type ON offline_batch_record(record_type);
CREATE INDEX IF NOT EXISTS idx_obr_idempotency ON offline_batch_record(idempotency_key);

-- ── Sync conflict queue ────────────────────────────────────────────────────────
-- Conflict types (§5.4) that require human caseworker review.
-- Records here are surfaced in the console.html Conflict Review panel.
CREATE TABLE IF NOT EXISTS sync_conflict (
    conflict_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_record_id     UUID NOT NULL REFERENCES offline_batch_record(id),
    conflict_type       TEXT NOT NULL
                        CHECK (conflict_type IN (
                            'POTENTIAL_DUPLICATE',   -- same person in two Field Hubs
                            'SELF_RESOLVED',         -- missing report + safety declaration for same person
                            'STALE_APPROVAL',        -- coordinator approval after portal state changed
                            'MERGE_CONFLICT',        -- infra report from two caseworkers, same site
                            'DUPLICATE_NEED'         -- recovery need submitted twice for same household
                        )),
    event_id            TEXT,
    record_a_id         UUID,                          -- first competing record
    record_b_id         UUID,                          -- second competing record (if applicable)
    resolution          TEXT DEFAULT 'PENDING'
                        CHECK (resolution IN ('PENDING', 'RESOLVED', 'DISMISSED')),
    resolved_by         TEXT,
    resolved_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    detail              JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflict_type ON sync_conflict(conflict_type);
CREATE INDEX IF NOT EXISTS idx_sync_conflict_resolution ON sync_conflict(resolution);
CREATE INDEX IF NOT EXISTS idx_sync_conflict_event ON sync_conflict(event_id);

-- ── Batch sync run log ────────────────────────────────────────────────────────
-- Audit log of each POST /sync/batch call — for hub operators to verify uploads.
CREATE TABLE IF NOT EXISTS sync_batch_run (
    batch_run_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            TEXT,
    hub_id              TEXT,
    total_records       INT NOT NULL DEFAULT 0,
    received            INT NOT NULL DEFAULT 0,
    duplicates          INT NOT NULL DEFAULT 0,
    blocked             INT NOT NULL DEFAULT 0,
    conflicts           INT NOT NULL DEFAULT 0,
    failed              INT NOT NULL DEFAULT 0,
    submitted_by        TEXT,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbr_hub ON sync_batch_run(hub_id);
CREATE INDEX IF NOT EXISTS idx_sbr_received ON sync_batch_run(received_at DESC);

-- ── Seed Standard Field Hubs ──────────────────────────────────────────────────
INSERT INTO field_hub (hub_id, name, status, location_name)
VALUES
    ('HUB-NP-KTM-001', 'Kathmandu Central Field Hub', 'ACTIVE', 'Bhrikutimandap Field Office'),
    ('HUB-NP-RASUWAGADHI-001', 'Rasuwagadhi Relief Camp Field Hub', 'ACTIVE', 'Rasuwagadhi Border Post')
ON CONFLICT (hub_id) DO NOTHING;

