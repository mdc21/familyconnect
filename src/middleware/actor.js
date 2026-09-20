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
 * SPEC-008 DELTA Fix #2 (v0.3): Actor model trimmed from 9 to 6 classes.
 * Canonical set: PUBLIC, FAMILY, PARTNER, CASE_WORKER, AUTHORITY, ADMIN.
 *
 * Migration map for JWT tokens issued under the old 9-class model:
 *   PERSON        → PUBLIC  (unregistered self-reporters are public actors)
 *   PROXY         → FAMILY  (proxy contacts are family-authorised actors)
 *   SYSTEM_AUDITOR → PARTNER (AI agent role superseded by SPEC-009 AgentIdentity;
 *                             any in-flight SYSTEM_AUDITOR tokens map to PARTNER
 *                             which correctly restricts to PENDING update status)
 */
const ACTOR_CLASSES = [
    'PUBLIC', 'FAMILY', 'PARTNER',
    'CASE_WORKER', 'AUTHORITY', 'ADMIN',
];

/**
 * JWT legacy role migration map — silently upgrades deprecated role claims
 * in tokens issued before the SPEC-008 DELTA Fix #2 cutover.
 * Remove this map once all tokens have been reissued (≥ 90 days after deploy).
 */
const LEGACY_ROLE_MAP = {
    'PERSON':         'PUBLIC',
    'PROXY':          'FAMILY',
    'SYSTEM_AUDITOR': 'PARTNER',
};

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
            const rawRole = decoded.role || 'PUBLIC';
            // Apply JWT migration map for deprecated roles (SPEC-008 DELTA Fix #2)
            actorClass = LEGACY_ROLE_MAP[rawRole] || (ACTOR_CLASSES.includes(rawRole) ? rawRole : 'PUBLIC');
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
        const rawDebugClass = declaredClass || null;
        // Apply migration map for debug headers too, so test scripts using old class names still work
        if (rawDebugClass) {
            const mapped = LEGACY_ROLE_MAP[rawDebugClass] || (ACTOR_CLASSES.includes(rawDebugClass) ? rawDebugClass : null);
            if (mapped) actorClass = mapped;
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

module.exports = { resolveActor, evaluateAbac, requireActor, ACTOR_CLASSES, LEGACY_ROLE_MAP };
