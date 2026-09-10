const express = require('express');
const { pool } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireAssuranceLevel } = require('../../middleware/assurance');

const router = express.Router();

/**
 * GET /api/v1/audit/events — structural gap fix.
 * SPEC-004 §22 and SPEC-007 §2.B both mandate that audit records exist
 * and are tamper-resistant, and SPEC-007 §3 requires a "Humanitarian
 * Agency Review" gate before controlled deployment — but no spec ever
 * defined how that review actually *reads* the audit trail. The actor
 * matrix (SPEC-003 §2) only grants SYSTEM/AUDITOR "Audit Ingestion",
 * i.e. write access, not query access.
 *
 * Restricted to AUTHORITY and ADMIN (governance/compliance roles), never
 * CASE_WORKER or FAMILY — audit review is an oversight function, not an
 * operational one, and viewing it must itself be auditable (logged
 * separately, omitted from this scaffold for brevity). Requires IAL-2:
 * reading the audit trail should demand at least the same assurance bar
 * as the actions it's reviewing.
 */
router.get('/events', requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        if (!['AUTHORITY', 'ADMIN'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }
        const { entityType, entityId, since, limit } = req.query;
        const result = await pool.query(
            `SELECT audit_id, "timestamp", actor, organisation, action, entity_type, entity_id, access_reason, outcome
             FROM audit_event
             WHERE ($1::text IS NULL OR entity_type = $1)
               AND ($2::text IS NULL OR entity_id = $2)
               AND ($3::timestamptz IS NULL OR "timestamp" >= $3)
             ORDER BY "timestamp" DESC LIMIT $4`,
            [entityType || null, entityId || null, since || null, Math.min(parseInt(limit, 10) || 100, 1000)],
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
