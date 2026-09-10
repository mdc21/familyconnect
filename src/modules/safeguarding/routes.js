const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireAssuranceLevel } = require('../../middleware/assurance');

const router = express.Router();

/**
 * POST /api/v1/safeguarding/:alertId/handover
 * SPEC-003 §3.5 / SPEC-007 §2.D: "Verify the SafeguardingHandover API
 * requires digital acknowledgment before releasing a minor's record to
 * statutory police systems." Actors: AUTHORITY, CASE_WORKER (Safeguarding
 * Lead only) — enforced narrowly since this is HIGHLY_RESTRICTED, and
 * requires IAL-2 (SPEC-004 §5) regardless of actorClass, since a
 * safeguarding handover is exactly the kind of action a stolen or
 * under-verified CASE_WORKER session must not be able to reach.
 */
router.post('/:alertId/handover', requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connectErr) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        if (!['AUTHORITY', 'CASE_WORKER'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        await client.query('BEGIN');
        const {
            receivingOrganisationId, receivingAuthority,
            interventionType, authorityReference, reason,
        } = req.body;

        const handover = await client.query(
            `INSERT INTO safeguarding_handover
                (safeguarding_alert_id, receiving_organisation, receiving_authority, receiving_officer,
                 intervention_type, reason, authority_reference, acknowledgement, status)
             VALUES ($1,$2,$3,'PENDING_OFFICER',$4,$5,$6,false,'PROPOSED') RETURNING *`,
            [req.params.alertId, receivingOrganisationId || null, receivingAuthority,
                interventionType, reason, authorityReference || null],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'SAFEGUARDING_HANDOVER_PROPOSED', entityType: 'SafeguardingHandover',
            entityId: handover.rows[0].handover_id, newState: { status: 'PROPOSED' }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(202).json({
            handoverId: handover.rows[0].handover_id, alertId: req.params.alertId,
            status: 'PROPOSED',
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

router.post('/:alertId/handover/:handoverId/acknowledge', requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connectErr) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        if (!['AUTHORITY', 'CASE_WORKER'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        await client.query('BEGIN');

        const check = await client.query('SELECT * FROM safeguarding_handover WHERE handover_id = $1 AND safeguarding_alert_id = $2 FOR UPDATE', [req.params.handoverId, req.params.alertId]);
        if (check.rows.length === 0) throw new ProblemError('NOT_FOUND', 'Handover not found', req.originalUrl);
        if (check.rows[0].status !== 'PROPOSED') throw new ProblemError('ILLEGAL_TRANSITION', 'Handover is not proposed', req.originalUrl);

        // Security requirement: C6 - explicitly authenticated receiver identity
        const receivingOfficer = req.actor.actorId;

        const handover = await client.query(
            `UPDATE safeguarding_handover SET status = 'COMPLETED', acknowledgement = true, completed_at = now(), receiving_officer = $1 WHERE handover_id = $2 RETURNING *`,
            [receivingOfficer, req.params.handoverId]
        );

        await client.query(`UPDATE safeguarding_alert SET status = 'HANDED_OVER' WHERE alert_id = $1`, [req.params.alertId]);

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'SAFEGUARDING_HANDOVER_COMPLETED', entityType: 'SafeguardingHandover',
            entityId: handover.rows[0].handover_id, newState: { status: 'COMPLETED', receivingOfficer }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.json({
            handoverId: handover.rows[0].handover_id, alertId: req.params.alertId,
            status: 'COMPLETED', completedAt: handover.rows[0].completed_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/safeguarding/alerts
 * Restricted to AUTHORITY, CASE_WORKER, ADMIN.
 * Returns safeguarding alerts for unaccompanied minors or vulnerable persons.
 */
router.get('/alerts', async (req, res, next) => {
    try {
        if (!['AUTHORITY', 'CASE_WORKER', 'ADMIN'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        const result = await pool.query(
            `SELECT alert_id, case_id, risk_level, concern_type, status, reported_at
             FROM safeguarding_alert
             ORDER BY reported_at DESC LIMIT 50`
        );
        res.json(result.rows.map(r => ({
            alertId: r.alert_id,
            caseId: r.case_id,
            riskLevel: r.risk_level,
            concernType: r.concern_type,
            status: r.status,
            reportedAt: r.reported_at,
        })));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
