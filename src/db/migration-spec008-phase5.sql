-- ============================================================
-- SPEC-008 Phase 5 Schema Migration
-- Module M12: AI Change & Operations, Continuous Observation,
-- Cost Monitoring (SPEC-008 §10) & Gate G8 Release Verification
-- ============================================================

-- ─── 1. Ensure Phase 5 Agent Identities (SPEC-008 / SPEC-009) ─
INSERT INTO agent_identity (agent_id, agent_role, scoped_permissions, max_proposal_rate)
VALUES
    ('A14-INFRA', 'Infrastructure Intelligence Agent', ARRAY['infra:read', 'proposals:write'], 10),
    ('A15-FUNDING', 'Aid & Funding Tracking Agent', ARRAY['funding:read', 'proposals:write'], 10),
    ('A16-OPS', 'Recovery Operations Sentinel', ARRAY['telemetry:read', 'escalations:write', 'proposals:write'], 20)
ON CONFLICT (agent_id) DO NOTHING;

-- ─── 2. Gate G8 Release Verification Record ──────────────────
CREATE TABLE IF NOT EXISTS gate_release_record (
    release_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_version             TEXT NOT NULL,
    primary_approver_id         TEXT NOT NULL,
    primary_approver_name       TEXT NOT NULL,
    primary_approver_role       TEXT NOT NULL,
    deputy_approver_id          TEXT NOT NULL,
    deputy_approver_name        TEXT NOT NULL,
    deputy_approver_role        TEXT NOT NULL,
    gate_g0_verified            BOOLEAN NOT NULL DEFAULT TRUE,
    gate_g2a_verified           BOOLEAN NOT NULL DEFAULT TRUE,
    gate_g7_verified            BOOLEAN NOT NULL DEFAULT TRUE,
    all_modules_verified        BOOLEAN NOT NULL DEFAULT TRUE,
    audit_integrity_verified    BOOLEAN NOT NULL DEFAULT TRUE,
    slo_latency_verified        BOOLEAN NOT NULL DEFAULT TRUE,
    release_decision            TEXT NOT NULL DEFAULT 'APPROVED' CHECK (release_decision IN ('APPROVED', 'REJECTED', 'CONDITIONAL')),
    release_notes               TEXT,
    approved_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gate_release_ver ON gate_release_record(release_version);
CREATE INDEX IF NOT EXISTS idx_gate_release_decision ON gate_release_record(release_decision);

-- ─── 3. Agent Cost & Compute Token Tracking (SPEC-008 §10) ───
CREATE TABLE IF NOT EXISTS agent_cost_log (
    log_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            TEXT NOT NULL REFERENCES agent_identity(agent_id),
    operation_name      TEXT NOT NULL,
    prompt_tokens       INT NOT NULL DEFAULT 0,
    completion_tokens   INT NOT NULL DEFAULT 0,
    total_cost_usd      NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    is_seed             BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_cost_agent ON agent_cost_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_cost_time ON agent_cost_log(recorded_at);

-- ─── 4. Seed Phase 5 Initial Agent Cost Baseline ─────────────
INSERT INTO agent_cost_log (
    agent_id, operation_name, prompt_tokens, completion_tokens, total_cost_usd, is_seed
) VALUES
    ('A03-NEEDS', 'RESOURCE_MATCH_OBSERVATION', 2450, 480, 0.002930, TRUE),
    ('A03-NEEDS', 'DUPLICATE_NEED_ANALYSIS', 1890, 310, 0.002200, TRUE),
    ('A02-NEWS', 'NEWS_VERIFICATION_CYCLE', 3400, 620, 0.004020, TRUE),
    ('A16-OPS', 'MULTI_MODULE_GAP_DETECTION', 4500, 890, 0.005390, TRUE)
ON CONFLICT DO NOTHING;
