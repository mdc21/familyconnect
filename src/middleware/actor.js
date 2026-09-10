/**
 * SPEC-003 §2: "Clients must never declare their own permissions in the
 * request payload. The API Gateway and Authorisation Filter resolve the
 * actor context dynamically from cryptographically validated bearer tokens."
 *
 * This is a scaffold: real deployment terminates JWT/OIDC/mTLS at the
 * gateway per SPEC-005 §15 and passes a verified actor assertion inward.
 * Here we decode a stubbed bearer token so downstream ABAC logic has a
 * consistent shape to evaluate against.
 *
 * Gap fix #7: SPEC-003's actor matrix (§2) never defined ADMIN, even
 * though the case-handover endpoint lists it as a permitted actor and
 * SPEC-001 §5.11 explicitly warns admins must not get blanket sensitive
 * access. ADMIN is added here as its own class with narrow permitted
 * surfaces (governance/config, not case content) rather than folding it
 * into AUTHORITY.
 */
const ACTOR_CLASSES = [
    'PUBLIC', 'PERSON', 'FAMILY', 'PROXY',
    'CASE_WORKER', 'PARTNER', 'AUTHORITY',
    'SYSTEM_AUDITOR', 'ADMIN',
];

const jwt = require('jsonwebtoken');
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'fc-dev-secret-change-in-production';

function resolveActor(req, res, next) {
    let actorClass = 'PUBLIC';
    let actorId = null;
    let organisationId = null;
    let assuranceLevel = 'IAL-0';

    // Parse Authorization: Bearer <jwt> header if present
    const auth = req.get('Authorization');
    if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            actorClass = decoded.role || 'PUBLIC';
            actorId = decoded.sub || null;
            organisationId = decoded.organisationId || null;
            assuranceLevel = 'IAL-2'; // Authenticated coordinator session meets IAL-2
        } catch (e) {
            // Invalid token falls back to PUBLIC
        }
    }

    // Local debug headers escape hatch
    if (process.env.NODE_ENV !== 'production') {
        const declaredClass = req.get('X-Debug-Actor-Class');
        if (declaredClass && ACTOR_CLASSES.includes(declaredClass)) {
            actorClass = declaredClass;
        }
        if (req.get('X-Debug-Actor-Id')) actorId = req.get('X-Debug-Actor-Id');
        if (req.get('X-Debug-Org-Id')) organisationId = req.get('X-Debug-Org-Id');
        if (req.get('X-Debug-IAL')) assuranceLevel = req.get('X-Debug-IAL');
    }

    req.actor = {
        actorClass,
        actorId,
        organisationId,
        assuranceLevel,
    };
    next();
}

/**
 * ABAC evaluation stub per SPEC-005 §7:
 * Actor Identity + Organization + Role + Assurance Level + Case Relationship
 * + Access Purpose + Data Classification + Geographic Restrictions + Active Disputes/Holds
 *
 * Returns 'ALLOW' | 'DENY' | 'LIMITED_DISCLOSURE'. Real implementation must
 * evaluate against the case's data_sharing_status (frozen while disputed,
 * per SPEC-004 §9) and the requested field's classification tier.
 */
function evaluateAbac({ actor, requiredClasses, caseDataSharingStatus }) {
    if (caseDataSharingStatus === 'RESTRICTED_PENDING_REVIEW' &&
        !['CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(actor.actorClass)) {
        return 'DENY';
    }
    if (!requiredClasses.includes(actor.actorClass)) return 'DENY';
    return 'ALLOW';
}

function requireActor(...allowedClasses) {
    return (req, res, next) => {
        const decision = evaluateAbac({
            actor: req.actor,
            requiredClasses: allowedClasses,
            caseDataSharingStatus: req.caseDataSharingStatus, // set by route handler after lookup
        });
        if (decision === 'DENY') {
            // BR-013 / SPEC-003 §6: generic 404, never a revealing 403, to shield against enumeration
            return res.status(404).json({
                type: 'https://api.familyconnect.org/v1/problems/resource-not-found',
                title: 'Not Found',
                status: 404,
                code: 'FC_ERR_404_NOT_FOUND',
            });
        }
        next();
    };
}

module.exports = { resolveActor, evaluateAbac, requireActor, ACTOR_CLASSES };
