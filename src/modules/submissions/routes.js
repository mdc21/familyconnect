const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool, writeAuditEvent, isIdempotencyKeyRaceConflict } = require('../../db');
const { requireIdempotencyKey } = require('../../middleware/idempotency');
const { ProblemError } = require('../../middleware/problems');
const { writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

const crypto = require('crypto');

function caseReferenceFor(eventId) {
    return `FC-${(eventId || 'EVT').split('-')[1] || 'GEN'}-${new Date().getFullYear()}-${String(crypto.randomInt(10000, 100000))}`;
}

/**
 * POST /api/v1/submissions/safety
 * SPEC-001 Journey 1 "I Am Safe". Actors: PUBLIC, PERSON.
 * BR-001: every submission receives acknowledgement where technically possible.
 * BR-002: acknowledgement does not mean verification — processingStatus is
 * always RECEIVED here, never SAFE_CONFIRMED.
 */
router.post('/safety', requireIdempotencyKey, writeLimiter, async (req, res, next) => {
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

        // Idempotency: same key returns the prior receipt untouched (SPEC-007 §2.A)
        const existing = await client.query(
            'SELECT * FROM submission_receipt WHERE idempotency_key = $1', [req.idempotencyKey],
        );
        if (existing.rows.length) {
            await client.query('ROLLBACK');
            return res.status(202).json(toSafetyResponse(existing.rows[0]));
        }

        const { person, currentLocation, contactPreference, tourGroupId } = req.body;
        if (!person || !person.firstName || !person.lastName) {
            throw new ProblemError('INVALID_SCHEMA', 'person.firstName and person.lastName are required.', req.originalUrl);
        }

        const personRow = await client.query(
            `INSERT INTO person (first_name, last_name, date_of_birth, nationality, phone)
             VALUES ($1,$2,$3,$4,$5) RETURNING person_id`,
            [person.firstName, person.lastName, person.dateOfBirth || null, person.nationality || null, person.phone || null],
        );

        const declarationRow = await client.query(
            `INSERT INTO safety_declaration (person_id, current_location, contact_method, declared_status)
             VALUES ($1,$2,$3,'SAFE_REPORTED') RETURNING declaration_id`,
            [personRow.rows[0].person_id, JSON.stringify(currentLocation || {}), contactPreference || null],
        );

        const submissionReference = `FC-SAFE-${crypto.randomInt(100000, 1000000)}`;
        const receipt = await client.query(
            `INSERT INTO submission_receipt
                (submission_reference, submission_type, submitted_by, processing_status, next_action, expected_review_time, idempotency_key)
             VALUES ($1,'SAFETY_DECLARATION',$2,'RECEIVED','Awaiting human verification before family notification','Within 2 hours',$3)
             RETURNING *`,
            [submissionReference, personRow.rows[0].person_id, req.idempotencyKey],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'ANONYMOUS', action: 'SAFETY_DECLARATION_SUBMITTED',
            entityType: 'SafetyDeclaration', entityId: declarationRow.rows[0].declaration_id,
            newState: { status: 'SAFE_REPORTED' }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(202).json(toSafetyResponse(receipt.rows[0]));
    } catch (err) {
        await client.query('ROLLBACK');
        if (isIdempotencyKeyRaceConflict(err, 'submission_receipt_idempotency_key_key')) {
            // SPEC-007 §2.A: lost a genuine race against another concurrent
            // request carrying the same Idempotency-Key. The winner's row
            // already committed — return it, rather than surfacing the
            // constraint violation as a 500. Found only by actually firing
            // concurrent requests at a real database (see
            // test/integration/spec007-gates.test.js GATE A1).
            try {
                const winner = await pool.query('SELECT * FROM submission_receipt WHERE idempotency_key = $1', [req.idempotencyKey]);
                if (winner.rows.length) return res.status(202).json(toSafetyResponse(winner.rows[0]));
            } catch (reReadErr) {
                return next(reReadErr);
            }
        }
        next(err);
    } finally {
        client.release();
    }
});

function toSafetyResponse(row) {
    return {
        submissionId: row.submission_id,
        submissionReference: row.submission_reference,
        processingStatus: row.processing_status,
        message: 'Your safety declaration has been received and queued for verification.',
        expectedReviewWindow: row.expected_review_time,
        receivedAt: row.received_at,
    };
}

/**
 * POST /api/v1/submissions/missing
 * SPEC-001 Journey 2 "Report Someone Missing". Actors: PUBLIC, FAMILY.
 * Opens a Case in NEW status — triage (assignment) happens separately
 * via POST /cases/:caseId/assignments (gap fix #3).
 */
router.post('/missing', requireIdempotencyKey, writeLimiter, async (req, res, next) => {
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

        const existing = await client.query(
            'SELECT sr.*, c.case_reference FROM submission_receipt sr JOIN case_record c ON c.case_id = sr.linked_case_id WHERE sr.idempotency_key = $1',
            [req.idempotencyKey],
        );
        if (existing.rows.length) {
            await client.query('ROLLBACK');
            return res.status(202).json(toMissingResponse(existing.rows[0]));
        }

        const { person, lastKnownContact, reporter } = req.body;
        if (!person || !reporter || !reporter.phone) {
            throw new ProblemError('INVALID_SCHEMA', 'person and reporter.phone are required.', req.originalUrl);
        }
        if (!req.disasterEventId) {
            throw new ProblemError('INVALID_SCHEMA', 'X-Disaster-Event-ID header is required.', req.originalUrl);
        }

        const personRow = await client.query(
            `INSERT INTO person (first_name, last_name, approximate_age, gender, nationality)
             VALUES ($1,$2,$3,$4,$5) RETURNING person_id`,
            [person.firstName, person.lastName, person.approximateAge || null, person.gender || null, person.nationality || null],
        );

        const caseReference = caseReferenceFor(req.disasterEventId);
        const caseRow = await client.query(
            `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id, next_review_at)
             VALUES ($1,$2,'MISSING_PERSON','NEW',$3, now() + interval '24 hours') RETURNING *`,
            [caseReference, req.disasterEventId, personRow.rows[0].person_id],
        );

        await client.query(
            `INSERT INTO missing_report
                (case_id, person_id, relationship, last_known_location, last_known_datetime, source)
             VALUES ($1,$2,$3,$4,$5,'PUBLIC_REPORT')`,
            [caseRow.rows[0].case_id, personRow.rows[0].person_id, reporter.relationship || null,
                JSON.stringify({ description: lastKnownContact && lastKnownContact.locationDescription }),
                (lastKnownContact && lastKnownContact.datetime) || null],
        );

        const receipt = await client.query(
            `INSERT INTO submission_receipt
                (submission_reference, submission_type, linked_case_id, processing_status, idempotency_key)
             VALUES ($1,'MISSING_REPORT',$2,'RECEIVED',$3) RETURNING *`,
            [`FC-MIS-${crypto.randomInt(100000, 1000000)}`, caseRow.rows[0].case_id, req.idempotencyKey],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'ANONYMOUS', action: 'MISSING_REPORT_SUBMITTED',
            entityType: 'Case', entityId: caseRow.rows[0].case_id,
            newState: { status: 'NEW' }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(202).json({ ...toMissingResponse(receipt.rows[0]), caseReference });
    } catch (err) {
        await client.query('ROLLBACK');
        if (isIdempotencyKeyRaceConflict(err, 'submission_receipt_idempotency_key_key')) {
            // Same race as the /safety handler above (SPEC-007 §2.A GATE A1):
            // the rollback also discards the orphaned person/case/
            // missing_report rows this losing attempt tentatively created,
            // since they were all in the same transaction — only the
            // winner's rows survive.
            try {
                const winner = await pool.query(
                    'SELECT sr.*, c.case_reference FROM submission_receipt sr JOIN case_record c ON c.case_id = sr.linked_case_id WHERE sr.idempotency_key = $1',
                    [req.idempotencyKey],
                );
                if (winner.rows.length) return res.status(202).json(toMissingResponse(winner.rows[0]));
            } catch (reReadErr) {
                return next(reReadErr);
            }
        }
        next(err);
    } finally {
        client.release();
    }
});

function toMissingResponse(row) {
    return {
        submissionId: row.submission_id,
        caseReference: row.case_reference,
        status: row.processing_status,
        message: 'Missing report submitted. Case triaging initiated.',
        submittedAt: row.submitted_at,
    };
}

/**
 * GET /api/v1/submissions/:submissionId
 * Prevents duplicate re-submission during telecom delays (SPEC-003 §3.1).
 */
router.get('/:submissionId', async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT sr.*, c.case_reference FROM submission_receipt sr
             LEFT JOIN case_record c ON c.case_id = sr.linked_case_id
             WHERE sr.submission_id = $1`,
            [req.params.submissionId],
        );
        if (!result.rows.length) throw new ProblemError('NOT_FOUND', 'Submission not found', req.originalUrl);
        const row = result.rows[0];
        res.json({
            submissionId: row.submission_id,
            submissionType: row.submission_type,
            processingStatus: row.processing_status,
            linkedCaseReference: row.case_reference || null,
            nextAction: row.next_action,
            updatedAt: row.received_at,
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
