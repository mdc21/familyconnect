/**
 * Test Suite: SPEC-010 Humanitarian Intelligence, Evaluation & Continuous Learning
 * Quality Gates Tested:
 * - G-Learn-1 / G-Learn-4: Outcome measurement with baseline and post-change values
 * - G-Learn-2 / BR-010-003: Mandatory confounds analysis check for IMPROVED verdicts
 * - G-Learn-2 / BR-010-006: Retention and equal prominence of NO_CHANGE / WORSENED verdicts
 * - G-Learn-3 / BR-010-005: Precedent applicability matching by hazard and region
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db');
const evaluationService = require('../src/services/learning/evaluationService');
const agentGovernance = require('../src/services/ai/agentGovernance');

describe('SPEC-010 Humanitarian Intelligence & Evaluation Engine', () => {
    let testProposalId = null;
    let testOutcomeId = null;

    before(async () => {
        // Clean up prior test records (children first to satisfy FKs)
        await pool.query(`DELETE FROM precedent WHERE source_outcome_id IN (SELECT outcome_id FROM outcome_record WHERE proposal_id IN (SELECT proposal_id FROM ai_proposal WHERE trigger = 'EVAL_TEST'))`);
        await pool.query(`DELETE FROM outcome_record WHERE proposal_id IN (SELECT proposal_id FROM ai_proposal WHERE trigger = 'EVAL_TEST')`);
        await pool.query(`DELETE FROM ai_proposal WHERE trigger = 'EVAL_TEST'`);

        // Create an approved test proposal to evaluate
        const prop = await agentGovernance.createProposal({
            agentId: 'A04-PLANNER',
            trigger: 'EVAL_TEST',
            problemStatement: 'Shelter intake response time lag',
            affectedCapability: 'platform_workflow_shelter',
            proposedChange: 'Automated SMS intake validation form',
            expectedOutcome: 'Reduce time-to-first-response from 14h to 4h',
            impactClass: 'L2'
        });

        testProposalId = prop.proposal ? prop.proposal.proposal_id : prop.proposalId;

        await agentGovernance.submitDecision({
            proposalId: testProposalId,
            actor: { actorClass: 'ADMIN', actorId: 'eval-director' },
            decision: 'APPROVED',
            rationale: 'Approved for evaluation test trial'
        });
    });

    it('G-Learn-1: Record outcome measurement with baseline and post-change metrics', async () => {
        const outcome = await evaluationService.recordOutcome({
            proposalId: testProposalId,
            measuredMetric: 'median_time_to_first_response_hours',
            baselineValue: 14.2,
            postChangeValue: 4.5,
            expectedValue: 4.0,
            confoundsConsidered: 'Weather clear during measurement window; communication networks restored',
            evaluator: 'eval-lead-dr-kiran'
        });

        assert.ok(outcome.outcome_id);
        assert.equal(outcome.evaluation_verdict, 'INCONCLUSIVE');
        assert.equal(Number(outcome.baseline_value), 14.2);
        assert.equal(Number(outcome.post_change_value), 4.5);
        testOutcomeId = outcome.outcome_id;
    });

    it('BR-010-003: An IMPROVED verdict is rejected if confounds_considered is empty or superficial', async () => {
        await assert.rejects(
            async () => {
                await evaluationService.evaluateOutcome({
                    outcomeId: testOutcomeId,
                    verdict: 'IMPROVED',
                    rationale: 'Metrics looked much better',
                    confoundsConsidered: '', // Empty confounds
                    evaluatorActor: { actorClass: 'ADMIN', actorId: 'eval-director' }
                });
            },
            (err) => {
                assert.equal(err.code, 'MISSING_CONFOUNDS_ANALYSIS');
                assert.equal(err.status, 400);
                return true;
            }
        );
    });

    it('Human Evaluation: Legitimate evaluation with confounds updates proposal outcome', async () => {
        const evaluated = await evaluationService.evaluateOutcome({
            outcomeId: testOutcomeId,
            verdict: 'IMPROVED',
            rationale: 'Direct time-to-first-response reduction observed consistently over 7-day monitoring window.',
            confoundsConsidered: 'Controlled for volunteer surge by comparing response rates across unaffected neighboring districts.',
            entersPrecedentSet: true,
            evaluatorActor: { actorClass: 'ADMIN', actorId: 'eval-director' }
        });

        assert.equal(evaluated.evaluation_verdict, 'IMPROVED');
        assert.equal(evaluated.enters_precedent_set, true);

        // Verify parent proposal has outcome populated
        const prop = await pool.query('SELECT outcome FROM ai_proposal WHERE proposal_id = $1', [testProposalId]);
        assert.ok(prop.rows[0].outcome.includes('Verdict: IMPROVED'));
    });

    it('G-Learn-2 / BR-010-006: Retention and promotion of negative or null findings (NO_CHANGE/WORSENED)', async () => {
        const negativePrecedent = await evaluationService.createPrecedent({
            sourceOutcomeId: testOutcomeId,
            hazardType: 'FLOOD',
            regionType: 'RURAL_MOUNTAIN',
            situationSummary: 'Cellular app push notification alerts in mountainous terrain',
            interventionSummary: 'Deployed rich smartphone app notification feed',
            resultSummary: 'NO_CHANGE: Zero increase in shelter registration due to severe power outages and 2G connectivity limits.',
            applicabilityConditions: {
                hazard_types: ['FLOOD', 'GLACIAL_LAKE_OUTBURST'],
                connectivity: 'LOW_BANDWIDTH'
            },
            confidence: 0.95
        });

        assert.ok(negativePrecedent.precedent_id);
        assert.ok(negativePrecedent.result_summary.includes('NO_CHANGE'));

        // Query memory: Precedent must be retrievable
        const precedents = await evaluationService.queryPrecedents({ hazardType: 'FLOOD' });
        const found = precedents.some(p => p.precedent_id === negativePrecedent.precedent_id);
        assert.equal(found, true, 'Negative precedent must be retained and retrievable as institutional memory');
    });

    it('G-Learn-3 / BR-010-005: Strict applicability matching rejects unrelated hazard precedent', async () => {
        // Query for TSUNAMI should not return FLOOD precedent
        const tsunamiPrecedents = await evaluationService.queryPrecedents({ hazardType: 'TSUNAMI' });
        const falseMatch = tsunamiPrecedents.some(p => p.hazard_type === 'FLOOD');
        assert.equal(falseMatch, false, 'Precedents must strictly match hazard applicability conditions');
    });
});
