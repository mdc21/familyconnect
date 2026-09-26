/**
 * Test Suite: SPEC-008 Module M4 Essential Services & Data-Sharing Governance
 * Validates:
 * - Public queries for essential services & data-sharing agreements
 * - Community-scoped essential services aggregation
 * - Authoritative feed provenance & active data-sharing agreement enforcement (FR-008-006, SPEC-008 §13)
 * - Domain mismatch and inactive agreement rejection
 * - Authority verification flow with IAL-2 assurance level requirement
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db');
const { app } = require('../src/app');

let server;
let baseUrl;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

after(async () => {
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
});

describe('SPEC-008 Module M4 — Essential Services Coordination', () => {
    let createdServiceId = null;

    describe('Public Queries & Governance Transparency', () => {
        it('GET /api/v1/essential-services returns list of operational and disrupted services', async () => {
            const res = await fetch(`${baseUrl}/api/v1/essential-services`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(Array.isArray(data.services));
            assert.ok(data.services.length >= 4);

            const waterService = data.services.find(s => s.serviceType === 'DRINKING_WATER' && s.district === 'Rasuwa');
            assert.ok(waterService);
            assert.equal(waterService.sourceAuthorityName, 'Department of Water Supply & Sewerage Management (DWSSM)');
            assert.equal(waterService.agreementRef, 'AGREE-DWSS-WATER-2026');
        });

        it('GET /api/v1/essential-services/agreements returns active data-sharing agreements', async () => {
            const res = await fetch(`${baseUrl}/api/v1/essential-services/agreements`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(Array.isArray(data.agreements));
            assert.ok(data.agreements.length >= 5);

            const powerAgreement = data.agreements.find(a => a.agreementRef === 'AGREE-NEA-POWER-2026');
            assert.ok(powerAgreement);
            assert.equal(powerAgreement.serviceDomain, 'ELECTRICITY');
            assert.equal(powerAgreement.status, 'ACTIVE');
        });

        it('GET /api/v1/communities/:id/services returns community-scoped services', async () => {
            const res = await fetch(`${baseUrl}/api/v1/communities/comm-rasuwa-dhunche/services`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.communityId, 'comm-rasuwa-dhunche');
            assert.equal(data.communityName, 'Dhunche Bazaar & Environs');
            assert.ok(Array.isArray(data.services));
            assert.ok(data.services.length >= 3);
        });

        it('GET /api/v1/communities/:id/services returns 404 for nonexistent community', async () => {
            const res = await fetch(`${baseUrl}/api/v1/communities/comm-unknown-999/services`);
            assert.equal(res.status, 404);
            const data = await res.json();
            assert.equal(data.code, 'FC_ERR_404_NOT_FOUND');
        });
    });

    describe('Authoritative Feed Ingestion & Data-Sharing Agreement Gating', () => {
        it('POST /api/v1/essential-services/authoritative-feed rejects PUBLIC actors with 404 (shielded)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/essential-services/authoritative-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'PUBLIC',
                    'X-Debug-Actor-Id': 'public-citizen-1'
                },
                body: JSON.stringify({
                    serviceReference: 'ESS-UNAUTH-01',
                    serviceType: 'ELECTRICITY',
                    district: 'Rasuwa',
                    localityName: 'Dhunche',
                    agreementRef: 'AGREE-NEA-POWER-2026'
                })
            });

            assert.equal(res.status, 404);
        });

        it('POST /api/v1/essential-services/authoritative-feed rejects unknown agreementRef (FR-008-006 / §13)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/essential-services/authoritative-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'auth-officer-10',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    serviceReference: 'ESS-TEST-UNKNOWN-AGREE',
                    serviceType: 'ELECTRICITY',
                    district: 'Rasuwa',
                    localityName: 'Syabrubesi Hydro Substation',
                    sourceAuthorityName: 'Independent Energy Co',
                    agreementRef: 'AGREE-NONEXISTENT-999',
                    operationalStatus: 'DISRUPTED',
                    publicAdvisory: 'Generator trip on turbine 2'
                })
            });

            assert.equal(res.status, 403);
            const data = await res.json();
            assert.equal(data.status, 403);
        });

        it('POST /api/v1/essential-services/authoritative-feed rejects domain mismatch', async () => {
            const res = await fetch(`${baseUrl}/api/v1/essential-services/authoritative-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'auth-officer-10',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    serviceReference: 'ESS-TEST-MISMATCH',
                    serviceType: 'DRINKING_WATER', // DWSSM domain, but passing NEA power agreement
                    district: 'Rasuwa',
                    localityName: 'Dhunche North',
                    sourceAuthorityName: 'Nepal Electricity Authority (NEA)',
                    agreementRef: 'AGREE-NEA-POWER-2026',
                    operationalStatus: 'OPERATIONAL'
                })
            });

            assert.equal(res.status, 400);
            const data = await res.json();
            assert.equal(data.status, 400);
        });

        it('POST /api/v1/essential-services/authoritative-feed ingests valid feed from verified authority', async () => {
            const res = await fetch(`${baseUrl}/api/v1/essential-services/authoritative-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'nea-grid-dispatcher',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    serviceReference: 'ESS-RASUWA-POWER-SYABRUBESI',
                    serviceType: 'ELECTRICITY',
                    communityId: 'comm-rasuwa-dhunche',
                    district: 'Rasuwa',
                    localityName: 'Syabrubesi Distribution Ring',
                    operationalStatus: 'RESTORATION_IN_PROGRESS',
                    affectedPopulationEstimate: 1200,
                    sourceAuthorityName: 'Nepal Electricity Authority (NEA)',
                    agreementRef: 'AGREE-NEA-POWER-2026',
                    verificationReference: 'NEA-DESPATCH-20260920-8812',
                    publicAdvisory: 'Emergency transmission tower erection underway; diesel gen backup at health post.',
                    restorationEstimate: '2026-10-08T18:00:00Z'
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.ok(data.service);
            assert.equal(data.service.serviceReference, 'ESS-RASUWA-POWER-SYABRUBESI');
            assert.equal(data.service.operationalStatus, 'RESTORATION_IN_PROGRESS');
            assert.equal(data.service.agreementRef, 'AGREE-NEA-POWER-2026');
            assert.equal(data.service.verificationStatus, 'OFFICIAL_CONFIRMED');
            createdServiceId = data.service.serviceId;
        });
    });

    describe('Authority Verification & Outage Tracking', () => {
        it('POST /api/v1/essential-services/:id/verify rejects IAL-0 actor with 401 (step-up required)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/essential-services/${createdServiceId}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'low-assurance-officer',
                    'X-Debug-IAL': 'IAL-0'
                },
                body: JSON.stringify({
                    operationalStatus: 'OPERATIONAL',
                    publicAdvisory: 'Power fully restored.'
                })
            });

            assert.equal(res.status, 401);
        });

        it('POST /api/v1/essential-services/:id/verify allows IAL-2 AUTHORITY to confirm restoration', async () => {
            const res = await fetch(`${baseUrl}/api/v1/essential-services/${createdServiceId}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'chief-nea-inspector',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    operationalStatus: 'OPERATIONAL',
                    publicAdvisory: 'Power fully restored and load tested on all Syabrubesi feeder circuits.',
                    verificationReference: 'NEA-FINAL-SIGNOFF-9942'
                })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.service.operationalStatus, 'OPERATIONAL');
            assert.equal(data.service.verificationReference, 'NEA-FINAL-SIGNOFF-9942');
            assert.equal(data.service.verificationStatus, 'OFFICIAL_CONFIRMED');

            // Verify audit_event record was appended
            const auditRes = await pool.query(
                "SELECT * FROM audit_event WHERE entity_id = $1 AND action = 'ESSENTIAL_SERVICE_STATUS_VERIFIED'",
                [createdServiceId]
            );
            assert.ok(auditRes.rows.length >= 1);
            assert.equal(auditRes.rows[0].actor, 'chief-nea-inspector');
        });
    });
});
