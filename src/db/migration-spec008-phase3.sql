-- ============================================================
-- SPEC-008 Phase 3 Schema Migration
-- Module M7: Organisation Registry & Verification
-- Module M6: Resource Exchange & Match Proposals
-- Module M8: Recovery Projects & Recovery Tasks
-- ============================================================

-- ─── 1. Module M7: Extend Organisation Table ──────────────────
ALTER TABLE organisation ADD COLUMN IF NOT EXISTS capabilities TEXT[] DEFAULT '{}';
ALTER TABLE organisation ADD COLUMN IF NOT EXISTS geographic_scope JSONB DEFAULT '{}'::jsonb;
ALTER TABLE organisation ADD COLUMN IF NOT EXISTS active_commitments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE organisation ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE organisation ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE organisation ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_organisation_status ON organisation(verification_status);
CREATE INDEX IF NOT EXISTS idx_organisation_seed ON organisation(is_seed);

-- ─── 2. Module M6: Resource Offer & Exchange ──────────────────
-- Enable A03-NEEDS agent to submit resource matching proposals per SPEC-008 Phase 3
UPDATE agent_identity 
SET scoped_permissions = array_append(scoped_permissions, 'proposals:write')
WHERE agent_id = 'A03-NEEDS' AND NOT ('proposals:write' = ANY(scoped_permissions));

CREATE TABLE IF NOT EXISTS resource_offer (
    offer_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name       TEXT NOT NULL,
    provider_actor_id   TEXT,
    provider_org_id     UUID REFERENCES organisation(organisation_id),
    resource_type       TEXT NOT NULL, -- VOLUNTEERS, MACHINERY, TRANSPORT, PROFESSIONAL_SKILLS, SUPPLIES, SHELTER_MATERIALS, WATER_PURIFICATION
    capacity            JSONB NOT NULL DEFAULT '{}'::jsonb,
    location            JSONB NOT NULL DEFAULT '{}'::jsonb,
    availability        JSONB NOT NULL DEFAULT '{}'::jsonb,
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'REJECTED')),
    status              TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'MATCH_PROPOSED', 'MATCHED', 'IN_USE', 'COMPLETED', 'CANCELLED')),
    matched_need_id     UUID REFERENCES recovery_need(need_id),
    matched_proposal_id UUID REFERENCES ai_proposal(proposal_id),
    is_seed             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_offer_status ON resource_offer(status);
CREATE INDEX IF NOT EXISTS idx_resource_offer_type ON resource_offer(resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_offer_seed ON resource_offer(is_seed);

-- ─── 3. Module M8: Recovery Projects & Tasks ──────────────────
CREATE TABLE IF NOT EXISTS recovery_project (
    project_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_reference       TEXT UNIQUE NOT NULL,
    event_id                TEXT REFERENCES disaster_event(event_id),
    community_id            TEXT REFERENCES community_profile(community_id),
    title                   TEXT NOT NULL,
    objective               TEXT NOT NULL,
    scope                   TEXT,
    lead_organisation_id    UUID REFERENCES organisation(organisation_id),
    budget_ref              TEXT,
    budget_amount           NUMERIC,
    dependencies            JSONB DEFAULT '[]'::jsonb,
    milestones              JSONB DEFAULT '[]'::jsonb,
    verification_method     TEXT,
    evidence                JSONB DEFAULT '[]'::jsonb,
    status                  TEXT NOT NULL DEFAULT 'PROPOSED' 
                            CHECK (status IN (
                                'PROPOSED', 
                                'HUMAN_APPROVED', 
                                'PLANNED', 
                                'RESOURCE_CONFIRMED', 
                                'IN_PROGRESS', 
                                'FIELD_VERIFICATION', 
                                'COMPLETED', 
                                'ACCEPTED', 
                                'ARCHIVED'
                            )),
    visibility              TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'CONTROLLED', 'RESTRICTED')),
    is_seed                 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rec_project_status ON recovery_project(status);
CREATE INDEX IF NOT EXISTS idx_rec_project_event ON recovery_project(event_id);
CREATE INDEX IF NOT EXISTS idx_rec_project_community ON recovery_project(community_id);
CREATE INDEX IF NOT EXISTS idx_rec_project_seed ON recovery_project(is_seed);

CREATE TABLE IF NOT EXISTS recovery_task (
    task_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID REFERENCES recovery_project(project_id) ON DELETE CASCADE,
    need_id             UUID REFERENCES recovery_need(need_id) ON DELETE SET NULL,
    task_type           TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    authority_name      TEXT,
    implementer_org_id  UUID REFERENCES organisation(organisation_id),
    assigned_to         TEXT,
    resources           JSONB DEFAULT '[]'::jsonb,
    milestones          JSONB DEFAULT '[]'::jsonb,
    evidence            JSONB DEFAULT '[]'::jsonb,
    status              TEXT NOT NULL DEFAULT 'PLANNED' 
                        CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'FIELD_VERIFICATION', 'COMPLETED', 'BLOCKED')),
    target_date         DATE,
    completed_at        TIMESTAMPTZ,
    is_seed             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rec_task_project ON recovery_task(project_id);
CREATE INDEX IF NOT EXISTS idx_rec_task_need ON recovery_task(need_id);
CREATE INDEX IF NOT EXISTS idx_rec_task_status ON recovery_task(status);
CREATE INDEX IF NOT EXISTS idx_rec_task_seed ON recovery_task(is_seed);
