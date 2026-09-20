/**
 * SPEC-009 — Agentic Platform Engineering, Governance & Continuous Improvement
 * 
 * Core governance engine implementing:
 * - Least-privilege scoped permissions per AgentIdentity (§5)
 * - Anti-DoS proposal volume rate limiting & consolidation (BR-009-011)
 * - Six-Tier human decision authority model (L0–L5) (§8)
 * - Anti-tampering / tier-mislabeling guardrail check (BR-009-014)
 * - Enforcement that execution runs require approved proposals (BR-009-013)
 */

const { pool, writeAuditEvent } = require('../../db');

// Capability-to-minimum-tier risk mapping per SPEC-009 §8
const CAPABILITY_MINIMUM_TIERS = {
    'documentation': 'L0',
    'internal_analytics': 'L0',
    'cache_refresh': 'L1',
    'worker_restart': 'L1',
    'monitoring_threshold': 'L1',
    'new_user_journey': 'L2',
    'new_api_field': 'L2',
    'module_activation': 'L2',
    'platform_workflow': 'L2',
    'safeguarding': 'L3',
    'identity_matching': 'L3',
    'death_status': 'L3',
    'emergency_alert': 'L3',
    'vulnerable_person_prioritisation': 'L3',
    'access_control': 'L4',
    'authentication': 'L4',
    'production_data_policy': 'L4',
    'agent_permissions': 'L4',
    'security_containment': 'L4',
    'approval_thresholds': 'L5',
    'authority_of_record': 'L5',
    'data_retention_rules': 'L5',
    'agent_governance_policy': 'L5'
};

const TIER_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];

function getMinimumTierForCapability(capability) {
    if (!capability) return 'L2';
    const norm = capability.toLowerCase().trim();
    for (const [key, tier] of Object.entries(CAPABILITY_MINIMUM_TIERS)) {
        if (norm.includes(key)) return tier;
    }
    return 'L2'; // Default safe tier for unspecified changes
}

function isTierSufficient(declaredTier, requiredTier) {
    const declaredIdx = TIER_ORDER.indexOf(declaredTier);
    const requiredIdx = TIER_ORDER.indexOf(requiredTier);
    return declaredIdx >= requiredIdx;
}

class AgentGovernanceService {
    /**
     * Look up agent identity and verify status and permissions
     */
    async getAgentIdentity(agentId) {
        const res = await pool.query(
            'SELECT * FROM agent_identity WHERE agent_id = $1',
            [agentId]
        );
        return res.rows[0] || null;
    }

    /**
     * Verify agent is active and permitted for an action
     */
    async assertAgentPermission(agentId, requiredPermission) {
        const agent = await this.getAgentIdentity(agentId);
        if (!agent) {
            const err = new Error(`Agent identity '${agentId}' not found.`);
            err.code = 'AGENT_NOT_FOUND';
            err.status = 404;
            throw err;
        }

        if (agent.status === 'SUSPENDED') {
            const err = new Error(`Agent '${agentId}' is SUSPENDED. All operations halted.`);
            err.code = 'AGENT_SUSPENDED';
            err.status = 403;
            throw err;
        }

        if (requiredPermission && !agent.scoped_permissions.includes(requiredPermission)) {
            const err = new Error(`Agent '${agentId}' lacks required permission '${requiredPermission}'.`);
            err.code = 'AGENT_FORBIDDEN';
            err.status = 403;
            throw err;
        }

        return agent;
    }

    /**
     * Submit a new AI Proposal with BR-009-011 and BR-009-014 guardrails
     */
    async createProposal({
        agentId,
        trigger,
        problemStatement,
        evidenceRefs = [],
        affectedCapability,
        proposedChange,
        alternatives = [],
        expectedOutcome,
        uncertainty = 0.0,
        impactClass,
        riskAssessment = {},
        dependencies = [],
        testPlan = {},
        rollbackPlan = '',
        humanDecisionOwner = 'COORDINATOR',
        expiresHours = 48
    }) {
        const agent = await this.assertAgentPermission(agentId, 'proposals:write');

        // BR-009-014: Check tier mislabeling
        const minimumRequiredTier = getMinimumTierForCapability(affectedCapability);
        if (!isTierSufficient(impactClass, minimumRequiredTier)) {
            const err = new Error(
                `BR-009-014 Tier Mismatch Violation: Capability '${affectedCapability}' requires minimum impact class '${minimumRequiredTier}', but proposal declared '${impactClass}'. Self-downgrading risk is prohibited.`
            );
            err.code = 'TIER_MISLABEL_DETECTED';
            err.status = 400;
            throw err;
        }

        // BR-009-011: Rate limiting per agent identity
        const rateRes = await pool.query(
            `SELECT COUNT(*) as count FROM ai_proposal 
             WHERE agent_id = $1 AND created_at > now() - interval '1 hour'`,
            [agentId]
        );
        const hourlyCount = parseInt(rateRes.rows[0].count, 10);
        if (hourlyCount >= agent.max_proposal_rate) {
            const err = new Error(
                `BR-009-011 Rate Limit Exceeded: Agent '${agentId}' has exceeded hourly quota of ${agent.max_proposal_rate} proposals.`
            );
            err.code = 'PROPOSAL_RATE_LIMIT_EXCEEDED';
            err.status = 429;
            throw err;
        }

        // BR-009-011: Near-duplicate consolidation
        // Check if there is an existing pending proposal for the same capability with identical or overlapping trigger
        const dupRes = await pool.query(
            `SELECT proposal_id, problem_statement FROM ai_proposal 
             WHERE affected_capability = $1 AND decision = 'PENDING' 
             LIMIT 1`,
            [affectedCapability]
        );

        if (dupRes.rows.length > 0) {
            // Consolidate into existing proposal evidence rather than creating spam
            const existingId = dupRes.rows[0].proposal_id;
            await pool.query(
                `UPDATE ai_proposal 
                 SET evidence_refs = evidence_refs || $1::jsonb,
                     uncertainty = LEAST(uncertainty, $2),
                     updated_at = now()
                 WHERE proposal_id = $3`,
                [JSON.stringify(evidenceRefs), uncertainty, existingId]
            );

            return {
                consolidated: true,
                proposalId: existingId,
                message: `BR-009-011: Consolidated proposal into existing active pending proposal ${existingId}.`
            };
        }

        // Insert new proposal
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const insertRes = await client.query(
                `INSERT INTO ai_proposal (
                    agent_id, trigger, problem_statement, evidence_refs,
                    affected_capability, proposed_change, alternatives,
                    expected_outcome, uncertainty, impact_class, risk_assessment,
                    dependencies, test_plan, rollback_plan, human_decision_owner,
                    expires_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now() + ($16 || ' hours')::interval)
                RETURNING *`,
                [
                    agentId, trigger, problemStatement, JSON.stringify(evidenceRefs),
                    affectedCapability, proposedChange, JSON.stringify(alternatives),
                    expectedOutcome, uncertainty, impactClass, JSON.stringify(riskAssessment),
                    JSON.stringify(dependencies), JSON.stringify(testPlan), rollbackPlan,
                    humanDecisionOwner, String(expiresHours)
                ]
            );
            const proposal = insertRes.rows[0];

            await writeAuditEvent(client, {
                actor: agentId,
                organisation: 'SYSTEM',
                action: 'AI_PROPOSAL_CREATED',
                entityType: 'AI_PROPOSAL',
                entityId: proposal.proposal_id,
                newState: { impactClass, affectedCapability },
                accessReason: 'Autonomous proposal submission under SPEC-009',
                outcome: 'SUCCESS'
            });

            await client.query('COMMIT');
            return { consolidated: false, proposal };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Submit human decision on proposal (Approve, Reject, Modify, Defer)
     */
    async submitDecision({ proposalId, actor, decision, rationale, modifications = null }) {
        // Verify decision validity
        const validDecisions = ['APPROVED', 'REJECTED', 'MODIFIED', 'DEFERRED'];
        if (!validDecisions.includes(decision)) {
            const err = new Error(`Invalid decision '${decision}'. Must be one of ${validDecisions.join(', ')}`);
            err.code = 'INVALID_DECISION';
            err.status = 400;
            throw err;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const propRes = await client.query(
                'SELECT * FROM ai_proposal WHERE proposal_id = $1 FOR UPDATE',
                [proposalId]
            );
            if (propRes.rows.length === 0) {
                const err = new Error(`Proposal '${proposalId}' not found.`);
                err.code = 'NOT_FOUND';
                err.status = 404;
                throw err;
            }

            const proposal = propRes.rows[0];

            // Tier authorization check per SPEC-009 §8
            // L4 requires ADMIN / Security authority; L5 requires ADMIN / Governance Board
            if (['L4', 'L5'].includes(proposal.impact_class) && actor.actorClass !== 'ADMIN') {
                const err = new Error(
                    `SPEC-009 §8: Decisions on ${proposal.impact_class} proposals require ADMIN / Governance authority.`
                );
                err.code = 'INSUFFICIENT_AUTHORITY_FOR_TIER';
                err.status = 403;
                throw err;
            }

            const updateRes = await client.query(
                `UPDATE ai_proposal 
                 SET decision = $1, 
                     decision_rationale = $2,
                     decided_by = $3,
                     decided_at = now(),
                     updated_at = now()
                 WHERE proposal_id = $4
                 RETURNING *`,
                [decision, rationale, actor.actorId || actor.actorClass, proposalId]
            );

            await writeAuditEvent(client, {
                actor: actor.actorId || actor.actorClass,
                organisation: actor.organisationId || 'GOVERNANCE',
                action: `AI_PROPOSAL_${decision}`,
                entityType: 'AI_PROPOSAL',
                entityId: proposalId,
                previousState: { decision: proposal.decision },
                newState: { decision, rationale },
                accessReason: 'Human decision recorded on AI proposal',
                outcome: 'SUCCESS'
            });

            await client.query('COMMIT');
            return updateRes.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Start execution run for an approved proposal (BR-009-013)
     */
    async createExecutionRun({ proposalId, agentId, plan = {}, tools = [] }) {
        await this.assertAgentPermission(agentId, 'artifacts:write');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const propRes = await client.query(
                'SELECT * FROM ai_proposal WHERE proposal_id = $1',
                [proposalId]
            );

            if (propRes.rows.length === 0) {
                const err = new Error(`Proposal '${proposalId}' not found.`);
                err.code = 'NOT_FOUND';
                err.status = 404;
                throw err;
            }

            const proposal = propRes.rows[0];

            // BR-009-013 invariant: Must be APPROVED
            if (proposal.decision !== 'APPROVED') {
                const err = new Error(
                    `BR-009-013 Invariant Violation: AIExecutionRun may not begin until approval_ref resolves to decision = 'APPROVED'. Current status is '${proposal.decision}'.`
                );
                err.code = 'UNAPPROVED_PROPOSAL_EXECUTION';
                err.status = 412; // Precondition Failed
                throw err;
            }

            const runRes = await client.query(
                `INSERT INTO ai_execution_run (
                    proposal_id, agent_id, plan, tools, status
                ) VALUES ($1, $2, $3, $4, 'RUNNING')
                RETURNING *`,
                [proposalId, agentId, JSON.stringify(plan), tools]
            );

            await client.query('COMMIT');
            return runRes.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}

module.exports = new AgentGovernanceService();
