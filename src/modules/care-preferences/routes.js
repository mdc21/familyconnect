const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');

const router = express.Router({ mergeParams: true });

const ESCALATED_TYPES = new Set(['MEDICAL_ACCOMMODATION', 'MENTAL_HEALTH']);

/**
 * POST /api/v1/cases/:caseId/care-preferences
 * Actors: FAMILY, CASE_WORKER, PARTNER (shelter/medical staff) — a family
 * member can record a preference on behalf of the affected person, and
 * a case worker/partner can record one observed directly. MEDICAL_
 * ACCOMMODATION and MENTAL_HEALTH preferences escalate to RESTRICTED
 * classification (SPEC-004 §4) even though the table default is
 * SENSITIVE, since these two categories carry the same disclosure risk
 * as clinical data elsewhere in the model.
 */
router.post('/:caseId/care-preferences', async (req, res, next) => {
    if (!['FAMILY', 'CASE_WORKER', 'PARTNER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    const { preferenceType, details, personId } = req.body || {};
    if (!preferenceType || !details) {
        return next(new ProblemError('INVALID_SCHEMA', 'preferenceType and details are required', req.originalUrl));
    }

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
        const classification = ESCALATED_TYPES.has(preferenceType) ? 'RESTRICTED' : 'SENSITIVE';

        const pref = await client.query(
            `INSERT INTO care_preference
                (case_id, person_id, preference_type, details, classification, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [req.params.caseId, personId || null, preferenceType, details, classification, req.actor.actorId],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'CARE_PREFERENCE_RECORDED', entityType: 'CarePreference',
            entityId: pref.rows[0].care_preference_id, newState: { preferenceType, classification }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(201).json({
            carePreferenceId: pref.rows[0].care_preference_id,
            caseId: req.params.caseId,
            preferenceType: pref.rows[0].preference_type,
            classification: pref.rows[0].classification,
            recordedAt: pref.rows[0].recorded_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/cases/:caseId/care-preferences
 * Readable by the same actor classes that can write — a family member
 * needs to see what's already been recorded before adding more, and a
 * case worker/partner needs it to actually act on (e.g. shelter intake).
 */
router.get('/:caseId/care-preferences', async (req, res, next) => {
    if (!['FAMILY', 'CASE_WORKER', 'PARTNER', 'AUTHORITY'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    try {
        const result = await pool.query(
            `SELECT care_preference_id, preference_type, details, classification, recorded_at, active_status
             FROM care_preference WHERE case_id = $1 AND active_status = true ORDER BY recorded_at DESC`,
            [req.params.caseId],
        );
        res.json(result.rows.map((r) => ({
            carePreferenceId: r.care_preference_id,
            preferenceType: r.preference_type,
            details: r.details,
            classification: r.classification,
            recordedAt: r.recorded_at,
        })));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
