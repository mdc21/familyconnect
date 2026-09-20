/**
 * Test Suite: SPEC-009 Agent Governance & Platform Engineering
 * Quality Gates Tested:
 * - G-Agent-1: Scoped least-privilege permissions
 * - G-Agent-2: Tier-mislabeling check (BR-009-014)
 * - G-Agent-3: Kill switch suspension & execution run halt (SPEC-009 §7.4 / FR-008-019)
 * - G-Agent-4: Proposal rate limiting & consolidation (BR-009-011)
 * - BR-009-013: Execution run requires approved proposal
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/app');
const { pool } = require('../src/db');
const agentGovernance = require('../src/services/ai/agentGovernance');
const killSwitch = require('../src/services/ai/killSwitch');

describe('SPEC-009 Agentic Governance & Platform Engineering', () => {

    before(async () => {
        // Clean up any test records from prior runs
        await pool.query(`DELETE FROM ai_execution_run WHERE agent_id LIKE 'TEST-%'`);
        await pool.query(`DELETE FROM ai_proposal WHERE agent_id LIKE 'TEST-%'`);

        // Ensure standard agents exist
        await pool.query(`
            INSERT INTO agent_identity (agent_id, agent_role, scoped_permissions, max_proposal_rate, status)
            VALUES 
                ('TEST-OBSERVER', 'Observation Agent', ARRAY['telemetry:read'], 5, 'ACTIVE'),
                ('TEST-PLANNER', 'Planning Agent', ARRAY['proposals:write', 'modules:read'], 5, 'ACTIVE'),
                ('TEST-BUILDER', 'Build Agent', ARRAY['artifacts:write'], 5, 'ACTIVE')
            ON CONFLICT (agent_id) DO UPDATE SET status = 'ACTIVE'
        `);
    });

    it('G-Agent-1: Scoped permissions allow-list enforcement', async () => {
        // TEST-OBSERVER only has telemetry:read, trying to submit a proposal should fail
        await assert.rejects(
            async () => {
                await agentGovernance.createProposal({
                    agentId: 'TEST-OBSERVER',
                    trigger: 'OBSERVATION',
                    problemStatement: 'Unused cache',
                    affectedCapability: 'cache_refresh',
                    proposedChange: 'Flush cache',
                    expectedOutcome: 'Cache hit rate improves',
                    impactClass: 'L1'
                });
            },
            (err) => {
                assert.equal(err.code, 'AGENT_FORBIDDEN');
                assert.equal(err.status, 403);
                return true;
            }
        );
    });

    it('G-Agent-2: Tier-mislabeling detection catches safeguarding change submitted as L1 (BR-009-014)', async () => {
        // Safeguarding capability requires L3 minimum, submitting as L1 must be blocked
        await assert.rejects(
            async () => {
                await agentGovernance.createProposal({
                    agentId: 'TEST-PLANNER',
                    trigger: 'AUTOMATED_SCAN',
                    problemStatement: 'Auto-adjust vulnerable child record sharing',
                    affectedCapability: 'safeguarding_rules',
                    proposedChange: 'Bypass human case worker for expedited approval',
                    expectedOutcome: 'Faster triage',
                    impactClass: 'L1' // Intentional mislabel
                });
            },
            (err) => {
                assert.equal(err.code, 'TIER_MISLABEL_DETECTED');
                assert.equal(err.status, 400);
                return true;
            }
        );
    });

    it('G-Agent-4: Proposal creation and near-duplicate consolidation (BR-009-011)', async () => {
        // First proposal
        const p1 = await agentGovernance.createProposal({
            agentId: 'TEST-PLANNER',
            trigger: 'MANUAL_TEST',
            problemStatement: 'Community page navigation issue',
            affectedCapability: 'new_user_journey',
            proposedChange: 'Add breadcrumbs to recovery view',
            expectedOutcome: 'Reduced bounce rate',
            impactClass: 'L2',
            evidenceRefs: [{ doc: 'test-1' }]
        });

        assert.equal(p1.consolidated, false);
        assert.ok(p1.proposal.proposal_id);

        // Second proposal with identical capability while first is still PENDING -> should consolidate
        const p2 = await agentGovernance.createProposal({
            agentId: 'TEST-PLANNER',
            trigger: 'MANUAL_TEST_2',
            problemStatement: 'Same community page navigation issue',
            affectedCapability: 'new_user_journey',
            proposedChange: 'Add breadcrumbs to recovery view',
            expectedOutcome: 'Reduced bounce rate',
            impactClass: 'L2',
            evidenceRefs: [{ doc: 'test-2' }]
        });

        assert.equal(p2.consolidated, true);
        assert.equal(p2.proposalId, p1.proposal.proposal_id);
    });

    it('BR-009-013: AIExecutionRun rejects execution if proposal is unapproved', async () => {
        // Create an unapproved proposal
        const prop = await agentGovernance.createProposal({
            agentId: 'TEST-PLANNER',
            trigger: 'STAGING_BUILD',
            problemStatement: 'Generate new recovery layout',
            affectedCapability: 'platform_workflow_recovery',
            proposedChange: 'Add staging template',
            expectedOutcome: 'Template generated',
            impactClass: 'L2'
        });

        const proposalId = prop.proposal ? prop.proposal.proposal_id : prop.proposalId;

        // Trying to start execution run before approval must fail with 412
        await assert.rejects(
            async () => {
                await agentGovernance.createExecutionRun({
                    proposalId,
                    agentId: 'TEST-BUILDER',
                    plan: { step: 'compile' }
                });
            },
            (err) => {
                assert.equal(err.code, 'UNAPPROVED_PROPOSAL_EXECUTION');
                assert.equal(err.status, 412);
                return true;
            }
        );

        // Now human approves proposal
        const approved = await agentGovernance.submitDecision({
            proposalId,
            actor: { actorClass: 'ADMIN', actorId: 'admin-lead' },
            decision: 'APPROVED',
            rationale: 'Verified in staging sandbox'
        });
        assert.equal(approved.decision, 'APPROVED');

        // Now execution run succeeds
        const run = await agentGovernance.createExecutionRun({
            proposalId,
            agentId: 'TEST-BUILDER',
            plan: { step: 'compile' }
        });
        assert.ok(run.run_id);
        assert.equal(run.status, 'RUNNING');
    });

    it('G-Agent-3: Kill switch suspends agent, halts running runs, and blocks further action (SPEC-009 §7.4)', async () => {
        // Suspend TEST-BUILDER
        const suspendRes = await killSwitch.suspendAgent({
            agentId: 'TEST-BUILDER',
            suspendedBy: 'security-director',
            reason: 'Security containment drill'
        });

        assert.equal(suspendRes.status, 'SUSPENDED');
        assert.ok(suspendRes.haltedRuns.length >= 1, 'Running execution run must be halted');

        // Check DB state
        const agent = await agentGovernance.getAgentIdentity('TEST-BUILDER');
        assert.equal(agent.status, 'SUSPENDED');

        // Verify suspended agent cannot execute any action
        await assert.rejects(
            async () => {
                await agentGovernance.assertAgentPermission('TEST-BUILDER', 'artifacts:write');
            },
            (err) => {
                assert.equal(err.code, 'AGENT_SUSPENDED');
                assert.equal(err.status, 403);
                return true;
            }
        );

        // Reactivate agent for test hygiene
        await killSwitch.reinstateAgent({
            agentId: 'TEST-BUILDER',
            reinstatedBy: 'security-director',
            reason: 'Test completed'
        });
        const reactivated = await agentGovernance.getAgentIdentity('TEST-BUILDER');
        assert.equal(reactivated.status, 'ACTIVE');
    });
});
