const { validate: isUuid } = require('uuid');

/**
 * SPEC-003 §1: "Idempotency-Key: UUIDv4 (Mandatory on all POST / PATCH
 * state-altering calls)."
 * SPEC-007 §2.A requires that concurrent POSTs with the same key never
 * create duplicate MissingReport/SafetyDeclaration records, and SPEC-003
 * §6 defines 409 idempotency-conflict for same-key-different-payload.
 *
 * This middleware only validates header shape. The actual dedup check
 * (same key + same payload hash -> return prior result; same key +
 * different payload -> 409) belongs in each write handler, since it needs
 * a DB unique constraint + payload comparison, not just header presence.
 */
function requireIdempotencyKey(req, res, next) {
    const key = req.get('Idempotency-Key');
    if (!key || !isUuid(key)) {
        return res.status(400).json({
            type: 'https://api.familyconnect.org/v1/problems/invalid-payload',
            title: 'Missing or invalid Idempotency-Key header',
            status: 400,
            code: 'FC_ERR_400_INVALID_SCHEMA',
            detail: 'Idempotency-Key must be a UUIDv4 header on all state-altering requests.',
            instance: req.originalUrl,
        });
    }
    req.idempotencyKey = key;
    next();
}

module.exports = { requireIdempotencyKey };
