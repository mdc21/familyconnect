const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { onAssistanceRequestCreated } = require('../../services/notifications');

const router = express.Router({ mergeParams: true });

/**
 * POST /api/v1/cases/:caseId/assistance — SPEC-003 §3.4.
 * Actors: FAMILY, PROXY. Records a FamilyNeed + AssistanceRequest
 * (SPEC-002 §27/§28). Triggers a notification to the receiving
 * organisation via the minimum-necessary-disclosure pipeline (SPEC-005 §12).
 */
router.post('/:caseId/assistance', async (req, res, next) => {
    if (!['FAMILY', 'PROXY', 'CASE_WORKER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    const { needType, priority, description, receivingOrganisationId } = req.body || {};
    if (!needType) return next(new ProblemError('INVALID_SCHEMA', 'needType is required', req.originalUrl));

    let client;
    try {
        client = await pool.connect();
    } catch (connectErr) {
        // SPEC-003 §6: a DB outage is a 503 Degraded Mode, not an unhandled
        // rejection — this is the one failure mode every write handler
        // shares, so it is worth getting right everywhere at once.
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        await client.query('BEGIN');

        const need = await client.query(
            `INSERT INTO family_need (case_id, need_type) VALUES ($1,$2) RETURNING need_id`,
            [req.params.caseId, needType],
        );

        const assistance = await client.query(
            `INSERT INTO assistance_request
                (case_id, need_id, requested_service, receiving_organisation, priority, status, target_resolution_at)
             VALUES ($1,$2,$3,$4,$5,'TRIAGED', now() + interval '6 hours') RETURNING *`,
            [req.params.caseId, need.rows[0].need_id, description || needType, receivingOrganisationId || null, priority || 'MEDIUM'],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'ASSISTANCE_REQUESTED', entityType: 'AssistanceRequest',
            entityId: assistance.rows[0].assistance_request_id, newState: { status: 'TRIAGED', needType }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');

        // Notification is best-effort and outside the write transaction —
        // a delivery failure must never roll back the assistance request itself.
        onAssistanceRequestCreated({
            caseId: req.params.caseId,
            assistanceRequestId: assistance.rows[0].assistance_request_id,
            receivingOrganisationId,
        }).catch((e) => console.error('notification dispatch failed', e));

        res.status(201).json({
            assistanceRequestId: assistance.rows[0].assistance_request_id,
            caseId: req.params.caseId,
            status: 'TRIAGED',
            targetResolutionWindow: 'Within 6 hours',
            createdAt: assistance.rows[0].created_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
