/**
 * End-to-End Disaster Simulation Drill & Field Operational Rehearsal
 * 
 * Validates the complete lifecycle of a disaster event response across all subsystems:
 * 1. Sensing & Detection (Sentinel Agent ingest simulated GDACS alert)
 * 2. Autonomous Planning & Dependency Resolution (Planner Agent / A04-PLANNER)
 * 3. Deterministic Portal Assembly (Builder Agent / A06-BUILDER)
 * 4. Field Need Reporting, Assessment & Verification (Module M1)
 * 5. Partner Registration & Accreditation (Module M7)
 * 6. Non-Custodial Funding Pledge & Allocation (Module M9)
 * 7. Triangulated 3-Tier Delivery Attestation (Implementer + Ward + Independent Monitor)
 * 8. Infrastructure Outage & Essential Service Disruption (Modules M5 & M4)
 * 9. Autonomous Gap Observation & Compound L3 Escalation (Module M12 / A16-OPS)
 * 10. Dual-Signatory Gate G8 Release Governance Ratification (NDRRMA + MoHA)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db');
const { app } = require('../src/app');
const { planEvent } = require('../src/services/orchestrator/plannerAgent');
const { buildEventPortal } = require('../src/services/orchestrator/builderAgent');

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

describe('FamilyConnect End-to-End Disaster Simulation Drill', () => {
    let detectionId;
    let eventId;
    let registeredOrgId;
    let createdNeedId;
    let createdPledgeId;
    let createdProjectId;
    let createdAllocationId;
    let createdInfraId;
    let createdServiceId;

    after(async () => {
        // Clean up temporary drill records from database to prevent duplicate events
        const client = await pool.connect();
        try {
            await client.query("DELETE FROM event_review WHERE detection_id IN (SELECT detection_id FROM detected_event WHERE source_alert_id = 'GDACS-FL-SIM-DRILL-2026')");
            await client.query("DELETE FROM generated_artifact WHERE detection_id IN (SELECT detection_id FROM detected_event WHERE source_alert_id = 'GDACS-FL-SIM-DRILL-2026')");
            await client.query("DELETE FROM event_module_activation WHERE detection_id IN (SELECT detection_id FROM detected_event WHERE source_alert_id = 'GDACS-FL-SIM-DRILL-2026')");
            await client.query("DELETE FROM detected_event WHERE source_alert_id = 'GDACS-FL-SIM-DRILL-2026'");
            
            const simEvents = await client.query("SELECT event_id FROM disaster_event WHERE name LIKE '%Simulated%' OR event_id LIKE 'EVENT-NP-FL-2026-%'");
            const evIds = simEvents.rows.map(r => r.event_id);
            if (evIds.length > 0) {
                await client.query("DELETE FROM aid_delivery_evidence WHERE allocation_id IN (SELECT allocation_id FROM aid_allocation WHERE pledge_id IN (SELECT pledge_id FROM funding_pledge WHERE event_id = ANY($1)))", [evIds]);
                await client.query("DELETE FROM aid_allocation WHERE pledge_id IN (SELECT pledge_id FROM funding_pledge WHERE event_id = ANY($1))", [evIds]);
                await client.query("DELETE FROM funding_pledge WHERE event_id = ANY($1)", [evIds]);
                await client.query("DELETE FROM recovery_task WHERE project_id IN (SELECT project_id FROM recovery_project WHERE event_id = ANY($1))", [evIds]);
                await client.query("DELETE FROM recovery_project WHERE event_id = ANY($1)", [evIds]);
                await client.query("DELETE FROM recovery_need WHERE event_id = ANY($1)", [evIds]);
                await client.query("DELETE FROM disaster_event WHERE event_id = ANY($1)", [evIds]);
            }

            if (createdInfraId) {
                await client.query("DELETE FROM infrastructure_status WHERE infra_id = $1", [createdInfraId]);
            }
            if (createdServiceId) {
                await client.query("DELETE FROM service_outage_report WHERE service_id = $1", [createdServiceId]);
                await client.query("DELETE FROM essential_service_status WHERE service_id = $1", [createdServiceId]);
            }
            if (registeredOrgId) {
                await client.query("DELETE FROM organisation WHERE organisation_id = $1", [registeredOrgId]);
            }
        } catch (e) {
            console.error('Test cleanup error:', e.message);
        } finally {
            client.release();
        }
    });

    // ── STEP 1 & 2: Sensing & Autonomous Planning ────────────────────────────
    it('Step 1 & 2: Detects new disaster event and executes A04-PLANNER module resolution', async () => {
        // Insert a simulated GDACS alert
        const detRes = await pool.query(`
            INSERT INTO detected_event (
                source_feed, source_alert_id, event_type, severity, title, country, country_name, region,
                coordinates, estimated_affected, confidence, status
            ) VALUES (
                'GDACS', 'GDACS-FL-SIM-DRILL-2026', 'FLOOD', 'RED',
                'Simulated Massive Flash Flood — Trishuli River Basin, Nepal',
                'NP', 'Nepal', 'Rasuwa / Nuwakot District',
                '{"lat": 28.12, "lon": 85.31}'::jsonb, 150000, 0.95, 'DETECTED'
            ) RETURNING detection_id
        `);
        detectionId = detRes.rows[0].detection_id;
        assert.ok(detectionId);

        // Run Planner Agent
        const manifest = await planEvent(detectionId);
        assert.ok(manifest);
        assert.ok(manifest.eventId.startsWith('EVENT-NP-'));
        eventId = manifest.eventId;
        assert.ok(manifest.activatedModules.length >= 4);

        // Verify module activations in DB
        const actRes = await pool.query(
            'SELECT * FROM event_module_activation WHERE detection_id = $1 AND is_active = TRUE',
            [detectionId]
        );
        assert.ok(actRes.rows.length >= 4);
    });

    // ── STEP 3: Deterministic Portal Assembly ────────────────────────────────
    it('Step 3: A06-BUILDER compiles deterministic portal artifacts from templates', async () => {
        const buildRes = await buildEventPortal(detectionId);
        assert.ok(buildRes);
        assert.ok(buildRes.artifactCount >= 4);
        assert.equal(buildRes.detectionId, detectionId);
    });

    // ── STEP 4: Field Need Reporting, Assessment & Verification (M1) ─────────
    it('Step 4: Ingests community recovery need and updates verification state', async () => {
        const res = await fetch(`${baseUrl}/api/v1/submissions/recovery-needs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'PUBLIC',
                'X-Disaster-Event-ID': eventId
            },
            body: JSON.stringify({
                eventId,
                category: 'DRINKING_WATER',
                location: { district: 'Rasuwa', locality: 'Syaphrubesi Ward 5', lat: 28.15, lon: 85.33 },
                affectedPopulation: 350,
                severity: 'CRITICAL',
                narrative: 'Main intake pipeline smashed by boulders; 350 residents collecting muddy runoff.',
                isVulnerableGroup: true
            })
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.ok(data.need.need_id || data.need.needId);
        createdNeedId = data.need.need_id || data.need.needId;
        assert.equal(data.need.status, 'REPORTED');

        // Transition: REPORTED -> ASSESSED
        const assessRes = await fetch(`${baseUrl}/api/v1/recovery-needs/${createdNeedId}/assess`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'rasuwa-coord-1',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                note: 'Initial damage survey completed by Ward 5 team.'
            })
        });
        assert.equal(assessRes.status, 200);

        // Transition: ASSESSED -> VERIFIED
        const verifyRes = await fetch(`${baseUrl}/api/v1/recovery-needs/${createdNeedId}/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'rasuwa-coord-1',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                note: 'On-site verification completed by Ward 5 disaster committee.'
            })
        });
        assert.equal(verifyRes.status, 200);
    });

    // ── STEP 5: Partner Registration & Accreditation (M7) ───────────────────
    it('Step 5: Registers humanitarian partner with SWC affiliation and verifies via IAL-2 Admin', async () => {
        const regRes = await fetch(`${baseUrl}/api/v1/organisations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'PARTNER'
            },
            body: JSON.stringify({
                name: 'Himalayan Clean Water Initiative',
                organisationType: 'AID_AGENCY',
                country: 'Nepal',
                capabilities: ['DRINKING_WATER', 'INFRASTRUCTURE_REPAIR'],
                geographicScope: { districts: ['Rasuwa', 'Sindhupalchok'], swcRegNumber: 'SWC-DRILL-8991' }
            })
        });

        assert.equal(regRes.status, 201);
        const regData = await regRes.json();
        assert.ok(regData.organisation.organisationId);
        registeredOrgId = regData.organisation.organisationId;
        assert.equal(regData.organisation.verificationStatus, 'PENDING');

        // Admin verifies partner
        const verifyRes = await fetch(`${baseUrl}/api/v1/organisations/${registeredOrgId}/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'ADMIN',
                'X-Debug-Actor-Id': 'admin-chief',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                operationalStatus: 'ACTIVE',
                note: 'Verified with Social Welfare Council registry.'
            })
        });

        assert.equal(verifyRes.status, 200);
        const verifiedData = await verifyRes.json();
        assert.equal(verifiedData.organisation.verificationStatus, 'VERIFIED');
    });

    // ── STEP 6: Non-Custodial Funding Pledge & Allocation (M9 & M8) ──────────
    it('Step 6: Registers statutory funding pledge, creates recovery project, and allocates aid', async () => {
        // Register pledge
        const plgRes = await fetch(`${baseUrl}/api/v1/funding/pledges`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'PARTNER',
                'X-Debug-Actor-Id': registeredOrgId,
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                pledgeReference: 'PLG-DRILL-WATER-2026',
                eventId,
                donorName: 'Global Alpine Relief Trust',
                donorType: 'FOUNDATION',
                pledgeType: 'INGO',
                currency: 'USD',
                amountDeclared: 250000.00,
                targetSector: 'DRINKING_WATER',
                swcTrackingNumber: 'SWC-PLG-7712'
            })
        });

        assert.equal(plgRes.status, 201);
        const plgData = await plgRes.json();
        createdPledgeId = plgData.pledge.pledgeId;

        // Authority confirms statutory clearance
        await fetch(`${baseUrl}/api/v1/funding/pledges/${createdPledgeId}/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'ndrrma-finance-officer',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                verificationStatus: 'OFFICIAL_CONFIRMED',
                statutoryAuthority: 'SWC_AND_NDRRMA'
            })
        });

        // Create M8 recovery project
        const projRes = await fetch(`${baseUrl}/api/v1/recovery-projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'rasuwa-chair',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                projectReference: 'PROJ-DRILL-SYAPHRU-WATER',
                eventId,
                title: 'Syaphrubesi Gravity Water Restoration',
                objective: 'Rebuild destroyed gravity intake and lay 1,200m HDPE pipe to supply Ward 5.',
                leadOrganisationId: registeredOrgId,
                status: 'HUMAN_APPROVED'
            })
        });

        assert.equal(projRes.status, 201);
        const projData = await projRes.json();
        createdProjectId = projData.project.projectId;

        // Allocate aid from pledge to project (Non-custodial ledger tracking)
        const allocRes = await fetch(`${baseUrl}/api/v1/funding/allocations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'ndrrma-director',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                pledgeId: createdPledgeId,
                projectId: createdProjectId,
                allocatedAmount: 45000.00,
                earmarkedPurpose: 'Procurement and delivery of 1,200m HDPE pressure pipes and intake fittings.'
            })
        });

        assert.equal(allocRes.status, 201);
        const allocData = await allocRes.json();
        createdAllocationId = allocData.allocation.allocationId;
        assert.equal(allocData.allocation.allocatedAmount, 45000.00);
    });

    // ── STEP 7: Triangulated 3-Tier Delivery Attestation (M9) ────────────────
    it('Step 7: Achieves 3-tier triangulated field delivery attestation', async () => {
        // Tier 1: Implementing Agency
        await fetch(`${baseUrl}/api/v1/funding/allocations/${createdAllocationId}/evidence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'PARTNER',
                'X-Debug-Actor-Id': registeredOrgId,
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                evidenceType: 'BANK_DEPOSIT_RECEIPT',
                attestationTier: 'IMPLEMENTING_AGENCY',
                attestingOrganisation: 'Himalayan Clean Water Initiative',
                evidenceUrl: 'https://cdn.familyconnect.org/drill/challan-hdpe-pipes.pdf',
                disbursedAmountUpdate: 45000.00,
                notes: 'Truck delivery of 1,200m pipe received at Syaphrubesi depot.'
            })
        });

        // Tier 2: Local Government Ward Committee
        await fetch(`${baseUrl}/api/v1/funding/allocations/${createdAllocationId}/evidence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'ward-chair-syaphru',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                evidenceType: 'LOCAL_WARD_ACKNOWLEDGMENT',
                attestationTier: 'LOCAL_GOVERNMENT_WARD',
                attestingOrganisation: 'Gosaikunda Rural Municipality Ward 5',
                evidenceUrl: 'https://cdn.familyconnect.org/drill/ward5-signoff.pdf',
                notes: 'Ward chairperson physically inspected and verified materials on site.'
            })
        });

        // Tier 3: Independent Humanitarian Monitor
        const res3 = await fetch(`${baseUrl}/api/v1/funding/allocations/${createdAllocationId}/evidence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'PARTNER',
                'X-Debug-Actor-Id': 'cbo-monitor-rasuwa',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                evidenceType: 'THIRD_PARTY_AUDIT_REPORT',
                attestationTier: 'INDEPENDENT_HUMANITARIAN_MONITOR',
                attestingOrganisation: 'Rasuwa Civil Society & Water User Association',
                evidenceUrl: 'https://cdn.familyconnect.org/drill/cbo-independent-audit.pdf',
                notes: 'Community beneficiary audit confirmed full pipe quantity installed and operational.'
            })
        });

        assert.equal(res3.status, 201);
        const data3 = await res3.json();
        assert.equal(data3.attestationSummary.isTriangulated, true);
        assert.equal(data3.attestationSummary.distinctTiers.length, 3);
    });

    // ── STEP 8: Infrastructure Blockage & Essential Service Outage ────────────
    it('Step 8: Logs highway blockage (M5) and electricity outage (M4)', async () => {
        // Log road blockage
        const infraRes = await fetch(`${baseUrl}/api/v1/infrastructure/authoritative-feed`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'dor-engineer-rasuwa',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                infraReference: 'INFRA-DRILL-H02-SYAPHRU',
                infraType: 'NATIONAL_HIGHWAY',
                assetName: 'Pasang Lhamu Highway KM 114 (Syaphrubesi Spur)',
                routeCode: 'H02',
                district: 'Rasuwa',
                localityName: 'Syaphrubesi',
                chainageKm: 'KM 114+200',
                operationalStatus: 'BLOCKED_LANDSLIDE',
                passableVehicleTypes: ['PEDESTRIAN'],
                hazardType: 'ROCKFALL',
                leadAuthorityName: 'Department of Roads (DoR) — Bridge & Highway Division',
                agreementRef: 'AGREE-DOR-ROADS-2026',
                verificationReference: 'DOR-DRILL-REPORT-01'
            })
        });

        assert.equal(infraRes.status, 201);
        const infraData = await infraRes.json();
        createdInfraId = infraData.infrastructure?.infraId;

        // Log electricity grid disruption
        const srvRes = await fetch(`${baseUrl}/api/v1/essential-services/authoritative-feed`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'nea-grid-officer',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                serviceReference: 'SRV-DRILL-POWER-SYAPHRU',
                serviceType: 'ELECTRICITY',
                communityId: 'comm-rasuwa-dhunche',
                district: 'Rasuwa',
                localityName: 'Syaphrubesi Ward 5',
                operationalStatus: 'CRITICAL_OUTAGE',
                affectedPopulationEstimate: 350,
                sourceAuthorityName: 'Nepal Electricity Authority (NEA)',
                agreementRef: 'AGREE-NEA-POWER-2026',
                verificationReference: 'NEA-SITREP-0920',
                publicAdvisory: 'Transmission tower collapsed; diesel generator active for critical medical triage.',
                restorationEstimate: new Date(Date.now() + 72 * 3600 * 1000).toISOString()
            })
        });

        assert.equal(srvRes.status, 201);
        const srvData = await srvRes.json();
        createdServiceId = srvData.service.serviceId;
    });

    // ── STEP 9: M12 Autonomous Gap Observation & Compound Escalation ─────────
    it('Step 9: Module M12 gap observation loop detects compound bottleneck and raises L3 escalation', async () => {
        const obsRes = await fetch(`${baseUrl}/api/v1/ops/observe-gaps`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'AUTHORITY',
                'X-Debug-Actor-Id': 'ops-director',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({ eventId })
        });

        assert.equal(obsRes.status, 200);
        const obsData = await obsRes.json();
        assert.ok(obsData.tokensUsed > 0);
        assert.ok(obsData.costUsd > 0);

        // Verify compound L3 escalation in database
        const escRes = await pool.query(
            "SELECT * FROM escalation WHERE trigger LIKE 'COMPOUND_ISOLATION_%' AND impact_class = 'L3' ORDER BY created_at DESC"
        );
        assert.ok(escRes.rows.length >= 1);
        assert.equal(escRes.rows[0].assigned_reviewer, 'DISASTER_LOGISTICS_COMMAND');

        // Verify donor budget solvency ($50/day cap)
        const costRes = await fetch(`${baseUrl}/api/v1/ops/cost-metrics`);
        assert.equal(costRes.status, 200);
        const costData = await costRes.json();
        assert.equal(costData.isBudgetExhausted, false);
        assert.ok(costData.dailyBudgetRemainingUsd > 0);
    });

    // ── STEP 10: Gate G8 Production Release Dual-Signatory Ratification ───────
    it('Step 10: Ratifies Gate G8 production release with dual primary + deputy succession approvers', async () => {
        const g8Res = await fetch(`${baseUrl}/api/v1/ops/release-approval`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Actor-Class': 'ADMIN',
                'X-Debug-Actor-Id': 'ndrrma-admin',
                'X-Debug-IAL': 'IAL-2'
            },
            body: JSON.stringify({
                releaseVersion: 'v1.0.0-DRILL-VERIFIED',
                primaryApproverName: 'Dr. Anil Pokhrel',
                primaryApproverRole: 'Executive Director, NDRRMA',
                deputyApproverName: 'Suresh Adhikari',
                deputyApproverRole: 'Joint Secretary, Ministry of Home Affairs (MoHA)',
                releaseNotes: 'Complete 10-step disaster lifecycle simulation drill verified under SPEC-008, SPEC-009, and SPEC-010.'
            })
        });

        assert.equal(g8Res.status, 201);
        const g8Data = await g8Res.json();
        assert.equal(g8Data.certification.decision, 'APPROVED');
        assert.equal(g8Data.certification.primaryApprover.name, 'Dr. Anil Pokhrel');
        assert.equal(g8Data.certification.deputySuccessionApprover.name, 'Suresh Adhikari');
        assert.equal(g8Data.certification.gatesVerified.all12ModulesOperational, true);
    });
});
