/**
 * Test Suite: SPEC-008 Phase 4 Modules
 * Modules Tested:
 * - Module M5: Critical Infrastructure Status Tracking (FR-008-007)
 * - Module M9: Funding & Aid Coordination Ledger (Gate G2a Compliance Baseline)
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

describe('SPEC-008 Phase 4 Modules (M5, M9)', () => {
    let createdInfraId = null;
    let testProjectId = null;
    let testPledgeId = null;
    let testAllocationId = null;

    before(async () => {
        // Create an M8 recovery project to link allocations against
        const projRes = await pool.query(`
            INSERT INTO recovery_project (
                project_reference, event_id, title, objective, status, is_seed
            ) VALUES (
                'PROJ-TEST-P4-REBUILD', 'EVENT-NP-TIBET-2026', 'Rasuwa Water Intake Rebuild',
                'Reconstruct damaged gravity water intake network in Dhunche Ward 6', 'HUMAN_APPROVED', TRUE
            ) ON CONFLICT (project_reference) DO UPDATE SET title = EXCLUDED.title
            RETURNING project_id
        `);
        testProjectId = projRes.rows[0].project_id;
    });

    // ───────────────────────────────────────────────────────────
    // Module M5: Critical Infrastructure Status Tracking
    // ───────────────────────────────────────────────────────────
    describe('Module M5 — Critical Infrastructure Tracking', () => {
        it('GET /api/v1/infrastructure returns seeded road and bridge statuses', async () => {
            const res = await fetch(`${baseUrl}/api/v1/infrastructure`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(Array.isArray(data.infrastructure));
            assert.ok(data.infrastructure.length >= 3);

            const highway = data.infrastructure.find(i => i.routeCode === 'H02' && i.infraType === 'NATIONAL_HIGHWAY');
            assert.ok(highway);
            assert.equal(highway.district, 'Rasuwa');
            assert.equal(highway.leadAuthorityName, 'Department of Roads (DoR) — Bridge & Highway Division');
            assert.equal(highway.agreementRef, 'AGREE-DOR-ROADS-2026');
        });

        it('GET /api/v1/infrastructure?vehicleType=HEAVY_TRUCK filters by vehicle passability', async () => {
            const res = await fetch(`${baseUrl}/api/v1/infrastructure?vehicleType=HEAVY_TRUCK`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(Array.isArray(data.infrastructure));
            data.infrastructure.forEach(item => {
                assert.ok(item.passableVehicleTypes.includes('HEAVY_TRUCK'));
            });
        });

        it('POST /api/v1/infrastructure/authoritative-feed rejects PUBLIC actors with 404 (shielded)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/infrastructure/authoritative-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'PUBLIC',
                    'X-Debug-Actor-Id': 'public-driver-1'
                },
                body: JSON.stringify({
                    infraReference: 'INFRA-UNAUTH-ROAD',
                    infraType: 'NATIONAL_HIGHWAY',
                    assetName: 'Pasang Lhamu Highway',
                    district: 'Rasuwa',
                    localityName: 'Ramche',
                    agreementRef: 'AGREE-DOR-ROADS-2026'
                })
            });

            assert.equal(res.status, 404);
        });

        it('POST /api/v1/infrastructure/authoritative-feed rejects missing or invalid data-sharing agreement (SPEC-008 §13)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/infrastructure/authoritative-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'auth-engineer-1',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    infraReference: 'INFRA-UNKNOWN-AGREE',
                    infraType: 'FEEDER_ROAD',
                    assetName: 'Syabrubesi Secondary Access Road',
                    district: 'Rasuwa',
                    localityName: 'Syabrubesi',
                    leadAuthorityName: 'Local Contractor Group',
                    agreementRef: 'AGREE-NONEXISTENT-ROAD-999'
                })
            });

            assert.equal(res.status, 403);
        });

        it('POST /api/v1/infrastructure/authoritative-feed ingests verified highway update from DoR / Army Engineering', async () => {
            const res = await fetch(`${baseUrl}/api/v1/infrastructure/authoritative-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'dor-engineer-chief',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    infraReference: 'INFRA-H02-BETRAWATI-GRANG',
                    infraType: 'NATIONAL_HIGHWAY',
                    assetName: 'Pasang Lhamu Highway (Betrawati to Grang Section)',
                    routeCode: 'H02',
                    district: 'Rasuwa',
                    localityName: 'Grang Landslide Clearing Site',
                    chainageKm: 'KM 40+500',
                    operationalStatus: 'RESTRICTED_TIMED_CONVOY',
                    passableVehicleTypes: ['LIGHT_4X4', 'EMERGENCY_AMBULANCE'],
                    hazardType: 'SLUMP_EROSION',
                    leadAuthorityName: 'Department of Roads (DoR) — Bridge & Highway Division',
                    agreementRef: 'AGREE-DOR-ROADS-2026',
                    verificationReference: 'DOR-HIGHWAY-DISPATCH-20260925-01',
                    gpsCoordinates: { lat: 28.085, lng: 85.275 },
                    estimatedClearanceTime: '2026-10-06T12:00:00Z',
                    publicAdvisory: 'Two-way single lane pilot convoy operation under traffic police guidance.'
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.ok(data.asset);
            assert.equal(data.asset.infraReference, 'INFRA-H02-BETRAWATI-GRANG');
            assert.equal(data.asset.operationalStatus, 'RESTRICTED_TIMED_CONVOY');
            assert.equal(data.asset.verificationStatus, 'OFFICIAL_CONFIRMED');
            createdInfraId = data.asset.infraId;
        });

        it('POST /api/v1/infrastructure/:id/verify allows IAL-2 authority to confirm road clearance', async () => {
            const res = await fetch(`${baseUrl}/api/v1/infrastructure/${createdInfraId}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'dor-chief-inspector',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    operationalStatus: 'PASSABLE_ALL_VEHICLES',
                    passableVehicleTypes: ['HEAVY_TRUCK', 'LIGHT_4X4', 'MOTORCYCLE', 'PEDESTRIAN'],
                    publicAdvisory: 'Debris completely cleared. Dual lane traffic restored.',
                    verificationReference: 'DOR-FINAL-CLEARANCE-CERT-9912'
                })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.asset.operationalStatus, 'PASSABLE_ALL_VEHICLES');
            assert.equal(data.asset.verificationReference, 'DOR-FINAL-CLEARANCE-CERT-9912');

            // Confirm audit trail was written
            const auditRes = await pool.query(
                "SELECT * FROM audit_event WHERE entity_id = $1 AND action = 'INFRASTRUCTURE_STATUS_VERIFIED'",
                [createdInfraId]
            );
            assert.ok(auditRes.rows.length >= 1);
            assert.equal(auditRes.rows[0].actor, 'dor-chief-inspector');
        });
    });

    // ───────────────────────────────────────────────────────────
    // Module M9: Non-Custodial Funding & Aid Coordination Ledger
    // ───────────────────────────────────────────────────────────
    describe('Module M9 — Funding & Aid Coordination Ledger (Gate G2a)', () => {
        it('GET /api/v1/funding/pledges returns public pledges with ANONYMOUS_PUBLIC masking for public actors', async () => {
            const res = await fetch(`${baseUrl}/api/v1/funding/pledges`, {
                headers: { 'X-Debug-Actor-Class': 'PUBLIC' }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(Array.isArray(data.pledges));
            assert.ok(data.pledges.length >= 3);

            // Verify anonymous donor is shielded
            const anonPledge = data.pledges.find(p => p.pledgeReference === 'PLG-2026-PRIVATE-DIASPORA');
            assert.ok(anonPledge);
            assert.equal(anonPledge.donorName, 'Anonymous Philanthropic Donor');
            assert.equal(anonPledge.notes, null);
        });

        it('GET /api/v1/funding/pledges reveals donor details to privileged AUTHORITY actors', async () => {
            const res = await fetch(`${baseUrl}/api/v1/funding/pledges`, {
                headers: {
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'auditor-general',
                    'X-Debug-IAL': 'IAL-2'
                }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            const anonPledge = data.pledges.find(p => p.pledgeReference === 'PLG-2026-PRIVATE-DIASPORA');
            assert.ok(anonPledge);
            assert.ok(anonPledge.notes);
        });

        it('GET /api/v1/funding/transparency-summary returns aggregate aid across sectors (BR-008-013)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/funding/transparency-summary`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(data.totals);
            assert.ok(Array.isArray(data.sectors));
            assert.ok(data.sectors.length >= 2);

            const waterSector = data.sectors.find(s => s.sector === 'DRINKING_WATER');
            assert.ok(waterSector);
            assert.ok(waterSector.totalDeclared > 0);
        });

        it('POST /api/v1/funding/pledges registers institutional pledge with statutory tracking', async () => {
            const res = await fetch(`${baseUrl}/api/v1/funding/pledges`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'PARTNER',
                    'X-Debug-Actor-Id': 'unicef-country-rep',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    donorName: 'UNICEF Nepal Humanitarian Response',
                    pledgeType: 'MULTILATERAL_AGENCY',
                    currency: 'USD',
                    amountDeclared: 500000.00,
                    targetSector: 'DRINKING_WATER',
                    targetLocality: { districts: ['Rasuwa'] },
                    agreementRef: 'AGREE-NDRRMA-AID-2026',
                    ndrrmaTrackingNo: 'NDRRMA-UNICEF-2026-WASH-09',
                    swcApprovalRef: 'SWC-EMERGENCY-2026-104',
                    publicVisibility: 'PUBLIC',
                    notes: 'Water filtration tablets, bladder tanks, and school WASH station repairs.'
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.ok(data.pledge);
            assert.ok(data.pledge.pledgeReference.startsWith('PLG-'));
            assert.equal(data.pledge.amountDeclared, 500000);
            testPledgeId = data.pledge.pledgeId;
        });

        it('POST /api/v1/funding/pledges/:id/verify enables IAL-2 authority to confirm statutory SWC/NDRRMA clearance', async () => {
            const res = await fetch(`${baseUrl}/api/v1/funding/pledges/${testPledgeId}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'ndrrma-director-aid',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    ndrrmaTrackingNo: 'NDRRMA-UNICEF-2026-WASH-09-FINAL',
                    swcApprovalRef: 'SWC-EMERGENCY-2026-104-APPROVED',
                    notes: 'Approved under Emergency Fast-Track Protocol.'
                })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.pledge.verificationStatus, 'OFFICIAL_CONFIRMED');
            assert.equal(data.pledge.status, 'COMMITTED');
        });

        it('POST /api/v1/funding/allocations rejects allocation exceeding pledge amount (BR-008-025)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/funding/allocations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'coordinator-1',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    pledgeId: testPledgeId,
                    projectId: testProjectId,
                    allocatedAmount: 900000.00 // Exceeds 500,000 declared
                })
            });

            assert.equal(res.status, 400);
        });

        it('POST /api/v1/funding/allocations creates non-custodial allocation to M8 project', async () => {
            const res = await fetch(`${baseUrl}/api/v1/funding/allocations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'coordinator-1',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    pledgeId: testPledgeId,
                    projectId: testProjectId,
                    allocatedAmount: 150000.00,
                    currency: 'USD',
                    externalWireRef: 'UNICEF-WIRE-20260920-NP01',
                    notes: 'First milestone tranche for Dhunche gravity pipeline materials procurement.'
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.ok(data.allocation);
            assert.equal(data.allocation.allocatedAmount, 150000);
            assert.equal(data.allocation.allocationStatus, 'COMMITTED');
            testAllocationId = data.allocation.allocationId;
        });

        it('POST /api/v1/funding/allocations/:id/evidence records multi-party triangulated delivery attestation', async () => {
            // Party 1: Implementing Agency Attestation
            const res1 = await fetch(`${baseUrl}/api/v1/funding/allocations/${testAllocationId}/evidence`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'PARTNER',
                    'X-Debug-Actor-Id': 'unicef-field-officer',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    evidenceType: 'BANK_DEPOSIT_RECEIPT',
                    attestationTier: 'IMPLEMENTING_AGENCY',
                    attestingOrganisation: 'UNICEF Nepal / DWSSM Field Unit',
                    evidenceUrl: 'https://cdn.familyconnect.org/evidence/unicef-wire-receipt-01.pdf',
                    disbursedAmountUpdate: 150000.00,
                    notes: 'Direct grant disbursement transfer receipt verified.'
                })
            });

            assert.equal(res1.status, 201);
            const data1 = await res1.json();
            assert.equal(data1.attestationSummary.distinctTiers.length, 1);

            // Party 2: Local Government Ward Committee Acknowledgment (Triangulation)
            const res2 = await fetch(`${baseUrl}/api/v1/funding/allocations/${testAllocationId}/evidence`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'ward-chair-dhunche',
                    'X-Debug-IAL': 'IAL-2'
                },
                body: JSON.stringify({
                    evidenceType: 'LOCAL_WARD_ACKNOWLEDGMENT',
                    attestationTier: 'LOCAL_GOVERNMENT_WARD',
                    attestingOrganisation: 'Gosaikunda Rural Municipality Ward 6',
                    evidenceUrl: 'https://cdn.familyconnect.org/evidence/ward6-delivery-signoff.pdf',
                    notes: 'Ward committee verified delivery of 500 HDPE water pipes on site.'
                })
            });

            assert.equal(res2.status, 201);
            const data2 = await res2.json();
            assert.ok(data2.attestationSummary.isTriangulated, 'Multi-party triangulated attestation achieved');
            assert.ok(data2.attestationSummary.distinctTiers.includes('IMPLEMENTING_AGENCY'));
            assert.ok(data2.attestationSummary.distinctTiers.includes('LOCAL_GOVERNMENT_WARD'));
        });
    });
});
