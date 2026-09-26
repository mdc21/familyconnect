/**
 * SPEC-008 Module M4: Essential Services Routes
 * Endpoints for authoritative status tracking and public transparency.
 */

const express = require('express');
const router = express.Router();
const essentialServicesService = require('./service');
const { requireActor } = require('../../middleware/actor');
const { requireAssuranceLevel } = require('../../middleware/assurance');
const { ProblemError } = require('../../middleware/problems');

// 1. GET /api/v1/essential-services — Public query of essential service statuses
router.get('/essential-services', async (req, res, next) => {
    try {
        const { communityId, district, serviceType, status } = req.query;
        const services = await essentialServicesService.listServices({
            communityId,
            district,
            serviceType,
            status
        });
        res.json({
            count: services.length,
            services
        });
    } catch (err) {
        next(err);
    }
});

// 2. GET /api/v1/essential-services/agreements — Governance transparency list of data-sharing agreements
router.get('/essential-services/agreements', async (req, res, next) => {
    try {
        const { status, serviceDomain } = req.query;
        const agreements = await essentialServicesService.listDataSharingAgreements({
            status,
            serviceDomain
        });
        res.json({
            count: agreements.length,
            agreements
        });
    } catch (err) {
        next(err);
    }
});

// 3. GET /api/v1/essential-services/:id — Single service status details
router.get('/essential-services/:id', async (req, res, next) => {
    try {
        const services = await essentialServicesService.listServices({});
        const found = services.find(s => s.serviceId === req.params.id || s.serviceReference === req.params.id);
        if (!found) {
            return res.status(404).json({
                type: 'https://api.familyconnect.org/v1/problems/resource-not-found',
                title: 'Essential Service Record Not Found',
                status: 404,
                code: 'FC_ERR_404_NOT_FOUND'
            });
        }
        res.json({ service: found });
    } catch (err) {
        next(err);
    }
});

// 4. POST /api/v1/essential-services/authoritative-feed — Authoritative feed ingestion
// Enforces source provenance & active data-sharing agreement validation
router.post('/essential-services/authoritative-feed', requireActor('AUTHORITY', 'PARTNER', 'ADMIN'), async (req, res, next) => {
    try {
        const {
            serviceReference,
            serviceType,
            communityId,
            district,
            localityName,
            operationalStatus,
            affectedPopulationEstimate,
            sourceAuthorityId,
            sourceAuthorityName,
            agreementRef,
            verificationReference,
            publicAdvisory,
            restorationEstimate,
            restorationTaskId
        } = req.body || {};

        const service = await essentialServicesService.ingestAuthoritativeFeed({
            serviceReference,
            serviceType,
            communityId,
            district,
            localityName,
            operationalStatus,
            affectedPopulationEstimate,
            sourceAuthorityId,
            sourceAuthorityName: sourceAuthorityName || req.actor?.organisation || req.actor?.actorId,
            agreementRef,
            verificationReference,
            publicAdvisory,
            restorationEstimate,
            restorationTaskId,
            actor: req.actor
        });

        res.status(201).json({
            message: 'Authoritative service status feed ingested successfully.',
            service
        });
    } catch (err) {
        next(err);
    }
});

// 5. POST /api/v1/essential-services/:id/verify — Authority verification & status confirmation
// Gated to AUTHORITY/ADMIN with IAL-2
router.post('/essential-services/:id/verify', requireActor('AUTHORITY', 'ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const { operationalStatus, publicAdvisory, restorationEstimate, verificationReference } = req.body || {};

        const updated = await essentialServicesService.verifyServiceStatus({
            serviceId: req.params.id,
            operationalStatus,
            publicAdvisory,
            restorationEstimate,
            verificationReference,
            actor: req.actor
        });

        res.json({
            message: 'Essential service status officially verified and confirmed.',
            service: updated
        });
    } catch (err) {
        next(err);
    }
});

// 6. GET /api/v1/communities/:id/services — Community-scoped essential services (SPEC-008 §9)
router.get('/communities/:id/services', async (req, res, next) => {
    try {
        const summary = await essentialServicesService.getCommunityServices(req.params.id);
        res.json(summary);
    } catch (err) {
        if (err.code === 'NOT_FOUND') {
            return res.status(404).json({
                type: 'https://api.familyconnect.org/v1/problems/resource-not-found',
                title: 'Community Not Found',
                status: 404,
                code: 'FC_ERR_404_NOT_FOUND'
            });
        }
        next(err);
    }
});

module.exports = router;
