/**
 * SPEC-008 Module M5: Critical Infrastructure Routes
 * Endpoints for authoritative road, bridge, and clearance status coordination.
 */

const express = require('express');
const router = express.Router();
const infraService = require('./service');
const { requireActor } = require('../../middleware/actor');
const { requireAssuranceLevel } = require('../../middleware/assurance');

// 1. GET /api/v1/infrastructure — Public query of critical infrastructure assets
router.get('/infrastructure', async (req, res, next) => {
    try {
        const { district, infraType, operationalStatus, routeCode, vehicleType } = req.query;
        const assets = await infraService.listInfrastructure({
            district,
            infraType,
            operationalStatus,
            routeCode,
            vehicleType
        });
        res.json({
            count: assets.length,
            infrastructure: assets
        });
    } catch (err) {
        next(err);
    }
});

// 2. GET /api/v1/infrastructure/:id — Single infrastructure asset details
router.get('/infrastructure/:id', async (req, res, next) => {
    try {
        const asset = await infraService.getInfrastructureById(req.params.id);
        res.json({ asset });
    } catch (err) {
        next(err);
    }
});

// 3. POST /api/v1/infrastructure/authoritative-feed — Ingest authoritative update
// Enforces source provenance & active data-sharing agreement validation
router.post('/infrastructure/authoritative-feed', requireActor('AUTHORITY', 'PARTNER', 'ADMIN'), async (req, res, next) => {
    try {
        const {
            infraReference,
            infraType,
            assetName,
            routeCode,
            district,
            localityName,
            chainageKm,
            operationalStatus,
            passableVehicleTypes,
            hazardType,
            leadAuthorityName,
            agreementRef,
            verificationReference,
            contractorOrgId,
            gpsCoordinates,
            estimatedClearanceTime,
            publicAdvisory
        } = req.body || {};

        const asset = await infraService.ingestAuthoritativeFeed({
            infraReference,
            infraType,
            assetName,
            routeCode,
            district,
            localityName,
            chainageKm,
            operationalStatus,
            passableVehicleTypes,
            hazardType,
            leadAuthorityName: leadAuthorityName || req.actor?.organisation || req.actor?.actorId,
            agreementRef,
            verificationReference,
            contractorOrgId,
            gpsCoordinates,
            estimatedClearanceTime,
            publicAdvisory,
            actor: req.actor
        });

        res.status(201).json({
            message: 'Authoritative infrastructure status feed ingested successfully.',
            asset
        });
    } catch (err) {
        next(err);
    }
});

// 4. POST /api/v1/infrastructure/:id/verify — Authority verification & status confirmation
// Gated to AUTHORITY/ADMIN with IAL-2
router.post('/infrastructure/:id/verify', requireActor('AUTHORITY', 'ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const {
            operationalStatus,
            passableVehicleTypes,
            publicAdvisory,
            estimatedClearanceTime,
            verificationReference
        } = req.body || {};

        const updated = await infraService.verifyInfrastructureStatus({
            infraId: req.params.id,
            operationalStatus,
            passableVehicleTypes,
            publicAdvisory,
            estimatedClearanceTime,
            verificationReference,
            actor: req.actor
        });

        res.json({
            message: 'Infrastructure status officially verified and confirmed.',
            asset: updated
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
