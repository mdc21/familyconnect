const { v4: uuidv4, validate: isUuid } = require('uuid');

/**
 * SPEC-003 §1 Standard Headers.
 * X-Correlation-ID is required for end-to-end tracing across API, workers, and audit logs.
 * X-Disaster-Event-ID links the operation to an active DisasterEvent.
 * Generates a correlation id if the caller omitted one, rather than rejecting the
 * request — degraded field clients over 2G should not be blocked by a missing header.
 */
function correlationAndEventContext(req, res, next) {
    const correlationId = req.get('X-Correlation-ID');
    req.correlationId = correlationId && isUuid(correlationId) ? correlationId : uuidv4();
    res.set('X-Correlation-ID', req.correlationId);

    req.disasterEventId = req.get('X-Disaster-Event-ID') || null;
    req.acceptLanguage = req.get('Accept-Language') || 'en';

    next();
}

module.exports = { correlationAndEventContext };
