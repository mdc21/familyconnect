const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireAssuranceLevel } = require('../../middleware/assurance');
const { requireIdempotencyKey } = require('../../middleware/idempotency');

const router = express.Router();

/**
 * POST /api/v1/cases/:caseId/handovers
 * SPEC-003 §3.5. Formalizes long-term handover to external statutory
 * systems (e.g. ICRC Tracing). BR-014: external handover preserves
 * original history — this only ever inserts an ExternalCaseReference and
 * flips case status to TRANSFERRED; it never deletes or rewrites prior
 * case_record/information_update/audit_event rows. Requires IAL-2
 * (SPEC-004 §5): transferring a case out of FamilyConnect entirely is a
 * one-way, high-consequence action.
 */
router.post('/:caseId/handovers', requireAssuranceLevel('IAL-2'), requireIdempotencyKey, async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connectErr) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        if (!['AUTHORITY', 'ADMIN'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        await client.query('BEGIN');
        const {
            receivingOrganisationId, receivingSystem, handoverReason,
            externalCaseReference, dataCategoriesTransferred, authorisedBy,
        } = req.body;
        if (!handoverReason || !authorisedBy) {
            throw new ProblemError('INVALID_SCHEMA', 'handoverReason and authorisedBy are required', req.originalUrl);
        }

        const handover = await client.query(
            `INSERT INTO case_handover
                (case_id, receiving_organisation, receiving_system, external_case_reference,
                 handover_reason, data_categories_transferred, authorised_by, acknowledgement, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,false,'PENDING') RETURNING *`,
            [req.params.caseId, receivingOrganisationId || null, receivingSystem, externalCaseReference,
                handoverReason, dataCategoriesTransferred || [], authorisedBy],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'CASE_HANDOVER_INITIATED', entityType: 'CaseHandover',
            entityId: handover.rows[0].handover_id, newState: { status: 'PENDING', externalCaseReference }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(202).json({
            handoverId: handover.rows[0].handover_id, caseId: req.params.caseId,
            status: 'PENDING', externalCaseReference
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

router.post('/:caseId/handovers/:handoverId/acknowledge', requireAssuranceLevel('IAL-2'), requireIdempotencyKey, async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connectErr) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        if (!['AUTHORITY', 'ADMIN'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        await client.query('BEGIN');

        // Note: For case handovers, we don't have a receiving_officer column in the schema.
        // We'll rely on the actor being an AUTHORITY/ADMIN from the receiving organization.
        const check = await client.query('SELECT * FROM case_handover WHERE handover_id = $1 AND case_id = $2 FOR UPDATE', [req.params.handoverId, req.params.caseId]);
        if (check.rows.length === 0) throw new ProblemError('NOT_FOUND', 'Handover not found', req.originalUrl);
        if (check.rows[0].status !== 'PENDING') throw new ProblemError('ILLEGAL_TRANSITION', 'Handover is not pending', req.originalUrl);

        const handover = await client.query(
            `UPDATE case_handover SET status = 'COMPLETED', acknowledgement = true WHERE handover_id = $1 RETURNING *`,
            [req.params.handoverId]
        );

        await client.query(
            `INSERT INTO external_case_reference (case_id, system_name, external_case_id, reference_type)
             VALUES ($1,$2,$3,'HANDOVER')`,
            [req.params.caseId, handover.rows[0].receiving_system, handover.rows[0].external_case_reference],
        );

        await client.query(`UPDATE case_record SET status = 'TRANSFERRED', version = version + 1 WHERE case_id::text = $1 OR case_reference = $1`, [req.params.caseId]);

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'CASE_EXTERNALLY_TRANSFERRED', entityType: 'CaseHandover',
            entityId: handover.rows[0].handover_id, newState: { status: 'TRANSFERRED', externalCaseReference: handover.rows[0].external_case_reference }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.json({
            handoverId: handover.rows[0].handover_id, caseId: req.params.caseId,
            caseStatus: 'TRANSFERRED', externalCaseReference: handover.rows[0].external_case_reference, originalHistoryPreserved: true,
            transferredAt: handover.rows[0].transferred_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
