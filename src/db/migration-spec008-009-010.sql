-- ============================================================
-- SPEC-008, SPEC-009, SPEC-010 Schema Migration
-- Community Recovery, Agent Governance, Humanitarian Learning
-- ============================================================

-- ─── 1. Agent Governance Entities (SPEC-009) ─────────────────
CREATE TABLE IF NOT EXISTS agent_identity (
    agent_id            TEXT PRIMARY KEY,
    agent_role          TEXT NOT NULL,
    scoped_permissions  TEXT[] NOT NULL DEFAULT '{}',
    credential_ref      TEXT,
    status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    suspended_by        TEXT,
    suspended_at        TIMESTAMPTZ,
    max_proposal_rate   INT DEFAULT 10,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_proposal (
    proposal_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            TEXT NOT NULL REFERENCES agent_identity(agent_id),
    trigger             TEXT NOT NULL,
    problem_statement   TEXT NOT NULL,
    evidence_refs       JSONB DEFAULT '[]'::jsonb,
    affected_capability TEXT NOT NULL,
    proposed_change     TEXT NOT NULL,
    alternatives        JSONB DEFAULT '[]'::jsonb,
    expected_outcome    TEXT NOT NULL,
    uncertainty         NUMERIC DEFAULT 0.0,
    impact_class        TEXT NOT NULL CHECK (impact_class IN ('L0', 'L1', 'L2', 'L3', 'L4', 'L5')),
    risk_assessment     JSONB DEFAULT '{}'::jsonb,
    dependencies        JSONB DEFAULT '[]'::jsonb,
    test_plan           JSONB DEFAULT '{}'::jsonb,
    rollback_plan       TEXT,
    human_decision_owner TEXT NOT NULL,
    decision            TEXT NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING', 'APPROVED', 'REJECTED', 'MODIFIED', 'DEFERRED')),
    decision_rationale  TEXT,
    decided_by          TEXT,
    decided_at          TIMESTAMPTZ,
    execution_refs      JSONB DEFAULT '[]'::jsonb,
    outcome             TEXT,
    audit_ref           UUID,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_proposal_status ON ai_proposal(decision);
CREATE INDEX IF NOT EXISTS idx_ai_proposal_agent ON ai_proposal(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_proposal_impact ON ai_proposal(impact_class);

CREATE TABLE IF NOT EXISTS ai_execution_run (
    run_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id         UUID NOT NULL REFERENCES ai_proposal(proposal_id),
    agent_id            TEXT NOT NULL REFERENCES agent_identity(agent_id),
    plan                JSONB,
    tools               TEXT[] DEFAULT '{}',
    outputs             JSONB DEFAULT '{}'::jsonb,
    test_results        JSONB DEFAULT '{}'::jsonb,
    deployment_ref      JSONB DEFAULT '{}'::jsonb,
    outcome             TEXT,
    status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'HALTED', 'COMPLETED', 'FAILED')),
    halt_reason         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_execution_proposal ON ai_execution_run(proposal_id);
CREATE INDEX IF NOT EXISTS idx_ai_execution_agent ON ai_execution_run(agent_id);

CREATE TABLE IF NOT EXISTS escalation (
    escalation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger             TEXT NOT NULL,
    impact_class        TEXT NOT NULL CHECK (impact_class IN ('L0', 'L1', 'L2', 'L3', 'L4', 'L5')),
    rationale           TEXT NOT NULL,
    assigned_reviewer   TEXT,
    sla_target          TIMESTAMPTZ,
    decision            TEXT,
    resolution          TEXT,
    status              TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ASSIGNED', 'RESOLVED', 'DISMISSED')),
    created_at          TIMESTAMPTZ DEFAULT now(),
    resolved_at         TIMESTAMPTZ
);

-- ─── 2. Community Recovery Entities (SPEC-008) ───────────────
CREATE TABLE IF NOT EXISTS recovery_need (
    need_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                TEXT REFERENCES disaster_event(event_id),
    originating_request_id  TEXT,
    category                TEXT NOT NULL,
    location                JSONB NOT NULL DEFAULT '{}'::jsonb,
    affected_population     INT DEFAULT 1,
    severity                TEXT NOT NULL DEFAULT 'MEDIUM',
    narrative               TEXT,
    evidence                JSONB DEFAULT '[]'::jsonb,
    provenance              JSONB DEFAULT '{}'::jsonb,
    verification_state      TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_state IN ('UNVERIFIED', 'VERIFIED', 'REJECTED')),
    data_sharing_status     TEXT NOT NULL DEFAULT 'NORMAL' CHECK (data_sharing_status IN ('NORMAL', 'RESTRICTED_PENDING_REVIEW')),
    safeguarding_state      TEXT DEFAULT 'NONE',
    owner_actor_id          TEXT,
    assigned_to             TEXT,
    target_completion_date  DATE,
    status                  TEXT NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED', 'ASSESSED', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_need_status ON recovery_need(status);
CREATE INDEX IF NOT EXISTS idx_recovery_need_event ON recovery_need(event_id);
CREATE INDEX IF NOT EXISTS idx_recovery_need_data_sharing ON recovery_need(data_sharing_status);

CREATE TABLE IF NOT EXISTS need_duplicate_candidate (
    candidate_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    need_id_a           UUID NOT NULL REFERENCES recovery_need(need_id) ON DELETE CASCADE,
    need_id_b           UUID NOT NULL REFERENCES recovery_need(need_id) ON DELETE CASCADE,
    similarity_score    NUMERIC NOT NULL,
    suggested_rationale TEXT,
    status              TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'CONFIRMED_DUPLICATE', 'DISMISSED')),
    reviewed_by         TEXT,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_profile (
    community_id                TEXT PRIMARY KEY,
    name                        TEXT NOT NULL,
    event_id                    TEXT REFERENCES disaster_event(event_id),
    admin_hierarchy             JSONB DEFAULT '{}'::jsonb,
    population_estimate         INT NOT NULL DEFAULT 0,
    min_aggregation_threshold   INT NOT NULL DEFAULT 25,
    min_aggregation_threshold_met BOOLEAN GENERATED ALWAYS AS (population_estimate >= 25) STORED,
    service_states              JSONB DEFAULT '[]'::jsonb,
    created_at                  TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. Humanitarian Intelligence & Learning (SPEC-010) ──────
CREATE TABLE IF NOT EXISTS outcome_record (
    outcome_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id         UUID NOT NULL REFERENCES ai_proposal(proposal_id),
    measured_metric     TEXT NOT NULL,
    baseline_value      NUMERIC NOT NULL,
    post_change_value   NUMERIC NOT NULL,
    expected_value      NUMERIC NOT NULL,
    measurement_window  TSTZRANGE,
    confounds_considered TEXT NOT NULL,
    evaluator           TEXT NOT NULL,
    evaluation_verdict  TEXT NOT NULL CHECK (evaluation_verdict IN ('IMPROVED', 'NO_CHANGE', 'WORSENED', 'INCONCLUSIVE')),
    evaluation_rationale TEXT NOT NULL,
    enters_precedent_set BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_proposal ON outcome_record(proposal_id);
CREATE INDEX IF NOT EXISTS idx_outcome_verdict ON outcome_record(evaluation_verdict);

CREATE TABLE IF NOT EXISTS precedent (
    precedent_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_outcome_id       UUID REFERENCES outcome_record(outcome_id),
    hazard_type             TEXT NOT NULL,
    region_type             TEXT,
    situation_summary       TEXT NOT NULL,
    intervention_summary    TEXT NOT NULL,
    result_summary          TEXT NOT NULL,
    applicability_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence              NUMERIC DEFAULT 0.8,
    created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_precedent_hazard ON precedent(hazard_type);

-- ─── Seed Standard Agent Identities (SPEC-009 §5) ────────────
INSERT INTO agent_identity (agent_id, agent_role, scoped_permissions, max_proposal_rate)
VALUES
    ('A01-OBSERVER', 'Observation Agent', ARRAY['telemetry:read', 'logs:read'], 20),
    ('A02-NEWS', 'Source/Knowledge Agent', ARRAY['news:read', 'news:write', 'provenance:verify'], 15),
    ('A03-NEEDS', 'Needs Intelligence Agent', ARRAY['needs:read', 'analytics:read'], 10),
    ('A04-PLANNER', 'Planning Agent', ARRAY['proposals:write', 'modules:read', 'precedents:read'], 10),
    ('A05-ARCHITECT', 'Architecture Agent', ARRAY['proposals:read', 'specs:write'], 5),
    ('A06-BUILDER', 'Build Agent', ARRAY['artifacts:write', 'staging:write'], 10),
    ('A07-TESTER', 'Test Agent', ARRAY['tests:execute', 'artifacts:read'], 20),
    ('A08-SECURITY', 'Security Agent', ARRAY['audit:read', 'security:scan'], 30),
    ('A09-RELEASE', 'Release Agent', ARRAY['deploy:execute'], 5),
    ('A10-MONITOR', 'Monitoring Agent', ARRAY['health:read', 'metrics:read'], 50),
    ('A11-ADOPTION', 'Adoption Agent', ARRAY['analytics:read', 'ux:evaluate'], 10),
    ('A12-LEARNING', 'Learning Agent', ARRAY['outcomes:write', 'proposals:read', 'precedents:write'], 10),
    ('A13-GOVERNOR', 'Governance Agent', ARRAY['proposals:evaluate', 'agents:audit', 'policies:enforce'], 100)
ON CONFLICT (agent_id) DO NOTHING;
