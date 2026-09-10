const express = require('express');
const { pool, writeAuditEvent, isIdempotencyKeyRaceConflict } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireIdempotencyKey } = require('../../middleware/idempotency');
const { requireAssuranceLevel } = require('../../middleware/assurance');

const router = express.Router({ mergeParams: true });

const FORENSIC_TYPES = new Set(['PHYSICAL_DESCRIPTOR', 'IDENTITY_DOCUMENT']);

/**
 * POST /api/v1/cases/:caseId/evidence
 * SPEC-002 §6 IdentityEvidence, one of the entities SPEC-003 v0.2's own
 * gap-analysis flagged as missing and then added — this scaffold
 * implements that endpoint. Actors: CASE_WORKER, AUTHORITY, PARTNER
 * (hospital/forensic staff). Never FAMILY/PUBLIC — identity evidence is
 * submitted about a person, not by them, and mishandling it (e.g. body
 * descriptors used to identify remains) requires trained intake.
 *
 * Classification escalates to HIGHLY_RESTRICTED for descriptor/document
 * evidence types (SPEC-004 §4), which the case-tracking read path (§3.2)
 * must exclude from FAMILY-facing responses regardless of case status.
 * Requires IAL-2 unconditionally: even RESTRICTED (non-forensic)
 * evidence is about a specific missing/deceased person, and intake staff
 * submitting it should already have completed step-up verification, not
 * just hold the PARTNER/CASE_WORKER role.
 */
router.post('/:caseId/evidence', requireIdempotencyKey, requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    if (!['CASE_WORKER', 'AUTHORITY', 'PARTNER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    const { evidenceType, descriptors, sourceOrganisationId } = req.body || {};
    if (!evidenceType) return next(new ProblemError('INVALID_SCHEMA', 'evidenceType is required', req.originalUrl));

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

        // Real idempotency now (fixes the Phase 3 follow-up): same key
        // always returns the original row untouched, matching every other
        // write path in this build rather than the previous same-case/
        // same-type/same-descriptors equality fallback.
        const existing = await client.query(
            'SELECT * FROM identity_evidence WHERE idempotency_key = $1', [req.idempotencyKey],
        );

        const classification = FORENSIC_TYPES.has(evidenceType) ? 'HIGHLY_RESTRICTED' : 'RESTRICTED';

        const evidence = existing.rows.length ? existing.rows[0] : (await client.query(
            `INSERT INTO identity_evidence
                (case_id, evidence_type, descriptors, source_organisation_id, classification, idempotency_key)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [req.params.caseId, evidenceType, JSON.stringify(descriptors || {}), sourceOrganisationId || null, classification, req.idempotencyKey],
        )).rows[0];

        await writeAuditEvent(client, {
            actor: req.actor.actorId, organisation: sourceOrganisationId, action: 'IDENTITY_EVIDENCE_SUBMITTED',
            entityType: 'IdentityEvidence', entityId: evidence.evidence_id,
            newState: { evidenceType, classification }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(201).json({
            evidenceId: evidence.evidence_id,
            caseId: req.params.caseId,
            evidenceType: evidence.evidence_type,
            classification: evidence.classification,
            verificationStatus: evidence.verification_status,
            createdAt: evidence.created_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (isIdempotencyKeyRaceConflict(err, 'identity_evidence_idempotency_key_key')) {
            try {
                const winner = await pool.query('SELECT * FROM identity_evidence WHERE idempotency_key = $1', [req.idempotencyKey]);
                if (winner.rows.length) {
                    const w = winner.rows[0];
                    return res.status(201).json({
                        evidenceId: w.evidence_id, caseId: req.params.caseId, evidenceType: w.evidence_type,
                        classification: w.classification, verificationStatus: w.verification_status, createdAt: w.created_at,
                    });
                }
            } catch (reReadErr) {
                return next(reReadErr);
            }
        }
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/cases/:caseId/evidence
 * CASE_WORKER/AUTHORITY only — HIGHLY_RESTRICTED items are never returned
 * to any other actor class, matching the ABAC model in SPEC-005 §7.
 */
router.get('/:caseId/evidence', async (req, res, next) => {
    if (!['CASE_WORKER', 'AUTHORITY'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    try {
        const result = await pool.query(
            `SELECT evidence_id, evidence_type, descriptors, classification, verification_status, created_at
             FROM identity_evidence WHERE case_id = $1 ORDER BY created_at DESC`,
            [req.params.caseId],
        );
        res.json(result.rows.map((r) => ({
            evidenceId: r.evidence_id,
            evidenceType: r.evidence_type,
            descriptors: r.descriptors,
            classification: r.classification,
            verificationStatus: r.verification_status,
            createdAt: r.created_at,
        })));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
