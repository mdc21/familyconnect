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

module.exports = router;
