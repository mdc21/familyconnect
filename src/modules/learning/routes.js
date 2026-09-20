/**
 * SPEC-010 — Humanitarian Intelligence & Learning Express Routes
 */

const express = require('express');
const router = express.Router();
const evaluationService = require('../../services/learning/evaluationService');
const { requireActor } = require('../../middleware/actor');
const { requireAssuranceLevel } = require('../../middleware/assurance');
const { ProblemError } = require('../../middleware/problems');

// 1. POST /api/v1/learning/outcomes — Record outcome measurement
router.post('/outcomes', async (req, res, next) => {
    try {
        const {
            proposalId,
            measuredMetric,
            baselineValue,
            postChangeValue,
            expectedValue,
            confoundsConsidered,
            evaluator
        } = req.body || {};

        const outcome = await evaluationService.recordOutcome({
            proposalId,
            measuredMetric,
            baselineValue,
            postChangeValue,
            expectedValue,
            confoundsConsidered,
            evaluator: evaluator || req.actor?.actorId || 'SYSTEM_EVALUATOR'
        });

        res.status(201).json({ message: 'Outcome recorded successfully.', outcome });
    } catch (err) {
        next(err);
    }
});

// 2. POST /api/v1/learning/outcomes/:id/evaluate — Human evaluation
router.post('/outcomes/:id/evaluate', requireActor('CASE_WORKER', 'AUTHORITY', 'ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const { verdict, rationale, confoundsConsidered, entersPrecedentSet } = req.body || {};
        if (!verdict || !rationale) {
            return next(new ProblemError(
                'INVALID_SCHEMA',
                'verdict and rationale are required for formal evaluation.',
                req.originalUrl
            ));
        }

        const outcome = await evaluationService.evaluateOutcome({
            outcomeId: req.params.id,
            verdict,
            rationale,
            confoundsConsidered,
            entersPrecedentSet: Boolean(entersPrecedentSet),
            evaluatorActor: req.actor
        });

        res.json({ message: `Outcome evaluated as ${verdict}.`, outcome });
    } catch (err) {
        if (err.code === 'MISSING_CONFOUNDS_ANALYSIS') {
            return res.status(400).json({
                type: 'https://api.familyconnect.org/v1/problems/missing-confounds',
                title: 'Missing Confounds Analysis',
                status: 400,
                detail: err.message,
                code: 'FC_ERR_MISSING_CONFOUNDS'
            });
        }
        next(err);
    }
});

// 3. POST /api/v1/learning/precedents — Create permanent precedent
router.post('/precedents', requireActor('AUTHORITY', 'ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const {
            sourceOutcomeId,
            hazardType,
            regionType,
            situationSummary,
            interventionSummary,
            resultSummary,
            applicabilityConditions,
            confidence
        } = req.body || {};

        const precedent = await evaluationService.createPrecedent({
            sourceOutcomeId,
            hazardType,
            regionType,
            situationSummary,
            interventionSummary,
            resultSummary,
            applicabilityConditions,
            confidence
        });

        res.status(201).json({ message: 'Precedent recorded into institutional memory.', precedent });
    } catch (err) {
        next(err);
    }
});

// 4. GET /api/v1/learning/precedents — Query applicable precedents
router.get('/precedents', async (req, res, next) => {
    try {
        const { hazard_type, region_type } = req.query;
        const precedents = await evaluationService.queryPrecedents({
            hazardType: hazard_type,
            regionType: region_type
        });

        res.json({ count: precedents.length, precedents });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
