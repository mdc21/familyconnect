// SPEC-003 §6 Error Catalog (RFC 9457 Problem Details)
const PROBLEMS = {
    INVALID_SCHEMA: { status: 400, type: '/problems/invalid-payload', code: 'FC_ERR_400_INVALID_SCHEMA' },
    AUTH_REQUIRED: { status: 401, type: '/problems/unauthenticated', code: 'FC_ERR_401_AUTH_REQUIRED' },
    DISPUTED_ACCESS: { status: 403, type: '/problems/case-data-restricted', code: 'FC_ERR_403_DISPUTED_ACCESS' },
    NOT_FOUND: { status: 404, type: '/problems/resource-not-found', code: 'FC_ERR_404_NOT_FOUND' },
    IDEMPOTENCY_CONFLICT: { status: 409, type: '/problems/idempotency-conflict', code: 'FC_ERR_409_IDEMPOTENCY' },
    CONCURRENCY_LOCK: { status: 412, type: '/problems/precondition-failed', code: 'FC_ERR_412_CONCURRENCY_LOCK' },
    ILLEGAL_TRANSITION: { status: 422, type: '/problems/illegal-transition', code: 'FC_ERR_422_STATE_TRANSITION' },
    RATE_LIMIT: { status: 429, type: '/problems/rate-limited', code: 'FC_ERR_429_RATE_LIMIT' },
    DEGRADED_MODE: { status: 503, type: '/problems/service-unavailable', code: 'FC_ERR_503_DEGRADED_MODE' },
};

class ProblemError extends Error {
    constructor(problemKey, detail, instance) {
        super(detail || problemKey);
        this.problemKey = problemKey;
        this.detail = detail;
        this.instance = instance;
    }
}

function problemJsonErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const isProblem = !!err.problemKey;
    const problem = PROBLEMS[err.problemKey] || { status: 500, type: '/problems/internal-error', code: 'FC_ERR_500_INTERNAL' };
    
    if (!isProblem) {
        console.error('Unhandled error:', err);
    }
    
    res.status(problem.status).type('application/problem+json').json({
        type: `https://api.familyconnect.org/v1${problem.type}`,
        title: isProblem ? err.message : 'An unexpected error occurred',
        status: problem.status,
        detail: isProblem ? err.detail : undefined,
        instance: err.instance || req.originalUrl,
        code: problem.code,
        timestamp: new Date().toISOString(),
    });
}

module.exports = { PROBLEMS, ProblemError, problemJsonErrorHandler };
