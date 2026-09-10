const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireActor } = require('../../middleware/actor');
const { requireIdempotencyKey } = require('../../middleware/idempotency');

const router = express.Router({ mergeParams: true });

/**
 * POST /api/v1/cases/:caseId/updates — gap fix #1 (Critical).
 *
 * InformationUpdate is a core MVP entity (SPEC-002 §22), and SPEC-001
 * Journey 3 / FR-008 / FR-009 require case workers to publish verified
 * updates that families then see labelled by verification status. But
 * SPEC-003 v0.2's API surface only ever *read* a case's lastVerifiedUpdate
 * (embedded in GET /cases/{id}) — there was no endpoint to write one.
 * Without this, "verified vs unverified" (PRP-04, BR-012) has no way to
 * enter the system at all.
 *
 * Actors: CASE_WORKER, AUTHORITY, PARTNER (with lower default visibility),
 * SYSTEM_AUDITOR for AI-assisted drafts (which must land as PENDING, per
 * BR-016/BR-018 — AI can draft/summarise but never verifies itself).
 */
router.post('/:caseId/updates', requireActor('CASE_WORKER', 'AUTHORITY', 'PARTNER', 'SYSTEM_AUDITOR', 'ADMIN'), requireIdempotencyKey, async (req, res, next) => {
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
        const { informationType, content, audience, visibilityLevel, verificationStatus } = req.body;
        if (!content || !informationType) {
            throw new ProblemError('INVALID_SCHEMA', 'informationType and content are required', req.originalUrl);
        }

        // AI-assisted actors can never self-verify (BR-016/BR-018/PRP-06)
        // C5 fix: Only AUTHORITY and ADMIN can directly self-verify. 
        // Other actors' updates default to PENDING.
        let effectiveStatus = verificationStatus || 'PENDING';
        if (effectiveStatus === 'VERIFIED' && !['AUTHORITY', 'ADMIN'].includes(req.actor.actorClass)) {
            effectiveStatus = 'PENDING'; // Force to pending if they don't have authority
        }
        if (req.actor.actorClass === 'SYSTEM_AUDITOR') {
            effectiveStatus = 'PENDING';
        }

        const update = await client.query(
            `INSERT INTO information_update
                (case_id, information_type, content, source_id, verification_status, audience, visibility_level, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [req.params.caseId, informationType, content, null, effectiveStatus,
                audience || 'CASE', visibilityLevel || 'CONTROLLED', req.actor.actorId],
        );

        if (effectiveStatus === 'VERIFIED' || effectiveStatus === 'CONFIRMED') {
            await client.query(
                `UPDATE case_record SET last_verified_at = now(), version = version + 1 WHERE case_id::text = $1 OR case_reference = $1`,
                [req.params.caseId],
            );
        }

        await client.query(
            `INSERT INTO audit_event (actor, action, entity_type, entity_id, new_state, outcome) VALUES ($1,$2,$3,$4,$5,$6)`,
            [
            req.actor.actorId, 'INFORMATION_UPDATE_POSTED', 'InformationUpdate',
            update.rows[0].information_id, { verificationStatus: effectiveStatus }, 'SUCCESS',
            ],
        );

        // Mock Email/SMS Notification logging
        await client.query(
            `INSERT INTO notification (case_id, notification_type, channel, priority, sent_at, status)
             VALUES ($1, $2, $3, $4, now(), 'SENT')`,
            [req.params.caseId, 'CASE_UPDATE', 'SMS', 'HIGH']
        );

        await client.query('COMMIT');
        res.status(201).json({
            informationId: update.rows[0].information_id,
            caseId: req.params.caseId,
            verificationStatus: effectiveStatus,
            audience: update.rows[0].audience,
            createdAt: update.rows[0].created_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/cases/:caseId/updates — companion read path for the
 * Timeline View (SPEC-006 §4), badged verified/unverified per PRP-04.
 */
router.get('/:caseId/updates', requireActor('CASE_WORKER', 'AUTHORITY', 'PARTNER', 'FAMILY'), async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT information_id, information_type, content, verification_status, audience, created_at, verified_at
             FROM information_update WHERE case_id = $1 ORDER BY created_at DESC`,
            [req.params.caseId],
        );
        res.json(result.rows.map((r) => ({
            informationId: r.information_id,
            type: r.information_type,
            content: r.content,
            verificationStatus: r.verification_status, // never rendered as fact unless VERIFIED/CONFIRMED — client concern per SPEC-006
            audience: r.audience,
            createdAt: r.created_at,
            verifiedAt: r.verified_at,
        })));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
