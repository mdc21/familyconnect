const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireIdempotencyKey } = require('../../middleware/idempotency');
const { requireActor } = require('../../middleware/actor');
const { syncTourGroupManifestFromCase } = require('../../services/tourGroupSync');

const router = express.Router();

async function loadCase(caseId) {
    // Explicit ::text cast on the UUID side — without it, Postgres can't
    // resolve `case_id = $1 OR case_reference = $1` because the two sides
    // of the OR imply conflicting types for the same parameter
    // ("operator does not exist: text = uuid"). Only found by running
    // this against a real database — every prior test used a mocked
    // connection that never actually executed the query.
    const result = await pool.query('SELECT * FROM case_record WHERE case_id::text = $1 OR case_reference = $1', [caseId]);
    return result.rows[0] || null;
}

/**
 * GET /api/v1/cases/track?ref=FC-SAFE-XXXXXX
 * Public-facing "track my case" lookup — no auth required.
 * Returns only the family-safe status + any public updates for the case.
 * The case reference itself serves as the access token (UX requirement: families
 * should not need a separate code — the reference is given at submission time
 * and is not discoverable without it due to the random suffix).
 *
 * SPEC-004 §4: returns only PUBLIC or CONTROLLED fields — never forensic,
 * DNA, or internal caseworker notes.
 */
router.get('/track', async (req, res, next) => {
    const { ref } = req.query;
    if (!ref) {
        return next(new ProblemError('INVALID_SCHEMA', 'ref query parameter is required.', req.originalUrl));
    }

    try {
        // Try case_record first
        const caseResult = await pool.query(
            `SELECT cr.case_id, cr.case_reference, cr.status, cr.sub_status, cr.opened_at, cr.last_verified_at
             FROM case_record cr
             WHERE cr.case_reference = $1`,
            [ref.trim().toUpperCase()],
        );

        if (caseResult.rows.length > 0) {
            const c = caseResult.rows[0];

            // Fetch public updates for this case
            const updatesResult = await pool.query(
                `SELECT content, verification_status, created_at, information_type
                 FROM information_update
                 WHERE case_id = $1 AND audience = 'PUBLIC' AND visibility_level IN ('PUBLIC','CONTROLLED')
                 ORDER BY created_at DESC
                 LIMIT 20`,
                [c.case_id],
            );

            const STATUS_COPY = {
                NEW: 'Your submission has been received and is awaiting assignment to a case worker.',
                ACTIVE: 'This case is being actively worked by a trained coordinator.',
                SAFE_CONFIRMED: 'The person has been confirmed safe.',
                HOSPITALISED: 'The person has been located and is receiving medical care.',
                DECEASED: 'This case has moved to dignified identification procedures.',
                CLOSED: 'This case has been closed.',
                TRANSFERRED: 'This case has been transferred to a long-term tracing organisation.',
            };

            res.set('Cache-Control', 'no-store'); // family data must never be cached
            return res.json({
                found: true,
                type: 'CASE',
                reference: c.case_reference,
                status: c.status,
                subStatus: c.sub_status,
                statusDescription: STATUS_COPY[c.status] || `Current status: ${c.status}`,
                submittedAt: c.opened_at,
                lastUpdatedAt: c.last_verified_at || c.opened_at,
                updates: updatesResult.rows.map((u) => ({
                    content: u.content,
                    verificationStatus: u.verification_status,
                    category: u.information_type,
                    createdAt: u.created_at,
                })),
            });
        }

        // Fallback: try submission_receipt (safety declarations before case creation)
        const receiptResult = await pool.query(
            `SELECT submission_reference, processing_status, created_at
             FROM submission_receipt
             WHERE submission_reference = $1`,
            [ref.trim().toUpperCase()],
        );

        if (receiptResult.rows.length > 0) {
            const r = receiptResult.rows[0];
            const RECEIPT_STATUS = {
                RECEIVED: 'Your submission has been received and is awaiting review.',
                UNDER_REVIEW: 'Your submission is currently being reviewed by a coordinator.',
                CASE_CREATED: 'A case has been created and is now being actively managed.',
                CLOSED: 'This submission has been closed.',
            };
            res.set('Cache-Control', 'no-store');
            return res.json({
                found: true,
                type: 'SUBMISSION',
                reference: r.submission_reference,
                status: r.processing_status,
                statusDescription: RECEIPT_STATUS[r.processing_status] || `Status: ${r.processing_status}`,
                submittedAt: r.created_at,
                updates: [],
            });
        }

        // Not found — return a 200 with found: false rather than 404, to
        // avoid revealing whether the reference exists at all to someone who
        // might be guessing (SPEC-004 §4 enumeration protection).
        res.set('Cache-Control', 'no-store');
        return res.json({
            found: false,
            message: "We couldn't find that reference. Check the reference and try again, or contact a coordinator at an assistance centre.",
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/cases/:caseId
 * SPEC-003 §3.2. Response is field-filtered by actor class in a real
 * deployment (family view masks sensitive/forensic data per SPEC-004 §4);
 * this scaffold returns the family-safe shape and sets ETag for §1
 * concurrency control.
 */
router.get('/:caseId', async (req, res, next) => {
    try {
        const c = await loadCase(req.params.caseId);
        if (!c) throw new ProblemError('NOT_FOUND', 'Case not found', req.originalUrl);

        // SPEC-004 §9: disputed cases freeze disclosure to non-authority actors
        if (c.data_sharing_status === 'RESTRICTED_PENDING_REVIEW' &&
            !['CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(req.actor.actorClass)) {
            throw new ProblemError('DISPUTED_ACCESS', 'Case data disclosure is temporarily frozen pending dispute resolution.', req.originalUrl);
        }

        res.set('ETag', `"${c.version}"`);
        res.json({
            caseReference: c.case_reference,
            status: c.status,
            subStatus: c.sub_status,
            priority: c.priority,
            caseOwnerOrgId: c.case_owner_org_id,
            nextReviewAt: c.next_review_at,
            dataSharingStatus: c.data_sharing_status,
        });
    } catch (err) {
        next(err);
    }
});

const ALLOWED_TRANSITIONS = {
    triage: { from: ['NEW'], to: 'ACTIVE' },
    'confirm-safety': { from: ['ACTIVE'], to: 'SAFE_CONFIRMED' },
    'mark-hospitalised': { from: ['ACTIVE'], to: 'HOSPITALISED' },
    // gap fix #4: SPEC-002 §38 / SPEC-006 §5 require a human confirm/reject
    // decision on AI-flagged PotentialMatchDetected events; SPEC-003 v0.2
    // never defined the action verb for it.
    'confirm-match': { from: ['ACTIVE', 'POTENTIAL_MATCH'], to: 'IDENTITY_PENDING' },
    'reject-match': { from: ['ACTIVE', 'POTENTIAL_MATCH'], to: 'ACTIVE' },
    'mark-deceased': { from: ['ACTIVE', 'HOSPITALISED'], to: 'DECEASED', requires: ['forensicReference'] },
    close: { from: ['ACTIVE', 'SAFE_CONFIRMED', 'DECEASED'], to: 'CLOSED', requires: ['closureReason'] },
};

/**
 * POST /api/v1/cases/:caseId/actions/:action
 * SPEC-003 §4: "Status transitions cannot be performed through arbitrary
 * field mutations. They must be executed via distinct, validated action
 * verbs." Uses If-Match/ETag (SPEC-003 §1) to prevent lost updates from
 * concurrent case-worker edits (SPEC-007 §2.A ETag Conflict Resolution).
 */
router.post('/:caseId/actions/:action', requireActor('CASE_WORKER', 'AUTHORITY', 'ADMIN'), requireIdempotencyKey, async (req, res, next) => {
    const transition = ALLOWED_TRANSITIONS[req.params.action];
    if (!transition) return next(new ProblemError('NOT_FOUND', 'Unknown action', req.originalUrl));

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
        const c = (await client.query('SELECT * FROM case_record WHERE case_id::text = $1 OR case_reference = $1 FOR UPDATE', [req.params.caseId])).rows[0];
        if (!c) throw new ProblemError('NOT_FOUND', 'Case not found', req.originalUrl);

        const ifMatch = req.get('If-Match');
        if (ifMatch && ifMatch.replace(/"/g, '') !== String(c.version)) {
            throw new ProblemError('CONCURRENCY_LOCK', 'ETag mismatch; case was modified concurrently.', req.originalUrl);
        }

        if (!transition.from.includes(c.status)) {
            throw new ProblemError('ILLEGAL_TRANSITION', `Cannot ${req.params.action} a case in status ${c.status}.`, req.originalUrl);
        }
        for (const field of transition.requires || []) {
            if (!req.body || !req.body[field]) {
                throw new ProblemError('INVALID_SCHEMA', `${field} is required for this transition.`, req.originalUrl);
            }
        }
        // BR-016/BR-017/BR-018: AI can never execute these transitions itself.
        if (req.actor.actorClass === 'SYSTEM_AUDITOR' && req.params.action !== 'triage') {
            throw new ProblemError('ILLEGAL_TRANSITION', 'AI/automated actors cannot execute this transition; human authority required.', req.originalUrl);
        }

        const updated = await client.query(
            `UPDATE case_record SET status = $1, version = version + 1,
                closed_at = CASE WHEN $1 = 'CLOSED' THEN now() ELSE closed_at END,
                closure_reason = COALESCE($2, closure_reason)
             WHERE case_id = $3 RETURNING *`,
            [transition.to, (req.body && req.body.closureReason) || null, c.case_id],
        );

        // Same transaction as the status write, so a tour-group manifest
        // rollup can never observe the case in a state its own linked
        // member row hasn't caught up to yet.
        await syncTourGroupManifestFromCase(client, c.case_id, transition.to);

        await writeAuditEvent(client, {
            actor: req.actor.actorId || req.actor.actorClass, action: `CASE_ACTION_${req.params.action.toUpperCase()}`,
            entityType: 'Case', entityId: c.case_id,
            previousState: { status: c.status }, newState: { status: transition.to }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.set('ETag', `"${updated.rows[0].version}"`).json({
            caseReference: updated.rows[0].case_reference, status: updated.rows[0].status,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/cases/:caseId/disputes — SPEC-003 §3.2
 * Freezes data sharing pending human arbitration (SPEC-004 §9, BR-004).
 */
router.post('/:caseId/disputes', requireActor('FAMILY', 'CASE_WORKER', 'AUTHORITY'), requireIdempotencyKey, async (req, res, next) => {
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
        const { disputeType, description, evidenceReferences } = req.body;
        if (!disputeType) throw new ProblemError('INVALID_SCHEMA', 'disputeType is required', req.originalUrl);

        const dispute = await client.query(
            `INSERT INTO case_dispute (case_id, raised_by, dispute_type, description, evidence_reference)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [req.params.caseId, req.actor.actorId, disputeType, description, evidenceReferences || []],
        );
        await client.query(
            `UPDATE case_record SET data_sharing_status = 'RESTRICTED_PENDING_REVIEW', version = version + 1 WHERE case_id::text = $1 OR case_reference = $1`,
            [req.params.caseId],
        );
        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'DISPUTE_RAISED', entityType: 'CaseDispute',
            entityId: dispute.rows[0].dispute_id, newState: { status: 'OPEN' }, outcome: 'SUCCESS',
        });
        await client.query('COMMIT');
        res.status(202).json({
            disputeId: dispute.rows[0].dispute_id, caseId: req.params.caseId,
            status: 'OPEN', dataSharingStatus: 'RESTRICTED_PENDING_REVIEW',
            assignedReviewer: 'LEGAL_PROTECTION_TEAM', raisedAt: dispute.rows[0].raised_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/cases/:caseId/escalations — gap fix #5.
 * CaseEscalation is a named MVP entity (SPEC-002 core model, §54) and
 * appears in the case-status diagram (ESCALATED), but SPEC-003 v0.2 never
 * gave it an endpoint.
 */
router.post('/:caseId/escalations', requireActor('CASE_WORKER', 'AUTHORITY'), requireIdempotencyKey, async (req, res, next) => {
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
        const { reason, severity } = req.body;
        if (!reason) throw new ProblemError('INVALID_SCHEMA', 'reason is required', req.originalUrl);

        const escalation = await client.query(
            `INSERT INTO case_escalation (case_id, raised_by, reason, severity)
             VALUES ($1,$2,$3,$4) RETURNING *`,
            [req.params.caseId, req.actor.actorId, reason, severity || 'MEDIUM'],
        );
        await client.query(`UPDATE case_record SET sub_status = 'ESCALATED', version = version + 1 WHERE case_id::text = $1 OR case_reference = $1`, [req.params.caseId]);
        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'CASE_ESCALATED', entityType: 'CaseEscalation',
            entityId: escalation.rows[0].escalation_id, newState: { status: 'OPEN' }, outcome: 'SUCCESS',
        });
        await client.query('COMMIT');
        res.status(201).json({ escalationId: escalation.rows[0].escalation_id, caseId: req.params.caseId, status: 'OPEN' });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});



module.exports = router;
