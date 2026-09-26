/**
 * SPEC-008 Module M9: Funding & Aid Coordination Ledger Routes
 * Non-custodial coordination of pledges, project allocations, and proof-of-delivery milestones.
 */

const express = require('express');
const router = express.Router();
const fundingService = require('./service');
const { requireActor } = require('../../middleware/actor');
const { requireAssuranceLevel } = require('../../middleware/assurance');

// 1. GET /api/v1/funding/pledges — Public list of pledges (privacy-shielded)
router.get('/funding/pledges', async (req, res, next) => {
    try {
        const { eventId, targetSector, status } = req.query;
        const isPrivileged = req.actor && ['AUTHORITY', 'CASE_WORKER', 'ADMIN'].includes(req.actor.actorClass);
        const pledges = await fundingService.listPledges({
            eventId,
            targetSector,
            status,
            isPrivileged
        });
        res.json({
            count: pledges.length,
            pledges
        });
    } catch (err) {
        next(err);
    }
});

// 2. GET /api/v1/funding/transparency-summary — Public sector & locality aid summary
router.get('/funding/transparency-summary', async (req, res, next) => {
    try {
        const { eventId } = req.query;
        const summary = await fundingService.getTransparencySummary({ eventId });
        res.json(summary);
    } catch (err) {
        next(err);
    }
});

// 3. GET /api/v1/funding/pledges/:id — Single pledge detail and allocation ledger
router.get('/funding/pledges/:id', async (req, res, next) => {
    try {
        const isPrivileged = req.actor && ['AUTHORITY', 'CASE_WORKER', 'ADMIN'].includes(req.actor.actorClass);
        const pledge = await fundingService.getPledgeById(req.params.id, { isPrivileged });
        res.json({ pledge });
    } catch (err) {
        next(err);
    }
});

// 4. POST /api/v1/funding/pledges — Register recovery pledge
router.post('/funding/pledges', async (req, res, next) => {
    try {
        const {
            eventId,
            donorName,
            donorOrgId,
            pledgeType,
            currency,
            amountDeclared,
            targetSector,
            targetLocality,
            agreementRef,
            ndrrmaTrackingNo,
            swcApprovalRef,
            publicVisibility,
            notes
        } = req.body || {};

        const pledge = await fundingService.createPledge({
            eventId,
            donorName,
            donorOrgId,
            pledgeType,
            currency,
            amountDeclared,
            targetSector,
            targetLocality,
            agreementRef,
            ndrrmaTrackingNo,
            swcApprovalRef,
            publicVisibility,
            notes,
            actor: req.actor
        });

        res.status(201).json({
            message: 'Funding pledge registered successfully.',
            pledge
        });
    } catch (err) {
        next(err);
    }
});

// 5. POST /api/v1/funding/pledges/:id/verify — Authority verification & NDRRMA confirmation (IAL-2 gated)
router.post('/funding/pledges/:id/verify', requireActor('AUTHORITY', 'ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const { ndrrmaTrackingNo, swcApprovalRef, notes } = req.body || {};
        const updated = await fundingService.verifyPledge({
            pledgeId: req.params.id,
            ndrrmaTrackingNo,
            swcApprovalRef,
            notes,
            actor: req.actor
        });

        res.json({
            message: 'Funding pledge officially verified and recorded in statutory aid ledger.',
            pledge: updated
        });
    } catch (err) {
        next(err);
    }
});

// 6. POST /api/v1/funding/allocations — Allocate verified pledge to M8 Recovery Project
router.post('/funding/allocations', requireActor('AUTHORITY', 'PARTNER', 'ADMIN'), async (req, res, next) => {
    try {
        const {
            pledgeId,
            projectId,
            taskId,
            recipientOrgId,
            allocatedAmount,
            currency,
            externalWireRef,
            notes
        } = req.body || {};

        const allocation = await fundingService.createAllocation({
            pledgeId,
            projectId,
            taskId,
            recipientOrgId,
            allocatedAmount,
            currency,
            externalWireRef,
            notes,
            actor: req.actor
        });

        res.status(201).json({
            message: 'Aid allocation successfully recorded against recovery project.',
            allocation
        });
    } catch (err) {
        next(err);
    }
});

// 7. POST /api/v1/funding/allocations/:id/evidence — Multi-party delivery evidence submission
router.post('/funding/allocations/:id/evidence', requireActor('AUTHORITY', 'PARTNER', 'ADMIN'), async (req, res, next) => {
    try {
        const {
            evidenceType,
            attestationTier,
            attestingOrganisation,
            evidenceUrl,
            notes,
            disbursedAmountUpdate
        } = req.body || {};

        const result = await fundingService.recordDeliveryEvidence({
            allocationId: req.params.id,
            evidenceType,
            attestationTier,
            attestingOrganisation: attestingOrganisation || req.actor?.organisation || 'VERIFIED_PARTNER',
            evidenceUrl,
            notes,
            disbursedAmountUpdate,
            actor: req.actor
        });

        res.status(201).json({
            message: 'Delivery evidence and multi-party attestation recorded.',
            ...result
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
