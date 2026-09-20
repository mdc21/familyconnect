const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

/**
 * POST /api/v1/organisations/register
 * Submits an agency registration request for police, hospitals, embassies, NGOs, tour operators.
 */
router.post('/register', writeLimiter, async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const { organisationName, orgType, country, contactName, contactEmail, contactPhone, roleDescription } = req.body;

        if (!organisationName || !orgType || !contactName || !contactEmail) {
            throw new ProblemError('INVALID_SCHEMA', 'organisationName, orgType, contactName, and contactEmail are required', req.originalUrl);
        }

        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO partner_organisation_registration
                (organisation_name, org_type, country, contact_name, contact_email, contact_phone, response_role_description, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING_VERIFICATION')
             RETURNING *`,
            [
                organisationName,
                orgType,
                country || 'Nepal',
                contactName,
                contactEmail,
                contactPhone || null,
                roleDescription || null
            ]
        );

        const reg = result.rows[0];

        await writeAuditEvent(client, {
            actor: 'PUBLIC_ORGANISATION_APPLICANT',
            action: 'ORGANISATION_REGISTRATION_SUBMITTED',
            entityType: 'PartnerOrganisationRegistration',
            entityId: reg.registration_id,
            newState: { organisationName, orgType, contactEmail },
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.status(201).json({
            registrationId: reg.registration_id,
            organisationName: reg.organisation_name,
            status: 'PENDING_VERIFICATION',
            message: 'Your organisation registration request has been received. A coordinator will verify your credentials before granting access.'
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/organisations/active
 * Returns directory of verified partner organisations for agencies.html.
 * Update count uses the seeded organisations table rather than a brittle LIKE match.
 */
router.get('/active', async (req, res, next) => {
    try {
        const eventId = req.headers['x-disaster-event-id'] || 'EVENT-IN-FL-2026-1187';
        let targetCountry = 'IN';
        if (eventId) {
            const evRes = await pool.query('SELECT country FROM disaster_event WHERE event_id = $1', [eventId]);
            if (evRes.rows.length && evRes.rows[0].country) {
                targetCountry = evRes.rows[0].country;
            } else if (eventId.includes('-NP-') || eventId.startsWith('EVENT-NP')) {
                targetCountry = 'NP';
            }
        }

        const result = await pool.query(
            `SELECT o.organisation_id AS org_id, o.name AS organisation_name,
                    o.organisation_type AS org_type, o.country, now() AS created_at,
                    (SELECT COUNT(*) FROM assistance_centre ac WHERE ac.organisation_id = o.organisation_id) AS centre_count,
                    (SELECT COUNT(*) FROM information_update iu WHERE iu.created_by::text = o.organisation_id::text) AS update_count
             FROM organisation o
             WHERE o.operational_status = 'ACTIVE' AND (o.country = $1 OR o.country = 'INTERNATIONAL')
             ORDER BY o.name ASC
             LIMIT 50`,
            [targetCountry]
        );

        res.json(result.rows.map(r => ({
            registrationId: r.org_id,
            organisationName: r.organisation_name,
            orgType: r.org_type,
            country: r.country || targetCountry,
            updateCount: parseInt(r.update_count, 10) || 0,
            centreCount: parseInt(r.centre_count, 10) || 0,
            verifiedAt: r.created_at,
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/organisations
 * Module M7 — Submits an organisation registration (SPEC-008 §8).
 * Sets verification_status = 'PENDING' pending admin review.
 */
router.post('/', writeLimiter, async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const { name, organisationType, country, contactDetails, capabilities, geographicScope } = req.body || {};

        if (!name || !organisationType) {
            throw new ProblemError('INVALID_SCHEMA', 'name and organisationType are required.', req.originalUrl);
        }

        await client.query('BEGIN');

        const insertRes = await client.query(
            `INSERT INTO organisation (
                name, organisation_type, country, contact_details,
                capabilities, geographic_scope, verification_status, operational_status
            ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'PENDING')
            RETURNING *`,
            [
                name,
                organisationType,
                country || 'NP',
                JSON.stringify(contactDetails || {}),
                capabilities || [],
                JSON.stringify(geographicScope || {})
            ]
        );

        const org = insertRes.rows[0];

        await writeAuditEvent(client, {
            actor: req.actor?.actorId || req.actor?.actorClass || 'PUBLIC',
            organisation: org.organisation_id,
            action: 'ORGANISATION_REGISTERED',
            entityType: 'ORGANISATION',
            entityId: org.organisation_id,
            newState: { name, organisationType, status: 'PENDING' },
            accessReason: 'Submitted organisation profile for accreditation',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Organisation registered. Verification by platform administrator is required before activation.',
            organisation: {
                organisationId: org.organisation_id,
                name: org.name,
                organisationType: org.organisation_type,
                country: org.country,
                verificationStatus: org.verification_status,
                operationalStatus: org.operational_status,
                capabilities: org.capabilities,
                geographicScope: org.geographic_scope
            }
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/organisations/:id/verify
 * Module M7 — Admin-gated verification flow (SPEC-008 §4 & §8).
 * Strictly requires ADMIN or AUTHORITY actor class.
 */
router.post('/:id/verify', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const actorClass = req.actor?.actorClass;
        if (!['ADMIN', 'AUTHORITY'].includes(actorClass)) {
            // Shielded per security invariants
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }

        const orgId = req.params.id;
        const { note, operationalStatus = 'ACTIVE' } = req.body || {};

        await client.query('BEGIN');

        const existingRes = await client.query(
            'SELECT * FROM organisation WHERE organisation_id::text = $1 FOR UPDATE',
            [orgId]
        );

        if (existingRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', 'Organisation not found.', req.originalUrl);
        }

        const updateRes = await client.query(
            `UPDATE organisation
             SET verification_status = 'VERIFIED',
                 operational_status = $1,
                 verified_by = $2,
                 verified_at = now()
             WHERE organisation_id::text = $3
             RETURNING *`,
            [operationalStatus, req.actor.actorId || req.actor.actorClass, orgId]
        );

        const verifiedOrg = updateRes.rows[0];

        await writeAuditEvent(client, {
            actor: req.actor.actorId || req.actor.actorClass,
            organisation: req.actor.organisationId || 'ADMINISTRATION',
            action: 'ORGANISATION_VERIFIED',
            entityType: 'ORGANISATION',
            entityId: verifiedOrg.organisation_id,
            previousState: { verification_status: existingRes.rows[0].verification_status },
            newState: { verification_status: 'VERIFIED', operational_status: operationalStatus, note },
            accessReason: 'Administrator verified partner credentials',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.json({
            message: 'Organisation verified successfully.',
            organisation: {
                organisationId: verifiedOrg.organisation_id,
                name: verifiedOrg.name,
                organisationType: verifiedOrg.organisation_type,
                verificationStatus: verifiedOrg.verification_status,
                operationalStatus: verifiedOrg.operational_status,
                verifiedBy: verifiedOrg.verified_by,
                verifiedAt: verifiedOrg.verified_at
            }
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/organisations
 * Module M7 — Returns organisations directory.
 * If caller is ADMIN/AUTHORITY and passes status=PENDING, returns pending queue.
 * Public actors only receive VERIFIED organisations.
 */
router.get('/', async (req, res, next) => {
    try {
        const actorClass = req.actor?.actorClass;
        const requestedStatus = req.query.status;

        let query = 'SELECT organisation_id, name, organisation_type, country, capabilities, geographic_scope, verification_status, operational_status, verified_at FROM organisation';
        const params = [];

        if (['ADMIN', 'AUTHORITY'].includes(actorClass) && requestedStatus) {
            query += ' WHERE verification_status = $1';
            params.push(requestedStatus);
        } else if (!['ADMIN', 'AUTHORITY'].includes(actorClass)) {
            query += " WHERE verification_status = 'VERIFIED' AND operational_status = 'ACTIVE'";
        }

        query += ' ORDER BY name ASC';
        const result = await pool.query(query, params);

        res.json({
            organisations: result.rows.map(r => ({
                organisationId: r.organisation_id,
                name: r.name,
                organisationType: r.organisation_type,
                country: r.country,
                capabilities: r.capabilities,
                geographicScope: r.geographic_scope,
                verificationStatus: r.verification_status,
                operationalStatus: r.operational_status,
                verifiedAt: r.verified_at
            }))
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
