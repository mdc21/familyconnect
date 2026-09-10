const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { publicReadLimiter, writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

/**
 * POST /api/v1/events/:eventId/rumours — gap fix #2.
 * SPEC-001 Journey 9 step 1 is "report is captured", and SPEC-002 defines
 * DisasterRumour as an MVP entity with a REPORTED initial state, but
 * SPEC-003 v0.2 only ever defined the *correction* endpoint
 * (.../rumours/{id}/correction) — there was no way for a rumour to exist
 * in the first place. Actors: PUBLIC, CASE_WORKER, AUTHORITY.
 */
router.post('/:eventId/rumours', writeLimiter, async (req, res, next) => {
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
        const { claim, source, affectedArea } = req.body;
        if (!claim) throw new ProblemError('INVALID_SCHEMA', 'claim is required', req.originalUrl);

        const rumour = await client.query(
            `INSERT INTO disaster_rumour (event_id, claim, source, affected_area, created_by)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [req.params.eventId, claim, source || 'PUBLIC_REPORT', affectedArea || null, req.actor.actorId],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'ANONYMOUS', action: 'RUMOUR_REPORTED', entityType: 'DisasterRumour',
            entityId: rumour.rows[0].rumour_id, newState: { verificationStatus: 'REPORTED' }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        // PRP-04 / BR-012: unverified must never render as confirmed, and unverified != false
        res.status(202).json({
            rumourId: rumour.rows[0].rumour_id,
            eventId: req.params.eventId,
            verificationStatus: 'REPORTED',
            message: 'Report received. This claim is unverified and under review.',
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/events/:eventId/rumours — the Disaster Rumour Feed public
 * broadcast UI (SPEC-006 §3) needs this list; only v0.2 defined the
 * single-rumour correction write, not a feed read.
 */
router.get('/:eventId/rumours', publicReadLimiter, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT rumour_id, claim, verification_status, response_message, affected_area, first_reported_at, resolved_at
             FROM disaster_rumour WHERE event_id = $1 ORDER BY first_reported_at DESC LIMIT 100`,
            [req.params.eventId],
        );
        res.json(result.rows.map((r) => ({
            rumourId: r.rumour_id,
            claim: r.verification_status === 'FALSE' || r.verification_status === 'MISLEADING'
                ? r.response_message || r.claim // corrected framing takes priority once resolved
                : r.claim,
            verificationStatus: r.verification_status,
            affectedArea: r.affected_area,
            firstReportedAt: r.first_reported_at,
            resolvedAt: r.resolved_at,
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/events/:eventId/rumours/:rumourId/correction — SPEC-003 §3.5
 * (unchanged from baseline; kept here alongside submission/feed so all
 * rumour lifecycle endpoints live in one module).
 */
router.post('/:eventId/rumours/:rumourId/correction', async (req, res, next) => {
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
        if (!['AUTHORITY', 'CASE_WORKER', 'ADMIN'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        await client.query('BEGIN');
        const { verificationStatus, verificationSource, responseMessage, affectedArea, targetAudience } = req.body;
        if (!verificationStatus) throw new ProblemError('INVALID_SCHEMA', 'verificationStatus is required', req.originalUrl);

        const updated = await client.query(
            `UPDATE disaster_rumour SET verification_status = $1, verification_source = $2,
                response_message = $3, publication_status = 'BROADCASTED', verified_by = $4, resolved_at = now()
             WHERE rumour_id = $5 AND event_id = $6 RETURNING *`,
            [verificationStatus, verificationSource, responseMessage, req.actor.actorId, req.params.rumourId, req.params.eventId],
        );
        if (!updated.rows.length) throw new ProblemError('NOT_FOUND', 'Rumour not found', req.originalUrl);

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'RUMOUR_CORRECTED', entityType: 'DisasterRumour',
            entityId: req.params.rumourId, newState: { verificationStatus }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.json({
            correctionId: `COR-${Date.now()}`, rumourId: req.params.rumourId,
            publicationStatus: 'BROADCASTED', broadcastTimestamp: updated.rows[0].resolved_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/events/:eventId/information?category=ALL
 * Public: returns verified situation updates for the information.html page.
 * Replaces the previously hardcoded HTML content with live DB data.
 */
router.get('/:eventId/information', publicReadLimiter, async (req, res, next) => {
    try {
        const { category } = req.query;
        const result = await pool.query(
            `SELECT information_id, information_type, content, translations, verification_status, created_at
             FROM information_update
             WHERE event_id = $1
               AND audience IN ('PUBLIC', 'EVENT')
               AND visibility_level IN ('PUBLIC','CONTROLLED')
               AND verification_status = 'VERIFIED'
               AND ($2::text IS NULL OR information_type = $2)
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.params.eventId, category && category !== 'ALL' ? category : null],
        );
        res.set('Cache-Control', 'public, max-age=180');
        res.json(result.rows.map((r) => ({
            updateId: r.information_id,
            category: r.information_type,
            content: r.content,
            translations: r.translations || {},
            verificationStatus: r.verification_status,
            publishedAt: r.created_at,
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/events/:eventId/information
 * Authority/Coordinator: publish a new verified situation update.
 */
router.post('/:eventId/information', writeLimiter, async (req, res, next) => {
    if (!['AUTHORITY', 'ADMIN', 'CASE_WORKER', 'PARTNER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('AUTH_REQUIRED', 'Only coordinators may publish information updates.', req.originalUrl));
    }
    const { informationType, content, verificationStatus } = req.body;
    if (!informationType || !content) {
        return next(new ProblemError('INVALID_SCHEMA', 'informationType and content are required.', req.originalUrl));
    }

    let client;
    try {
        client = await pool.connect();
    } catch (e) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        const effectiveStatus = (verificationStatus === 'VERIFIED' && ['AUTHORITY', 'ADMIN'].includes(req.actor.actorClass))
            ? 'VERIFIED'
            : 'PENDING';

        const isValidUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
        const createdBy = isValidUuid(req.actor.actorId) ? req.actor.actorId : null;

        await client.query('BEGIN');
        const result = await client.query(
            `INSERT INTO information_update
                (event_id, information_type, content, verification_status, audience, visibility_level, created_by)
             VALUES ($1,$2,$3,$4,'PUBLIC','PUBLIC',$5)
             RETURNING information_id, created_at`,
            [req.params.eventId, informationType, content,
             effectiveStatus,
             createdBy],
        );
        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'COORD_ANON', organisation: req.actor.organisationId,
            action: 'INFORMATION_UPDATE_PUBLISHED', entityType: 'InformationUpdate',
            entityId: result.rows[0].information_id, newState: { informationType, verificationStatus: effectiveStatus },
            outcome: 'SUCCESS',
        });
        await client.query('COMMIT');
        res.status(201).json({
            updateId: result.rows[0].information_id,
            publishedAt: result.rows[0].created_at,
            message: 'Information update published.',
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
