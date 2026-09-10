const crypto = require('crypto');
const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router(); // mounted at /api/v1/dna

/**
 * POST /api/v1/dna/requests
 * Public endpoint — no actor class restriction (family members apply without accounts).
 * Creates a dna_sample_request row and returns a tracking reference.
 * FamilyConnect stores NO genetic data; only contact, relationship, and
 * the lab's own reference numbers once received.
 */
router.post('/requests', writeLimiter, async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const {
            requesterName,
            requesterEmail,
            requesterPhone,
            relationship,
            missingPersonName,
            caseReference,
            preferredLocation,
            missingPersonDetails,
        } = req.body;

        if (!requesterName || !requesterName.trim())
            throw new ProblemError('INVALID_SCHEMA', 'requesterName is required', req.originalUrl);
        if (!requesterEmail || !requesterEmail.includes('@'))
            throw new ProblemError('INVALID_SCHEMA', 'requesterEmail must be a valid email', req.originalUrl);
        if (!relationship || !relationship.trim())
            throw new ProblemError('INVALID_SCHEMA', 'relationship is required', req.originalUrl);

        // Generate a unique, human-readable tracking reference
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
        const trackingReference = `DNA-${datePart}-${randPart}`;

        const disasterEventId = req.headers['x-disaster-event-id'] || 'EVENT-NP-TIBET-2026';

        await client.query('BEGIN');

        const row = await client.query(
            `INSERT INTO dna_sample_request
                (tracking_reference, disaster_event_id, requester_name, requester_email,
                 requester_phone, relationship, missing_person_name, case_reference,
                 preferred_location, missing_person_details)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING dna_request_id, tracking_reference, submitted_at`,
            [
                trackingReference,
                disasterEventId,
                requesterName.trim(),
                requesterEmail.trim().toLowerCase(),
                requesterPhone ? requesterPhone.trim() : null,
                relationship.trim(),
                missingPersonName ? missingPersonName.trim() : null,
                caseReference ? caseReference.trim() : null,
                preferredLocation ? preferredLocation.trim() : null,
                missingPersonDetails ? missingPersonDetails.trim() : null,
            ]
        );

        await writeAuditEvent(client, {
            actor: 'PUBLIC',
            action: 'DNA_SAMPLE_REQUESTED',
            entityType: 'DnaSampleRequest',
            entityId: String(row.rows[0].dna_request_id),
            newState: { trackingReference, relationship },
            outcome: 'SUCCESS',
        });

        await client.query('COMMIT');

        res.status(201).json({
            trackingReference: row.rows[0].tracking_reference,
            submittedAt: row.rows[0].submitted_at,
            message: 'Your request has been received. A coordinator will contact you to arrange where and when to give the sample.',
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/dna/requests/:trackingReference
 * Public status check — returns status and lab reference if available.
 * Never returns genetic data.
 */
router.get('/requests/:trackingReference', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        const result = await client.query(
            `SELECT tracking_reference, status, lab_reference, submitted_at, updated_at
             FROM dna_sample_request
             WHERE tracking_reference = $1`,
            [req.params.trackingReference]
        );
        if (!result.rows.length)
            throw new ProblemError('NOT_FOUND', 'DNA request not found', req.originalUrl);

        const r = result.rows[0];
        res.json({
            trackingReference: r.tracking_reference,
            status: r.status,
            labReference: r.lab_reference || null,
            submittedAt: r.submitted_at,
            updatedAt: r.updated_at,
        });
    } catch (err) {
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/dna/queue?status=PENDING
 * Coordinator-only: returns the DNA request queue.
 * Used by the admin console to dispatch kits.
 */
router.get('/queue', async (req, res, next) => {
    if (!['AUTHORITY', 'ADMIN', 'CASE_WORKER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('AUTH_REQUIRED', 'Only coordinators may access the DNA queue.', req.originalUrl));
    }
    try {
        const statusFilter = req.query.status || null;
        const result = await pool.query(
            `SELECT dna_request_id, tracking_reference, status, requester_name, requester_email,
                    requester_phone, relationship, missing_person_name, case_reference,
                    preferred_location, lab_reference, submitted_at, updated_at
             FROM dna_sample_request
             WHERE ($1::text IS NULL OR status = $1)
             ORDER BY submitted_at ASC
             LIMIT 100`,
            [statusFilter],
        );
        res.json({
            total: result.rows.length,
            requests: result.rows.map((r) => ({
                requestId: r.dna_request_id,
                trackingReference: r.tracking_reference,
                status: r.status,
                requesterName: r.requester_name,
                requesterEmail: r.requester_email,
                requesterPhone: r.requester_phone,
                relationship: r.relationship,
                missingPersonName: r.missing_person_name,
                caseReference: r.case_reference,
                preferredLocation: r.preferred_location,
                labReference: r.lab_reference,
                submittedAt: r.submitted_at,
                updatedAt: r.updated_at,
            })),
        });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/v1/dna/requests/:trackingReference/status
 * Coordinator: advance the status of a DNA request.
 * VALID: PENDING | KIT_DISPATCHED | SAMPLE_RECEIVED | LAB_PROCESSING | RESULT_AVAILABLE | CLOSED
 */
router.patch('/requests/:trackingReference/status', async (req, res, next) => {
    if (!['AUTHORITY', 'ADMIN', 'CASE_WORKER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('AUTH_REQUIRED', 'Only coordinators may update DNA request status.', req.originalUrl));
    }

    const VALID_STATUSES = ['PENDING','KIT_DISPATCHED','SAMPLE_RECEIVED','LAB_PROCESSING','RESULT_AVAILABLE','CLOSED'];
    const { status, labReference } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
        return next(new ProblemError('INVALID_SCHEMA', `status must be one of: ${VALID_STATUSES.join(', ')}`, req.originalUrl));
    }

    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE dna_sample_request
             SET status = $1, lab_reference = COALESCE($2, lab_reference), updated_at = now()
             WHERE tracking_reference = $3
             RETURNING *`,
            [status, labReference || null, req.params.trackingReference],
        );
        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return next(new ProblemError('NOT_FOUND', 'DNA request not found.', req.originalUrl));
        }
        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'COORD_ANON',
            action: 'DNA_REQUEST_STATUS_UPDATED',
            entityType: 'DnaSampleRequest',
            entityId: String(result.rows[0].dna_request_id),
            newState: { status, labReference },
            outcome: 'SUCCESS',
        });
        await client.query('COMMIT');
        res.json({
            trackingReference: req.params.trackingReference,
            newStatus: status,
            message: 'DNA request status updated.',
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
