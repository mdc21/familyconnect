/**
 * Test Suite: SPEC-008 Phase 3 Modules
 * Modules Tested:
 * - Module M7: Organisation Registry & Admin-Gated Verification Flow
 * - Module M6: Resource Exchange & AI Match Proposal (A03-NEEDS) with Human Approval Gate
 * - Module M8: Recovery Projects & Public Transparency API (FR-008-013)
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

describe('SPEC-008 Phase 3 Modules (M7, M6, M8)', () => {
    let testOrgId = null;
    let testOfferId = null;
    let testNeedId = null;
    let testProjectId = null;

    before(async () => {
        // Create a recovery need to match against
        const needRes = await pool.query(`
            INSERT INTO recovery_need (
                event_id, category, location, affected_population,
                severity, narrative, status, verification_state, is_seed
            ) VALUES (
                'EVENT-NP-TIBET-2026', 'DRINKING_WATER',
                '{"communityId": "comm-rasuwa-dhunche"}'::jsonb,
                50, 'HIGH', 'Water filtration cartridges required.',
                'REPORTED', 'UNVERIFIED', TRUE
            ) RETURNING need_id
        `);
        testNeedId = needRes.rows[0].need_id;
    });

    // ───────────────────────────────────────────────────────────
    // M7: Organisation Registry & Verification
    // ───────────────────────────────────────────────────────────
    describe('Module M7 — Organisation Registry & Verification', () => {
        it('POST /api/v1/organisations registers partner with PENDING verification status', async () => {
            const res = await fetch(`${baseUrl}/api/v1/organisations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'PUBLIC',
                    'X-Debug-Actor-Id': 'ngo-rep-101'
                },
                body: JSON.stringify({
                    name: 'Himalayan Water Relief Initiative',
                    organisationType: 'HUMANITARIAN',
                    country: 'NP',
                    capabilities: ['WATER_PURIFICATION', 'MOBILE_FILTRATION'],
                    geographicScope: { districts: ['Rasuwa', 'Sindhupalchok'] }
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.ok(data.organisation.organisationId);
            assert.equal(data.organisation.name, 'Himalayan Water Relief Initiative');
            assert.equal(data.organisation.verificationStatus, 'PENDING');
            assert.equal(data.organisation.operationalStatus, 'PENDING');
            testOrgId = data.organisation.organisationId;
        });

        it('GET /api/v1/organisations shields unverified organisation from public callers', async () => {
            const res = await fetch(`${baseUrl}/api/v1/organisations`, {
                headers: {
                    'X-Debug-Actor-Class': 'PUBLIC'
                }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(Array.isArray(data.organisations));
            // Unverified test organisation must NOT be present in public list
            const found = data.organisations.find(o => o.organisationId === testOrgId);
            assert.equal(found, undefined);
        });

        it('POST /api/v1/organisations/:id/verify rejects non-admin callers with 404', async () => {
            const res = await fetch(`${baseUrl}/api/v1/organisations/${testOrgId}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'FAMILY',
                    'X-Debug-Actor-Id': 'regular-user'
                },
                body: JSON.stringify({ note: 'Attempted self verification' })
            });

            assert.equal(res.status, 404);
        });

        it('POST /api/v1/organisations/:id/verify allows ADMIN to verify and activate partner', async () => {
            const res = await fetch(`${baseUrl}/api/v1/organisations/${testOrgId}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'ADMIN',
                    'X-Debug-Actor-Id': 'admin-chief-01'
                },
                body: JSON.stringify({ note: 'Accredited with Nepal Social Welfare Council' })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.organisation.verificationStatus, 'VERIFIED');
            assert.equal(data.organisation.operationalStatus, 'ACTIVE');

            // Audit event verification
            const auditRes = await pool.query(
                "SELECT * FROM audit_event WHERE action = 'ORGANISATION_VERIFIED' AND entity_id = $1",
                [testOrgId]
            );
            assert.ok(auditRes.rows.length > 0);
        });
    });

    // ───────────────────────────────────────────────────────────
    // M6: Resource Exchange & AI Match Proposals
    // ───────────────────────────────────────────────────────────
    describe('Module M6 — Resource Exchange & AI Match Proposals', () => {
        it('POST /api/v1/resources/offers registers available resource offer', async () => {
            const res = await fetch(`${baseUrl}/api/v1/resources/offers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'PARTNER',
                    'X-Debug-Actor-Id': 'partner-agent-01'
                },
                body: JSON.stringify({
                    providerName: 'Himalayan Water Relief Initiative',
                    providerOrgId: testOrgId,
                    resourceType: 'WATER_PURIFICATION',
                    capacity: { units: 20, filtration_capacity_litres_hour: 2000 },
                    location: { communityId: 'comm-rasuwa-dhunche' },
                    availability: { status: 'IMMEDIATE' }
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.ok(data.offer.offerId);
            assert.equal(data.offer.status, 'AVAILABLE');
            assert.equal(data.offer.resourceType, 'WATER_PURIFICATION');
            testOfferId = data.offer.offerId;
        });

        it('POST /api/v1/resources/offers/:id/match-proposal triggers A03-NEEDS AI proposal', async () => {
            const res = await fetch(`${baseUrl}/api/v1/resources/offers/${testOfferId}/match-proposal`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'CASE_WORKER',
                    'X-Debug-Actor-Id': 'coordinator-01'
                },
                body: JSON.stringify({
                    targetNeedId: testNeedId,
                    rationale: 'High compatibility: water purification offer matches drinking water need in Dhunche.'
                })
            });

            assert.equal(res.status, 202);
            const data = await res.json();
            assert.ok(data.proposal.proposalId);
            assert.equal(data.offer.status, 'MATCH_PROPOSED');
            assert.equal(data.offer.matched_need_id, testNeedId);

            // Verify proposal exists in ai_proposal table under A03-NEEDS
            const propRes = await pool.query(
                'SELECT * FROM ai_proposal WHERE proposal_id = $1',
                [data.proposal.proposalId]
            );
            assert.ok(propRes.rows.length > 0);
            assert.equal(propRes.rows[0].agent_id, 'A03-NEEDS');
            assert.equal(propRes.rows[0].decision, 'PENDING');
        });

        it('POST /api/v1/resources/offers/:id/match-decision enforces human approval gate', async () => {
            // Human coordinator approves match
            const res = await fetch(`${baseUrl}/api/v1/resources/offers/${testOfferId}/match-decision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'CASE_WORKER',
                    'X-Debug-Actor-Id': 'human-coordinator-42'
                },
                body: JSON.stringify({
                    decision: 'APPROVED',
                    rationale: 'Verified local transport route is open; approved for dispatch.'
                })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.decision, 'APPROVED');
            assert.equal(data.offer.status, 'MATCHED');

            // Verify need state was advanced to ASSIGNED
            const needCheck = await pool.query('SELECT status, assigned_to FROM recovery_need WHERE need_id = $1', [testNeedId]);
            assert.equal(needCheck.rows[0].status, 'ASSIGNED');
            assert.equal(needCheck.rows[0].assigned_to, 'Himalayan Water Relief Initiative');
        });
    });

    // ───────────────────────────────────────────────────────────
    // M8: Recovery Projects & Public Transparency API
    // ───────────────────────────────────────────────────────────
    describe('Module M8 — Recovery Projects & Public Transparency API', () => {
        it('POST /api/v1/recovery-projects creates project with milestones and verification method', async () => {
            const res = await fetch(`${baseUrl}/api/v1/recovery-projects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'authority-engineer-01'
                },
                body: JSON.stringify({
                    title: 'Dhunche Main Gravity Water Pipeline Reconstruction',
                    objective: 'Restore resilient drinking water feeder mains for 2,450 residents.',
                    scope: 'Excavation, HDPE pipe relaying across 3.2km torrent zone, and pressure testing.',
                    communityId: 'comm-rasuwa-dhunche',
                    leadOrganisationId: testOrgId,
                    budgetRef: 'GRANT-NDRRMA-2026-W09',
                    budgetAmount: 4500000.00,
                    status: 'IN_PROGRESS',
                    milestones: [
                        { milestone: 'Torrent bed clearance', completed: true },
                        { milestone: 'HDPE pipe delivery', completed: true },
                        { milestone: 'Pressure leak testing', completed: false }
                    ],
                    evidence: [
                        { type: 'INSPECTION_PHOTO', url: 'https://cdn.familyconnect.org/projects/pipe-laying.jpg' }
                    ]
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.ok(data.project.projectId);
            assert.ok(data.project.projectReference.startsWith('FC-PROJ-'));
            assert.equal(data.project.status, 'IN_PROGRESS');
            testProjectId = data.project.projectId;
        });

        it('POST /api/v1/recovery-projects/:id/tasks adds operational recovery task', async () => {
            const res = await fetch(`${baseUrl}/api/v1/recovery-projects/${testProjectId}/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'authority-engineer-01'
                },
                body: JSON.stringify({
                    taskType: 'PIPE_RELAY',
                    title: 'Weld HDPE Joint Section B-3',
                    authorityName: 'Rasuwa District Water Supply Office',
                    needId: testNeedId,
                    targetDate: '2026-10-05'
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.equal(data.task.title, 'Weld HDPE Joint Section B-3');
            assert.equal(data.task.status, 'PLANNED');
        });

        it('FR-008-013: GET /api/v1/recovery-projects masks sensitive budget data for PUBLIC actors', async () => {
            const res = await fetch(`${baseUrl}/api/v1/recovery-projects`, {
                headers: {
                    'X-Debug-Actor-Class': 'PUBLIC'
                }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(Array.isArray(data.projects));

            const proj = data.projects.find(p => p.projectId === testProjectId);
            assert.ok(proj);
            assert.equal(proj.title, 'Dhunche Main Gravity Water Pipeline Reconstruction');
            assert.equal(proj.leadOrganisationName, 'Himalayan Water Relief Initiative');
            assert.ok(Array.isArray(proj.milestones));
            assert.ok(Array.isArray(proj.evidence));

            // CRITICAL PRIVACY & TRANSPARENCY ENFORCEMENT:
            // Public users must NEVER see sensitive internal budget numbers
            assert.equal(proj.budgetAmount, undefined);
            assert.equal(proj.budgetRef, undefined);
        });

        it('GET /api/v1/recovery-projects provides budget data to privileged AUTHORITY actors', async () => {
            const res = await fetch(`${baseUrl}/api/v1/recovery-projects`, {
                headers: {
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'authority-auditor-01'
                }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            const proj = data.projects.find(p => p.projectId === testProjectId);
            assert.ok(proj);
            assert.equal(Number(proj.budgetAmount), 4500000.00);
            assert.equal(proj.budgetRef, 'GRANT-NDRRMA-2026-W09');
        });
    });
});
