const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireActor } = require('../../middleware/actor');
const agentGovernance = require('../../services/ai/agentGovernance');

const router = express.Router();

const ALLOWED_RESOURCE_TYPES = [
    'VOLUNTEERS',
    'MACHINERY',
    'TRANSPORT',
    'PROFESSIONAL_SKILLS',
    'SUPPLIES',
    'SHELTER_MATERIALS',
    'WATER_PURIFICATION'
];

/**
 * POST /api/v1/resources/offers
 * Module M6 — Submit resource offer (SPEC-008 §8 & §9).
 * Actors: PUBLIC, PARTNER, AUTHORITY, ADMIN.
 */
router.post('/offers', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const {
            providerName,
            providerOrgId,
            resourceType,
            capacity,
            location,
            availability
        } = req.body || {};

        if (!providerName || !resourceType || !capacity) {
            throw new ProblemError('INVALID_SCHEMA', 'providerName, resourceType, and capacity are required.', req.originalUrl);
        }

        if (!ALLOWED_RESOURCE_TYPES.includes(resourceType)) {
            throw new ProblemError('INVALID_SCHEMA', `resourceType must be one of: ${ALLOWED_RESOURCE_TYPES.join(', ')}`, req.originalUrl);
        }

        await client.query('BEGIN');

        const insertRes = await client.query(
            `INSERT INTO resource_offer (
                provider_name, provider_actor_id, provider_org_id,
                resource_type, capacity, location, availability,
                verification_status, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'UNVERIFIED', 'AVAILABLE')
            RETURNING *`,
            [
                providerName,
                req.actor?.actorId || null,
                providerOrgId || null,
                resourceType,
                JSON.stringify(capacity),
                JSON.stringify(location || {}),
                JSON.stringify(availability || {})
            ]
        );

        const offer = insertRes.rows[0];

        await writeAuditEvent(client, {
            actor: req.actor?.actorId || req.actor?.actorClass || 'PUBLIC',
            organisation: providerOrgId || 'RESOURCE_DESK',
            action: 'RESOURCE_OFFER_SUBMITTED',
            entityType: 'RESOURCE_OFFER',
            entityId: offer.offer_id,
            newState: { resourceType, status: 'AVAILABLE' },
            accessReason: 'Submitted resource offer for coordination pool',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Resource offer registered successfully.',
            offer: {
                offerId: offer.offer_id,
                providerName: offer.provider_name,
                resourceType: offer.resource_type,
                capacity: offer.capacity,
                location: offer.location,
                availability: offer.availability,
                verificationStatus: offer.verification_status,
                status: offer.status,
                createdAt: offer.created_at
            }
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/resources/offers
 * Module M6 — Lists available resource offers.
 */
router.get('/offers', async (req, res, next) => {
    try {
        const { status, resourceType } = req.query;
        let query = 'SELECT * FROM resource_offer WHERE 1=1';
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }
        if (resourceType) {
            params.push(resourceType);
            query += ` AND resource_type = $${params.length}`;
        }

        query += ' ORDER BY created_at DESC LIMIT 50';
        const result = await pool.query(query, params);

        res.json({
            offers: result.rows.map(r => ({
                offerId: r.offer_id,
                providerName: r.provider_name,
                providerOrgId: r.provider_org_id,
                resourceType: r.resource_type,
                capacity: r.capacity,
                location: r.location,
                availability: r.availability,
                verificationStatus: r.verification_status,
                status: r.status,
                matchedNeedId: r.matched_need_id,
                matchedProposalId: r.matched_proposal_id,
                createdAt: r.created_at
            }))
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/resources/offers/:id/match-proposal
 * Module M6 — Generates an AI matching proposal via A03-NEEDS agent (FR-008-008 & SPEC-009).
 * Transitions offer status to MATCH_PROPOSED; awaits human decision.
 */
router.post('/offers/:id/match-proposal', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const offerId = req.params.id;
        const { targetNeedId, rationale } = req.body || {};

        if (!targetNeedId) {
            throw new ProblemError('INVALID_SCHEMA', 'targetNeedId is required to formulate match proposal.', req.originalUrl);
        }

        await client.query('BEGIN');

        // Verify offer exists and is available
        const offerRes = await client.query(
            'SELECT * FROM resource_offer WHERE offer_id = $1 FOR UPDATE',
            [offerId]
        );
        if (offerRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', 'Resource offer not found.', req.originalUrl);
        }
        const offer = offerRes.rows[0];
        if (offer.status !== 'AVAILABLE') {
            throw new ProblemError('INVALID_SCHEMA', `Offer status '${offer.status}' cannot receive a match proposal. Must be AVAILABLE.`, req.originalUrl);
        }

        // Verify target need exists
        const needRes = await client.query(
            'SELECT * FROM recovery_need WHERE need_id = $1',
            [targetNeedId]
        );
        if (needRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', 'Target recovery need not found.', req.originalUrl);
        }
        const need = needRes.rows[0];

        // Create AI proposal via A03-NEEDS agent
        const proposalResult = await agentGovernance.createProposal({
            agentId: 'A03-NEEDS',
            trigger: 'RESOURCE_NEED_MATCH_DETECTED',
            problemStatement: `Unmet recovery need ${need.need_id} (${need.category}) in ${JSON.stringify(need.location)} requires resources.`,
            affectedCapability: 'M6_RESOURCE_EXCHANGE',
            proposedChange: `Allocate verified offer ${offer.offer_id} (${offer.resource_type}) from provider '${offer.provider_name}' to satisfy need ${need.need_id}.`,
            expectedOutcome: `Expedite resolution of need ${need.need_id} with available capacity ${JSON.stringify(offer.capacity)}.`,
            uncertainty: 0.15,
            impactClass: 'L2',
            evidenceRefs: [
                { type: 'RESOURCE_OFFER', ref: offer.offer_id },
                { type: 'RECOVERY_NEED', ref: need.need_id }
            ],
            riskAssessment: {
                safeguards: 'Human coordinator authorization required before dispatch.',
                rationale: rationale || 'Sector-specific capacity alignment.'
            },
            humanDecisionOwner: 'COORDINATION_OFFICER',
            expiresHours: 48
        });

        const proposalId = proposalResult.proposal?.proposal_id || proposalResult.proposalId;

        // Update resource offer state
        const updateRes = await client.query(
            `UPDATE resource_offer
             SET status = 'MATCH_PROPOSED',
                 matched_need_id = $1,
                 matched_proposal_id = $2,
                 updated_at = now()
             WHERE offer_id = $3
             RETURNING *`,
            [targetNeedId, proposalId, offerId]
        );

        await client.query('COMMIT');

        res.status(202).json({
            message: 'Match proposal submitted for human reviewer approval.',
            proposal: {
                proposalId,
                consolidated: Boolean(proposalResult.consolidated)
            },
            offer: updateRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/resources/offers/:id/match-decision
 * Module M6 — Human approval gate before match is activated (FR-008-008).
 * Requires CASE_WORKER, AUTHORITY, or ADMIN actor class.
 */
router.post('/offers/:id/match-decision', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const actorClass = req.actor?.actorClass;
        if (!['CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }

        const offerId = req.params.id;
        const { decision, rationale } = req.body || {};

        if (!['APPROVED', 'REJECTED'].includes(decision)) {
            throw new ProblemError('INVALID_SCHEMA', "decision must be either 'APPROVED' or 'REJECTED'.", req.originalUrl);
        }

        await client.query('BEGIN');

        const offerRes = await client.query(
            'SELECT * FROM resource_offer WHERE offer_id = $1 FOR UPDATE',
            [offerId]
        );
        if (offerRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', 'Resource offer not found.', req.originalUrl);
        }
        const offer = offerRes.rows[0];

        if (offer.status !== 'MATCH_PROPOSED' || !offer.matched_proposal_id) {
            throw new ProblemError('INVALID_SCHEMA', `Offer must be in 'MATCH_PROPOSED' status with an active proposal. Current: ${offer.status}`, req.originalUrl);
        }

        // Record decision in AI proposal governance
        await agentGovernance.submitDecision({
            proposalId: offer.matched_proposal_id,
            actor: req.actor,
            decision,
            rationale: rationale || `Human coordinator ${req.actor.actorId || req.actor.actorClass} set decision to ${decision}`
        });

        let updatedOffer;
        if (decision === 'APPROVED') {
            const upRes = await client.query(
                `UPDATE resource_offer
                 SET status = 'MATCHED',
                     verification_status = 'VERIFIED',
                     updated_at = now()
                 WHERE offer_id = $1
                 RETURNING *`,
                [offerId]
            );
            updatedOffer = upRes.rows[0];

            // If need is linked, advance need to ASSIGNED
            if (offer.matched_need_id) {
                await client.query(
                    `UPDATE recovery_need
                     SET status = CASE WHEN status = 'REPORTED' OR status = 'ASSESSED' THEN 'ASSIGNED' ELSE status END,
                         assigned_to = COALESCE(assigned_to, $1),
                         updated_at = now()
                     WHERE need_id = $2`,
                    [offer.provider_name, offer.matched_need_id]
                );
            }

            await writeAuditEvent(client, {
                actor: req.actor.actorId || req.actor.actorClass,
                organisation: req.actor.organisationId || 'COORDINATION_DESK',
                action: 'RESOURCE_MATCH_APPROVED',
                entityType: 'RESOURCE_OFFER',
                entityId: offerId,
                newState: { status: 'MATCHED', matchedNeedId: offer.matched_need_id },
                accessReason: 'Human coordinator approved AI resource match proposal',
                outcome: 'SUCCESS'
            });
        } else {
            // REJECTED -> reset offer to AVAILABLE
            const upRes = await client.query(
                `UPDATE resource_offer
                 SET status = 'AVAILABLE',
                     matched_need_id = null,
                     matched_proposal_id = null,
                     updated_at = now()
                 WHERE offer_id = $1
                 RETURNING *`,
                [offerId]
            );
            updatedOffer = upRes.rows[0];

            await writeAuditEvent(client, {
                actor: req.actor.actorId || req.actor.actorClass,
                organisation: req.actor.organisationId || 'COORDINATION_DESK',
                action: 'RESOURCE_MATCH_REJECTED',
                entityType: 'RESOURCE_OFFER',
                entityId: offerId,
                newState: { status: 'AVAILABLE' },
                accessReason: 'Human coordinator rejected AI resource match proposal',
                outcome: 'SUCCESS'
            });
        }

        await client.query('COMMIT');

        res.json({
            message: `Match proposal ${decision.toLowerCase()} by coordinator.`,
            decision,
            offer: updatedOffer
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
