/**
 * SPEC-008 Module M12: Recovery Operations & Gate G8 Release Routes
 * Endpoints for continuous observation loops, agent cost monitoring, and release governance.
 */

const express = require('express');
const router = express.Router();
const recoveryOpsService = require('./service');
const { requireActor } = require('../../middleware/actor');
const { requireAssuranceLevel } = require('../../middleware/assurance');
const { writeLimiter } = require('../../middleware/rateLimit');

// 1. POST /api/v1/ops/observe-gaps — Run automated recovery gap observation cycle
router.post('/ops/observe-gaps', writeLimiter, requireActor('AUTHORITY', 'CASE_WORKER', 'ADMIN', 'PARTNER'), async (req, res, next) => {
    try {
        const { eventId } = req.body || {};
        const results = await recoveryOpsService.observeRecoveryGaps({
            eventId,
            actor: req.actor
        });

        res.json({
            message: 'Recovery gap observation loop executed successfully.',
            ...results
        });
    } catch (err) {
        next(err);
    }
});

// 2. GET /api/v1/ops/gaps-summary — Operational gap summary & recovery health
router.get('/ops/gaps-summary', async (req, res, next) => {
    try {
        const { eventId } = req.query;
        const summary = await recoveryOpsService.getOperationsSummary({ eventId });
        res.json(summary);
    } catch (err) {
        next(err);
    }
});

// 3. GET /api/v1/ops/cost-metrics — Agent compute token and daily donor budget metrics (SPEC-008 §10)
router.get('/ops/cost-metrics', async (req, res, next) => {
    try {
        const metrics = await recoveryOpsService.getAgentCostMetrics();
        res.json(metrics);
    } catch (err) {
        next(err);
    }
});

// 4. POST /api/v1/ops/release-approval — Gate G8 formal production release signoff
router.post('/ops/release-approval', writeLimiter, requireActor('AUTHORITY', 'ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const {
            releaseVersion,
            primaryApproverName,
            primaryApproverRole,
            deputyApproverName,
            deputyApproverRole,
            releaseNotes
        } = req.body || {};

        const certification = await recoveryOpsService.evaluateReleaseGateG8({
            releaseVersion,
            primaryApproverName,
            primaryApproverRole,
            deputyApproverName,
            deputyApproverRole,
            releaseNotes,
            actor: req.actor
        });

        res.status(201).json({
            message: 'Gate G8 Production Release formally ratified and recorded.',
            certification
        });
    } catch (err) {
        next(err);
    }
});

// 5. GET /api/v1/ops/release-status — Check current Gate G8 release state
router.get('/ops/release-status', async (req, res, next) => {
    try {
        const { version } = req.query;
        const status = await recoveryOpsService.getReleaseStatus(version);
        res.json(status);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
