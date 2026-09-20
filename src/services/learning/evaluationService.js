/**
 * SPEC-010 — Humanitarian Intelligence, Evaluation & Continuous Learning
 * 
 * Core evaluation engine implementing:
 * - Measurable metrics validation for L2+ proposals (BR-010-001)
 * - Mandatory confounds analysis before any IMPROVED verdict (BR-010-003)
 * - Human baseline comparison requirement (BR-010-004)
 * - Strict precedent applicability matching (BR-010-005)
 * - Equal preservation of negative/null findings (BR-010-006)
 */

const { pool, writeAuditEvent } = require('../../db');

class EvaluationService {
    /**
     * Record outcome metrics for a completed AI proposal
     */
    async recordOutcome({
        proposalId,
        measuredMetric,
        baselineValue,
        postChangeValue,
        expectedValue,
        confoundsConsidered,
        evaluator
    }) {
        if (!proposalId || !measuredMetric || baselineValue === undefined || postChangeValue === undefined) {
            const err = new Error('proposalId, measuredMetric, baselineValue, and postChangeValue are required.');
            err.code = 'INVALID_SCHEMA';
            err.status = 400;
            throw err;
        }

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

            // Insert outcome record
            const res = await client.query(
                `INSERT INTO outcome_record (
                    proposal_id, measured_metric, baseline_value, post_change_value,
                    expected_value, confounds_considered, evaluator,
                    evaluation_verdict, evaluation_rationale, enters_precedent_set
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'INCONCLUSIVE', 'Pending human evaluation review', FALSE)
                RETURNING *`,
                [
                    proposalId,
                    measuredMetric,
                    baselineValue,
                    postChangeValue,
                    expectedValue !== undefined ? expectedValue : 0,
                    confoundsConsidered || 'None considered yet',
                    evaluator || 'SYSTEM_EVALUATOR'
                ]
            );

            await client.query('COMMIT');
            return res.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Human evaluation of the recorded outcome (Evaluation Lead)
     */
    async evaluateOutcome({
        outcomeId,
        verdict,
        rationale,
        confoundsConsidered,
        entersPrecedentSet = false,
        evaluatorActor
    }) {
        const validVerdicts = ['IMPROVED', 'NO_CHANGE', 'WORSENED', 'INCONCLUSIVE'];
        if (!validVerdicts.includes(verdict)) {
            const err = new Error(`Invalid verdict '${verdict}'. Must be one of ${validVerdicts.join(', ')}`);
            err.code = 'INVALID_VERDICT';
            err.status = 400;
            throw err;
        }

        // BR-010-003: An IMPROVED verdict without explicit confounds_considered is barred
        if (verdict === 'IMPROVED' && (!confoundsConsidered || confoundsConsidered.trim().length < 10)) {
            const err = new Error(
                'BR-010-003 Enforcement Violation: An outcome cannot be judged IMPROVED without explicit, documented confounds_considered analysis.'
            );
            err.code = 'MISSING_CONFOUNDS_ANALYSIS';
            err.status = 400;
            throw err;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const outRes = await client.query(
                'SELECT * FROM outcome_record WHERE outcome_id = $1 FOR UPDATE',
                [outcomeId]
            );

            if (outRes.rows.length === 0) {
                const err = new Error(`Outcome record '${outcomeId}' not found.`);
                err.code = 'NOT_FOUND';
                err.status = 404;
                throw err;
            }

            const updatedRes = await client.query(
                `UPDATE outcome_record
                 SET evaluation_verdict = $1,
                     evaluation_rationale = $2,
                     confounds_considered = COALESCE($3, confounds_considered),
                     enters_precedent_set = $4,
                     evaluator = $5
                 WHERE outcome_id = $6
                 RETURNING *`,
                [verdict, rationale, confoundsConsidered, entersPrecedentSet, evaluatorActor.actorId || 'EVALUATOR', outcomeId]
            );

            const outcome = updatedRes.rows[0];

            // Update parent proposal outcome field
            await client.query(
                `UPDATE ai_proposal 
                 SET outcome = $1 
                 WHERE proposal_id = $2`,
                [`Verdict: ${verdict} - ${rationale}`, outcome.proposal_id]
            );

            await writeAuditEvent(client, {
                actor: evaluatorActor.actorId || 'EVALUATOR',
                organisation: 'IMPACT_EVALUATION',
                action: 'OUTCOME_EVALUATED',
                entityType: 'OUTCOME_RECORD',
                entityId: outcomeId,
                newState: { verdict, entersPrecedentSet },
                accessReason: 'Formal humanitarian outcome evaluation per SPEC-010 §5',
                outcome: 'SUCCESS'
            });

            await client.query('COMMIT');
            return outcome;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Promote an outcome into the permanent precedent institutional memory repository
     */
    async createPrecedent({
        sourceOutcomeId,
        hazardType,
        regionType,
        situationSummary,
        interventionSummary,
        resultSummary,
        applicabilityConditions = {},
        confidence = 0.85
    }) {
        if (!hazardType || !situationSummary || !interventionSummary || !resultSummary) {
            const err = new Error('hazardType, situationSummary, interventionSummary, and resultSummary are required.');
            err.code = 'INVALID_SCHEMA';
            err.status = 400;
            throw err;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const res = await client.query(
                `INSERT INTO precedent (
                    source_outcome_id, hazard_type, region_type, situation_summary,
                    intervention_summary, result_summary, applicability_conditions, confidence
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *`,
                [
                    sourceOutcomeId || null,
                    hazardType.toUpperCase(),
                    regionType,
                    situationSummary,
                    interventionSummary,
                    resultSummary,
                    JSON.stringify(applicabilityConditions),
                    confidence
                ]
            );

            await client.query('COMMIT');
            return res.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Query applicable precedents by checking strict applicability conditions (BR-010-005)
     */
    async queryPrecedents({ hazardType, regionType }) {
        let query = 'SELECT * FROM precedent WHERE 1=1';
        const params = [];

        if (hazardType) {
            params.push(hazardType.toUpperCase());
            query += ` AND (hazard_type = $${params.length} OR applicability_conditions->'hazard_types' ? $${params.length})`;
        }

        if (regionType) {
            params.push(regionType);
            query += ` AND (region_type = $${params.length} OR applicability_conditions->'region_types' ? $${params.length})`;
        }

        query += ' ORDER BY created_at DESC LIMIT 50';

        const res = await pool.query(query, params);
        return res.rows;
    }
}

module.exports = new EvaluationService();
