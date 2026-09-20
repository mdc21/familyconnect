/**
 * SPEC-009 — AI Governance & Platform Engineering Express Routes
 */

const express = require('express');
const router = express.Router();
const agentGovernance = require('../../services/ai/agentGovernance');
const killSwitch = require('../../services/ai/killSwitch');
const { requireActor } = require('../../middleware/actor');
const { requireAssuranceLevel } = require('../../middleware/assurance');
const { ProblemError } = require('../../middleware/problems');
const { pool } = require('../../db');

// 1. POST /api/v1/ai/proposals — Submit AI proposal
router.post('/proposals', async (req, res, next) => {
    try {
        const {
            agentId,
            trigger,
            problemStatement,
            evidenceRefs,
            affectedCapability,
            proposedChange,
            alternatives,
            expectedOutcome,
            uncertainty,
            impactClass,
            riskAssessment,
            dependencies,
            testPlan,
            rollbackPlan,
            humanDecisionOwner
        } = req.body || {};

        if (!agentId || !problemStatement || !affectedCapability || !proposedChange || !impactClass || !expectedOutcome) {
            return next(new ProblemError(
                'INVALID_SCHEMA',
                'agentId, problemStatement, affectedCapability, proposedChange, expectedOutcome, and impactClass are required fields.',
                req.originalUrl
            ));
        }

        const result = await agentGovernance.createProposal({
            agentId,
            trigger: trigger || 'AUTOMATED_OBSERVATION',
            problemStatement,
            evidenceRefs,
            affectedCapability,
            proposedChange,
            alternatives,
            expectedOutcome,
            uncertainty,
            impactClass,
            riskAssessment,
            dependencies,
            testPlan,
            rollbackPlan,
            humanDecisionOwner: humanDecisionOwner || 'COORDINATOR'
        });

        res.status(result.consolidated ? 200 : 201).json(result);
    } catch (err) {
        if (err.code === 'TIER_MISLABEL_DETECTED') {
            return res.status(400).json({
                type: 'https://api.familyconnect.org/v1/problems/tier-mislabel',
                title: 'Tier Mislabel Detected',
                status: 400,
                detail: err.message,
                code: 'FC_ERR_TIER_MISLABEL'
            });
        }
        if (err.code === 'PROPOSAL_RATE_LIMIT_EXCEEDED') {
            return res.status(429).json({
                type: 'https://api.familyconnect.org/v1/problems/rate-limit-exceeded',
                title: 'Proposal Rate Limit Exceeded',
                status: 429,
                detail: err.message,
                code: 'FC_ERR_RATE_LIMIT'
            });
        }
        if (err.code === 'AGENT_SUSPENDED' || err.code === 'AGENT_FORBIDDEN') {
            return res.status(403).json({
                type: 'https://api.familyconnect.org/v1/problems/forbidden',
                title: 'Forbidden',
                status: 403,
                detail: err.message,
                code: 'FC_ERR_AGENT_BLOCKED'
            });
        }
        next(err);
    }
});

// 2. GET /api/v1/ai/proposals — List proposals
router.get('/proposals', requireActor('CASE_WORKER', 'AUTHORITY', 'ADMIN'), async (req, res, next) => {
    try {
        const { decision, impact_class, agent_id } = req.query;
        let query = 'SELECT * FROM ai_proposal WHERE 1=1';
        const params = [];

        if (decision) {
            params.push(decision);
            query += ` AND decision = $${params.length}`;
        }
        if (impact_class) {
            params.push(impact_class);
            query += ` AND impact_class = $${params.length}`;
        }
        if (agent_id) {
            params.push(agent_id);
            query += ` AND agent_id = $${params.length}`;
        }

        query += ' ORDER BY created_at DESC LIMIT 100';

        const result = await pool.query(query, params);
        res.json({ proposals: result.rows });
    } catch (err) {
        next(err);
    }
});

// 3. GET /api/v1/ai/proposals/:id — Get proposal detail
router.get('/proposals/:id', requireActor('CASE_WORKER', 'AUTHORITY', 'ADMIN'), async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT * FROM ai_proposal WHERE proposal_id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                type: 'https://api.familyconnect.org/v1/problems/resource-not-found',
                title: 'Proposal Not Found',
                status: 404,
                code: 'FC_ERR_404_NOT_FOUND'
            });
        }
        res.json({ proposal: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// 4. POST /api/v1/ai/proposals/:id/decision — Submit human decision
router.post('/proposals/:id/decision', requireActor('CASE_WORKER', 'AUTHORITY', 'ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const { decision, rationale, modifications } = req.body || {};
        if (!decision || !rationale) {
            return next(new ProblemError(
                'INVALID_SCHEMA',
                'decision and rationale are mandatory for recording human review.',
                req.originalUrl
            ));
        }

        const updated = await agentGovernance.submitDecision({
            proposalId: req.params.id,
            actor: req.actor,
            decision,
            rationale,
            modifications
        });

        res.json({ message: `Decision registered as ${decision}`, proposal: updated });
    } catch (err) {
        if (err.code === 'INSUFFICIENT_AUTHORITY_FOR_TIER') {
            return res.status(403).json({
                type: 'https://api.familyconnect.org/v1/problems/insufficient-authority',
                title: 'Insufficient Authority For Tier',
                status: 403,
                detail: err.message,
                code: 'FC_ERR_INSUFFICIENT_TIER_AUTHORITY'
            });
        }
        next(err);
    }
});

// 4b. GET /api/v1/ai/agents — List all registered agents with fleet status
router.get('/agents', requireActor('CASE_WORKER', 'AUTHORITY', 'ADMIN'), async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT agent_id, agent_role, agent_role AS agent_class, scoped_permissions, max_proposal_rate, max_proposal_rate AS max_rate_per_hour, status, suspended_by, suspended_at, created_at 
             FROM agent_identity 
             ORDER BY agent_id ASC`
        );
        res.json({ agents: result.rows });
    } catch (err) {
        next(err);
    }
});

// 5. POST /api/v1/ai/agents/:id/suspend — Emergency kill switch (ADMIN only)
router.post('/agents/:id/suspend', requireActor('ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const { reason } = req.body || {};
        const suspendedBy = req.actor?.actorId || 'ADMIN';
        const result = await killSwitch.suspendAgent({
            agentId: req.params.id,
            suspendedBy,
            reason: reason || 'Emergency administrative kill switch triggered.'
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// 6. POST /api/v1/ai/agents/:id/reinstate — Reactivate agent (ADMIN only)
router.post('/agents/:id/reinstate', requireActor('ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const { reason } = req.body || {};
        const reinstatedBy = req.actor?.actorId || 'ADMIN';
        const result = await killSwitch.reinstateAgent({
            agentId: req.params.id,
            reinstatedBy,
            reason: reason || 'Administrative agent reinstatement.'
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// 7. GET /api/v1/ai/agents/:id/actions — Agent action ledger
router.get('/agents/:id/actions', requireActor('ADMIN', 'AUTHORITY'), async (req, res, next) => {
    try {
        const actions = await pool.query(
            `SELECT * FROM audit_event 
             WHERE actor = $1 
             ORDER BY timestamp DESC LIMIT 200`,
            [req.params.id]
        );
        res.json({ agentId: req.params.id, actions: actions.rows });
    } catch (err) {
        next(err);
    }
});

// 8. POST /api/v1/ai/runs — Create execution run for approved proposal
router.post('/runs', async (req, res, next) => {
    try {
        const { proposalId, agentId, plan, tools } = req.body || {};
        if (!proposalId || !agentId) {
            return next(new ProblemError('INVALID_SCHEMA', 'proposalId and agentId are required.', req.originalUrl));
        }

        const run = await agentGovernance.createExecutionRun({
            proposalId,
            agentId,
            plan,
            tools
        });

        res.status(201).json({ run });
    } catch (err) {
        if (err.code === 'UNAPPROVED_PROPOSAL_EXECUTION') {
            return res.status(412).json({
                type: 'https://api.familyconnect.org/v1/problems/precondition-failed',
                title: 'Precondition Failed',
                status: 412,
                detail: err.message,
                code: 'FC_ERR_UNAPPROVED_PROPOSAL'
            });
        }
        next(err);
    }
});

module.exports = router;
