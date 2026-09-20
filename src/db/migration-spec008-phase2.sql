-- ============================================================
-- SPEC-008 Phase 2 Schema Migration
-- Module M2: Family Recovery Case
-- Module M10: Documentation Guidance & Case Tracking
-- ============================================================

-- ─── 1. Module M10: Documentation Process Tracking ───────────
CREATE TABLE IF NOT EXISTS documentation_process (
    process_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_unit_id      UUID NOT NULL REFERENCES family_unit(family_unit_id) ON DELETE CASCADE,
    process_type        TEXT NOT NULL,
    authority_name      TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'GUIDANCE_PROVIDED' 
                        CHECK (status IN (
                            'NOT_STARTED', 
                            'GUIDANCE_PROVIDED', 
                            'DOCUMENTS_GATHERED', 
                            'SUBMITTED_TO_AUTHORITY', 
                            'UNDER_REVIEW', 
                            'ISSUED', 
                            'REJECTED'
                        )),
    guidance_text       TEXT NOT NULL,
    required_documents  JSONB DEFAULT '[]'::jsonb,
    tracking_reference  TEXT,
    notes               TEXT,
    submitted_date      DATE,
    issued_date         DATE,
    is_seed             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_proc_family ON documentation_process(family_unit_id);
CREATE INDEX IF NOT EXISTS idx_doc_proc_type ON documentation_process(process_type);
CREATE INDEX IF NOT EXISTS idx_doc_proc_status ON documentation_process(status);
CREATE INDEX IF NOT EXISTS idx_doc_proc_seed ON documentation_process(is_seed);

-- ─── 2. Module M2: Family Recovery Journey ───────────────────
CREATE TABLE IF NOT EXISTS family_recovery_case (
    recovery_case_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_reference          TEXT UNIQUE NOT NULL,
    family_unit_id          UUID NOT NULL REFERENCES family_unit(family_unit_id) ON DELETE CASCADE,
    primary_case_id         UUID REFERENCES case_record(case_id) ON DELETE SET NULL,
    event_id                TEXT REFERENCES disaster_event(event_id),
    status                  TEXT NOT NULL DEFAULT 'OPEN' 
                            CHECK (status IN ('OPEN', 'IN_ASSESSMENT', 'PLAN_ACTIVE', 'MONITORING', 'RECOVERED', 'CLOSED')),
    access_policy           JSONB NOT NULL DEFAULT '{"visibility": "RESTRICTED", "delegated_orgs": []}'::jsonb,
    missing_deceased_summary JSONB DEFAULT '{"missing_count": 0, "deceased_count": 0, "dna_samples_linked": false, "inquest_complete": false}'::jsonb,
    housing_recovery_status TEXT NOT NULL DEFAULT 'ASSESSMENT_PENDING' 
                            CHECK (housing_recovery_status IN (
                                'TEMPORARY_SHELTER', 
                                'HOST_FAMILY', 
                                'ASSESSMENT_PENDING', 
                                'REPAIRS_UNDERWAY', 
                                'RECONSTRUCTION_PLANNED', 
                                'PERMANENT_HOUSING_RESTORED'
                            )),
    education_status        TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' 
                            CHECK (education_status IN ('NOT_APPLICABLE', 'DISRUPTED', 'TEMPORARY_LEARNING_CENTER', 'ENROLLED_REGULAR_SCHOOL')),
    livelihood_status       TEXT NOT NULL DEFAULT 'DISRUPTED' 
                            CHECK (livelihood_status IN ('DISRUPTED', 'RECOVERY_AID_RECEIVED', 'EMPLOYED', 'SELF_SUSTAINING')),
    assigned_caseworker_id  TEXT,
    lead_organisation_id    UUID REFERENCES organisation(organisation_id),
    goals                   JSONB DEFAULT '[]'::jsonb,
    notes                   TEXT,
    is_seed                 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_rec_family ON family_recovery_case(family_unit_id);
CREATE INDEX IF NOT EXISTS idx_family_rec_case ON family_recovery_case(primary_case_id);
CREATE INDEX IF NOT EXISTS idx_family_rec_status ON family_recovery_case(status);
CREATE INDEX IF NOT EXISTS idx_family_rec_seed ON family_recovery_case(is_seed);

-- Add is_seed column to community_profile and recovery_need if not present
ALTER TABLE community_profile ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_community_profile_seed ON community_profile(is_seed);

ALTER TABLE recovery_need ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_recovery_need_seed ON recovery_need(is_seed);
