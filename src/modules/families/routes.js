const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireIdempotencyKey } = require('../../middleware/idempotency');

const familyRouter = express.Router();   // mounted at /api/v1/families
const proxyRouter = express.Router({ mergeParams: true }); // mounted at /api/v1/cases

/**
 * POST /api/v1/families/:familyId/locations — SPEC-003 §3.4.
 * Logs a family's real-time physical footprint to coordinate transport
 * and human assistance. Classification: SENSITIVE (SPEC-004 §4) — never
 * surfaced to PUBLIC actors, and excluded from any cached/public response.
 */
familyRouter.post('/:familyId/locations', async (req, res, next) => {
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
        if (!['FAMILY', 'PROXY', 'CASE_WORKER'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        await client.query('BEGIN');
        const { locationType, administrativeArea, facilityName, precision: locationPrecision, startDatetime } = req.body;
        if (!locationPrecision) throw new ProblemError('INVALID_SCHEMA', 'precision is required', req.originalUrl);

        const location = await client.query(
            `INSERT INTO family_location
                (family_unit_id, location, location_type, location_precision, start_datetime, source, visibility)
             VALUES ($1,$2,$3,$4,$5,$6,'SENSITIVE') RETURNING *`,
            [req.params.familyId, JSON.stringify({ administrativeArea, facilityName }), locationType || null,
                locationPrecision, startDatetime || new Date().toISOString(), req.actor.actorClass],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'FAMILY_LOCATION_RECORDED', entityType: 'FamilyLocation',
            entityId: location.rows[0].family_location_id, newState: { precision: locationPrecision }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(201).json({
            familyLocationId: location.rows[0].family_location_id,
            familyUnitId: req.params.familyId,
            status: 'ACTIVE',
            recordedAt: location.rows[0].start_datetime,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/cases/:caseId/proxies — SPEC-003 §3.4.
 * Appoints a TrustedIntermediary for remote families (SPEC-004 §17):
 * proxies can act on scoped case actions but never inherit the family's
 * right to view protected historical case data — enforced by
 * authorityScope, not by giving the proxy the FAMILY actor class itself.
 */
proxyRouter.post('/:caseId/proxies', requireIdempotencyKey, async (req, res, next) => {
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
        if (!['FAMILY', 'CASE_WORKER'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        await client.query('BEGIN');
        const { proxyPerson, authorityScope, validFrom, validUntil } = req.body;
        if (!proxyPerson || !authorityScope) {
            throw new ProblemError('INVALID_SCHEMA', 'proxyPerson and authorityScope are required', req.originalUrl);
        }
        if (!['FULL', 'LIMITED', 'MEDICAL'].includes(authorityScope)) {
            throw new ProblemError('INVALID_SCHEMA', 'authorityScope must be FULL, LIMITED, or MEDICAL', req.originalUrl);
        }

        const caseData = await client.query('SELECT primary_person_id FROM case_record WHERE case_id::text = $1 OR case_reference = $1', [req.params.caseId]);
        const representedPersonId = caseData.rows[0]?.primary_person_id || null;

        const personRow = await client.query(
            `INSERT INTO person (first_name, last_name, phone) VALUES ($1,$2,$3) RETURNING person_id`,
            [proxyPerson.firstName, proxyPerson.lastName, proxyPerson.phone || null],
        );

        const proxy = await client.query(
            `INSERT INTO proxy_contact
                (proxy_person_id, represented_person_id, authority_scope, verification_status, valid_from, valid_until)
             VALUES ($1,$2,$3,'PENDING',$4,$5) RETURNING *`,
            [personRow.rows[0].person_id, representedPersonId, authorityScope, validFrom || new Date().toISOString(), validUntil || null],
        );

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'PROXY_APPOINTED', entityType: 'ProxyContact',
            entityId: proxy.rows[0].proxy_contact_id, newState: { authorityScope, verificationStatus: 'PENDING' }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(201).json({
            proxyId: proxy.rows[0].proxy_contact_id,
            caseId: req.params.caseId,
            verificationStatus: 'PENDING',
            expiresAt: proxy.rows[0].valid_until,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = { familyRouter, proxyRouter };
