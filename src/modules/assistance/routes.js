const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { publicReadLimiter, writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

/**
 * GET /api/v1/assistance-centres
 * Public. Returns all OPEN centres for the current event.
 */
router.get('/', publicReadLimiter, async (req, res, next) => {
    try {
        const eventId = req.query.eventId || req.disasterEventId;
        const result = await pool.query(
            `SELECT ac.centre_id, ac.name, ac.location, ac.opening_hours, ac.services, ac.languages,
                    ac.accessibility, ac.emergency_contact, ac.operational_status,
                    o.name AS organisation_name, o.organisation_type
             FROM assistance_centre ac
             LEFT JOIN organisation o ON o.organisation_id = ac.organisation_id
             WHERE ($1::text IS NULL OR ac.event_id = $1)
               AND ac.operational_status != 'CLOSED'
             ORDER BY ac.operational_status, ac.name`,
            [eventId || null],
        );
        res.set('Cache-Control', 'public, max-age=300'); // SPEC-005 §4 low-bandwidth caching
        res.json(result.rows.map((r) => ({
            centreId: r.centre_id,
            name: r.name,
            location: r.location,
            openingHours: r.opening_hours,
            services: r.services,
            languages: r.languages,
            accessibility: r.accessibility,
            emergencyContact: r.emergency_contact,
            operationalStatus: r.operational_status,
            organisationName: r.organisation_name,
            organisationType: r.organisation_type,
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/assistance-centres
 * Authority / Admin only: create a new assistance centre.
 * Used by coordinators to register field centres as they open.
 */
router.post('/', writeLimiter, async (req, res, next) => {
    // Actor class check — AUTHORITY or ADMIN only (SPEC-003 §2)
    if (!['AUTHORITY', 'ADMIN', 'CASE_WORKER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('AUTH_REQUIRED', 'Only coordinators and authorities may create assistance centres.', req.originalUrl));
    }

    const {
        name, location, openingHours, services, languages,
        accessibility, emergencyContact, organisationId, eventId,
    } = req.body;

    if (!name || !location) {
        return next(new ProblemError('INVALID_SCHEMA', 'name and location are required.', req.originalUrl));
    }

    let client;
    try {
        client = await pool.connect();
    } catch (e) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        await client.query('BEGIN');
        const resolvedEventId = eventId || req.disasterEventId || 'EVENT-NP-TIBET-2026';

        const result = await client.query(
            `INSERT INTO assistance_centre
                (centre_id, name, location, opening_hours, services, languages, accessibility, emergency_contact, organisation_id, event_id, operational_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'OPEN')
             RETURNING *`,
            [uuidv4(), name, JSON.stringify(location), openingHours || null,
             services || null, languages || null, accessibility || null,
             emergencyContact || null, organisationId || null, resolvedEventId],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'COORD_ANON', organisation: req.actor.organisationId,
            action: 'ASSISTANCE_CENTRE_CREATED', entityType: 'AssistanceCentre',
            entityId: result.rows[0].centre_id, newState: { status: 'OPEN' }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(201).json({
            centreId: result.rows[0].centre_id,
            message: 'Assistance centre created and is now publicly visible.',
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * PATCH /api/v1/assistance-centres/:centreId
 * Authority / Admin / CaseWorker: update status, hours, or services.
 */
router.patch('/:centreId', writeLimiter, async (req, res, next) => {
    if (!['AUTHORITY', 'ADMIN', 'CASE_WORKER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('AUTH_REQUIRED', 'Only coordinators may update assistance centres.', req.originalUrl));
    }

    const { operationalStatus, openingHours, services, emergencyContact } = req.body;

    let client;
    try {
        client = await pool.connect();
    } catch (e) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        await client.query('BEGIN');

        // Build SET clause dynamically
        const updates = [];
        const values = [];
        let i = 1;
        if (operationalStatus) { updates.push(`operational_status = $${i++}`); values.push(operationalStatus); }
        if (openingHours !== undefined) { updates.push(`opening_hours = $${i++}`); values.push(openingHours); }
        if (services) { updates.push(`services = $${i++}`); values.push(services); }
        if (emergencyContact !== undefined) { updates.push(`emergency_contact = $${i++}`); values.push(emergencyContact); }

        if (updates.length === 0) {
            await client.query('ROLLBACK');
            return next(new ProblemError('INVALID_SCHEMA', 'No updatable fields provided.', req.originalUrl));
        }

        values.push(req.params.centreId);
        const result = await client.query(
            `UPDATE assistance_centre SET ${updates.join(', ')} WHERE centre_id = $${i} RETURNING *`,
            values,
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return next(new ProblemError('NOT_FOUND', 'Assistance centre not found.', req.originalUrl));
        }

        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'COORD_ANON', organisation: req.actor.organisationId,
            action: 'ASSISTANCE_CENTRE_UPDATED', entityType: 'AssistanceCentre',
            entityId: req.params.centreId, newState: req.body, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.json({ centreId: req.params.centreId, updated: true });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
