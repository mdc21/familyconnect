-- ============================================================
-- AGENTIC AI EVENT ORCHESTRATOR — Schema Migration
-- Extends FamilyConnect to support autonomous event detection,
-- portal generation, and human-in-the-loop approval.
-- ============================================================

-- Extend disaster_event with orchestrator fields
ALTER TABLE disaster_event ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE disaster_event ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE disaster_event ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE disaster_event ADD COLUMN IF NOT EXISTS coordinates JSONB;
ALTER TABLE disaster_event ADD COLUMN IF NOT EXISTS modules JSONB;
ALTER TABLE disaster_event ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT ARRAY['en'];
ALTER TABLE disaster_event ADD COLUMN IF NOT EXISTS branding JSONB;

-- Update existing Nepal event with type metadata
UPDATE disaster_event SET event_type = 'FLOOD', country = 'NP', region = 'Nepal–Tibet Border'
WHERE event_id = 'EVENT-NP-TIBET-2026' AND event_type IS NULL;

-- ─── Detected Events (Sentinel Agent output) ───────────────
CREATE TABLE IF NOT EXISTS detected_event (
    detection_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_feed      TEXT NOT NULL,
    source_alert_id  TEXT,
    event_type       TEXT NOT NULL,
    severity         TEXT NOT NULL DEFAULT 'MODERATE',
    title            TEXT NOT NULL,
    country          TEXT NOT NULL,
    country_name     TEXT,
    region           TEXT,
    coordinates      JSONB,
    magnitude        NUMERIC,
    estimated_affected INTEGER,
    confidence       NUMERIC DEFAULT 0.5,
    status           TEXT DEFAULT 'DETECTED',
    event_id         TEXT REFERENCES disaster_event(event_id),
    module_manifest  JSONB,
    preview_url      TEXT,
    detected_at      TIMESTAMPTZ DEFAULT now(),
    planned_at       TIMESTAMPTZ,
    built_at         TIMESTAMPTZ,
    reviewed_at      TIMESTAMPTZ,
    reviewed_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_detected_event_status ON detected_event(status);
CREATE INDEX IF NOT EXISTS idx_detected_event_type ON detected_event(event_type);

-- ─── Module Registry ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_registry (
    module_id        TEXT PRIMARY KEY,
    module_name      TEXT NOT NULL,
    description      TEXT,
    applicable_types TEXT[] NOT NULL,
    is_core          BOOLEAN DEFAULT false,
    has_public_page  BOOLEAN DEFAULT false,
    nav_label        TEXT,
    nav_path         TEXT,
    console_tab      TEXT,
    dependencies     TEXT[],
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── Event Module Activations ───────────────────────────────
CREATE TABLE IF NOT EXISTS event_module_activation (
    detection_id     UUID REFERENCES detected_event(detection_id) ON DELETE CASCADE,
    module_id        TEXT REFERENCES module_registry(module_id),
    is_active        BOOLEAN DEFAULT true,
    activated_by     TEXT DEFAULT 'AI_PLANNER',
    PRIMARY KEY (detection_id, module_id)
);

-- ─── Generated Artifacts ────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_artifact (
    artifact_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    detection_id     UUID REFERENCES detected_event(detection_id) ON DELETE CASCADE,
    artifact_type    TEXT NOT NULL,
    file_path        TEXT NOT NULL,
    module_id        TEXT,
    content_preview  TEXT,
    status           TEXT DEFAULT 'GENERATED',
    generated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifact_detection ON generated_artifact(detection_id);

-- ─── Human Review Log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_review (
    review_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    detection_id     UUID REFERENCES detected_event(detection_id) ON DELETE CASCADE,
    reviewer         TEXT NOT NULL,
    action           TEXT NOT NULL,
    changes_made     JSONB,
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);
