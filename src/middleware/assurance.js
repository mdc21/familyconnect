/**
 * SPEC-004 §5 defines IAL-0 through IAL-4 identity assurance levels as a
 * dimension separate from role/actor-class: a CASE_WORKER account that
 * hasn't completed step-up MFA is still only IAL-1, and some actions
 * (HIGHLY_RESTRICTED evidence, safeguarding handover, external case
 * handover) require IAL-2+ regardless of what role the actor otherwise
 * holds. This middleware enforces that as its own check, so a compromised
 * or under-verified session can't reach these actions just by having the
 * right actorClass.
 */
const IAL_RANK = { 'IAL-0': 0, 'IAL-1': 1, 'IAL-2': 2, 'IAL-3': 3, 'IAL-4': 4 };

function requireAssuranceLevel(minLevel) {
    const minRank = IAL_RANK[minLevel];
    return function assuranceGate(req, res, next) {
        const actorRank = IAL_RANK[req.actor && req.actor.assuranceLevel] ?? 0;
        if (actorRank < minRank) {
            return res.status(401).type('application/problem+json').json({
                type: 'https://api.familyconnect.org/v1/problems/step-up-required',
                title: `This action requires identity assurance level ${minLevel} or higher.`,
                status: 401,
                code: 'FC_ERR_401_AUTH_REQUIRED',
                instance: req.originalUrl,
            });
        }
        next();
    };
}

module.exports = { requireAssuranceLevel, IAL_RANK };
