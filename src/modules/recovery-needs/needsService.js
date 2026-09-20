/**
 * SPEC-008 — Community Recovery & Reconstruction Coordination
 * 
 * Core service implementing:
 * - RecoveryNeed lifecycle state machine (§5.1)
 * - Provenance & evidence auditing (FR-008-002)
 * - Anti-silent-merge duplicate review queue (BR-008-004 / FR-008-020)
 * - Information integrity / dispute resolution (FR-008-011)
 * - Minimum disclosure aggregation threshold for community profiles (BR-008-013)
 */

const { pool, writeAuditEvent } = require('../../db');

const VALID_TRANSITIONS = {
    'REPORTED': ['ASSESSED', 'RESTRICTED_PENDING_REVIEW'],
    'ASSESSED': ['VERIFIED', 'RESTRICTED_PENDING_REVIEW'],
    'VERIFIED': ['ASSIGNED', 'RESTRICTED_PENDING_REVIEW'],
    'ASSIGNED': ['IN_PROGRESS', 'RESTRICTED_PENDING_REVIEW'],
    'IN_PROGRESS': ['RESOLVED', 'RESTRICTED_PENDING_REVIEW'],
    'RESOLVED': ['CLOSED', 'IN_PROGRESS', 'RESTRICTED_PENDING_REVIEW'],
    'CLOSED': []
};

class RecoveryNeedsService {
    /**
     * Submit a recovery need (Public / Family intake)
     */
    async submitNeed({
        eventId,
        originatingRequestId,
        category,
        location = {},
        affectedPopulation = 1,
        severity = 'MEDIUM',
        narrative,
        evidence = [],
        actor = {}
    }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const insertRes = await client.query(
                `INSERT INTO recovery_need (
                    event_id, originating_request_id, category, location,
                    affected_population, severity, narrative, evidence,
                    provenance, verification_state, data_sharing_status,
                    owner_actor_id, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'UNVERIFIED', 'NORMAL', $10, 'REPORTED')
                RETURNING *`,
                [
                    eventId, originatingRequestId, category, JSON.stringify(location),
                    affectedPopulation, severity, narrative, JSON.stringify(evidence),
                    JSON.stringify({
                        actorClass: actor.actorClass || 'PUBLIC',
                        actorId: actor.actorId || null,
                        submittedAt: new Date().toISOString()
                    }),
                    actor.actorId || null
                ]
            );

            const need = insertRes.rows[0];

            // Anti-silent-merge duplicate detection check (BR-008-004 / FR-008-020)
            const potentialDups = await client.query(
                `SELECT need_id, category, narrative FROM recovery_need 
                 WHERE need_id != $1 
                   AND event_id = $2 
                   AND category = $3 
                   AND status NOT IN ('CLOSED', 'RESOLVED')
                 LIMIT 5`,
                [need.need_id, eventId, category]
            );

            for (const candidate of potentialDups.rows) {
                // If narratives match closely or categories align in same locality, queue for human review
                await client.query(
                    `INSERT INTO need_duplicate_candidate (
                        need_id_a, need_id_b, similarity_score, suggested_rationale
                    ) VALUES ($1, $2, 0.85, $3)`,
                    [need.need_id, candidate.need_id, `Same recovery category '${category}' under event ${eventId}`]
                );
            }

            await writeAuditEvent(client, {
                actor: actor.actorId || 'PUBLIC',
                organisation: actor.organisationId || 'PUBLIC',
                action: 'RECOVERY_NEED_REPORTED',
                entityType: 'RECOVERY_NEED',
                entityId: need.need_id,
                newState: { status: 'REPORTED', category, severity },
                accessReason: 'Public recovery need intake submission',
                outcome: 'SUCCESS'
            });

            await client.query('COMMIT');
            return need;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Transition need status following state machine rules
     */
    async transitionStatus({ needId, targetStatus, actor, note = '' }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const needRes = await client.query(
                'SELECT * FROM recovery_need WHERE need_id = $1 FOR UPDATE',
                [needId]
            );

            if (needRes.rows.length === 0) {
                const err = new Error(`Recovery need '${needId}' not found.`);
                err.code = 'NOT_FOUND';
                err.status = 404;
                throw err;
            }

            const need = needRes.rows[0];
            const currentStatus = need.status;

            // Validate transition
            const allowed = VALID_TRANSITIONS[currentStatus] || [];
            if (!allowed.includes(targetStatus)) {
                const err = new Error(`Invalid status transition from '${currentStatus}' to '${targetStatus}'.`);
                err.code = 'INVALID_TRANSITION';
                err.status = 400;
                throw err;
            }

            const updateRes = await client.query(
                `UPDATE recovery_need 
                 SET status = $1, updated_at = now() 
                 WHERE need_id = $2 
                 RETURNING *`,
                [targetStatus, needId]
            );

            await writeAuditEvent(client, {
                actor: actor.actorId || actor.actorClass,
                organisation: actor.organisationId || 'COORDINATION',
                action: `RECOVERY_NEED_${targetStatus}`,
                entityType: 'RECOVERY_NEED',
                entityId: needId,
                previousState: { status: currentStatus },
                newState: { status: targetStatus, note },
                accessReason: `Need state transition to ${targetStatus}`,
                outcome: 'SUCCESS'
            });

            await client.query('COMMIT');
            return updateRes.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * File a dispute or correction, shifting to RESTRICTED_PENDING_REVIEW
     */
    async fileDispute({ needId, actor, reason, evidence = [] }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const needRes = await client.query(
                'SELECT * FROM recovery_need WHERE need_id = $1 FOR UPDATE',
                [needId]
            );

            if (needRes.rows.length === 0) {
                const err = new Error(`Recovery need '${needId}' not found.`);
                err.code = 'NOT_FOUND';
                err.status = 404;
                throw err;
            }

            const need = needRes.rows[0];

            // Put into restricted pending review
            const updateRes = await client.query(
                `UPDATE recovery_need 
                 SET data_sharing_status = 'RESTRICTED_PENDING_REVIEW',
                     evidence = evidence || $1::jsonb,
                     updated_at = now() 
                 WHERE need_id = $2 
                 RETURNING *`,
                [JSON.stringify(evidence), needId]
            );

            // Log escalation
            await client.query(
                `INSERT INTO escalation (
                    trigger, impact_class, rationale, assigned_reviewer, status
                ) VALUES ($1, 'L3', $2, 'COORDINATOR', 'OPEN')`,
                [`DISPUTE_FILED_NEED_${needId}`, `Dispute filed by ${actor.actorClass}: ${reason}`]
            );

            await writeAuditEvent(client, {
                actor: actor.actorId || actor.actorClass,
                organisation: actor.organisationId || 'PUBLIC',
                action: 'RECOVERY_NEED_DISPUTED',
                entityType: 'RECOVERY_NEED',
                entityId: needId,
                previousState: { dataSharingStatus: need.data_sharing_status },
                newState: { dataSharingStatus: 'RESTRICTED_PENDING_REVIEW', reason },
                accessReason: 'Information integrity dispute filed per FR-008-011',
                outcome: 'SUCCESS'
            });

            await client.query('COMMIT');
            return updateRes.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Retrieve Community Recovery summary with privacy threshold enforcement (BR-008-013)
     */
    async getCommunitySummary(communityId) {
        const commRes = await pool.query(
            'SELECT * FROM community_profile WHERE community_id = $1',
            [communityId]
        );

        if (commRes.rows.length === 0) {
            const err = new Error(`Community profile '${communityId}' not found.`);
            err.code = 'NOT_FOUND';
            err.status = 404;
            throw err;
        }

        const comm = commRes.rows[0];

        // BR-008-013: If min_aggregation_threshold_met is false, suppress detailed counts
        if (!comm.min_aggregation_threshold_met) {
            return {
                communityId: comm.community_id,
                name: comm.name,
                adminHierarchy: comm.admin_hierarchy,
                thresholdMet: false,
                disclosureWarning: `BR-008-013 Privacy Safeguard: Locality population (${comm.population_estimate}) is below minimum aggregation threshold (${comm.min_aggregation_threshold}). Granular counts are suppressed to prevent re-identification.`,
                metrics: {
                    totalReportedNeeds: 'SUPPRESSED',
                    verifiedNeedsCount: 'SUPPRESSED',
                    unmetNeedsCount: 'SUPPRESSED'
                },
                serviceStates: comm.service_states || []
            };
        }

        // Calculate real aggregates when threshold is safely met
        const metricsRes = await pool.query(
            `SELECT 
                COUNT(*) as total_reported,
                COUNT(CASE WHEN verification_state = 'VERIFIED' THEN 1 END) as verified_count,
                COUNT(CASE WHEN status NOT IN ('RESOLVED', 'CLOSED') THEN 1 END) as unmet_count
             FROM recovery_need
             WHERE location->>'communityId' = $1`,
            [communityId]
        );

        const m = metricsRes.rows[0];

        return {
            communityId: comm.community_id,
            name: comm.name,
            adminHierarchy: comm.admin_hierarchy,
            thresholdMet: true,
            metrics: {
                totalReportedNeeds: parseInt(m.total_reported, 10),
                verifiedNeedsCount: parseInt(m.verified_count, 10),
                unmetNeedsCount: parseInt(m.unmet_count, 10)
            },
            serviceStates: comm.service_states || []
        };
    }
}

module.exports = new RecoveryNeedsService();
