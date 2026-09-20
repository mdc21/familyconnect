/**
 * Test Suite: SPEC-008 Phase 2 Modules
 * Modules Tested:
 * - Module M3: Community Recovery (Status View, Seeding & Disclosure Threshold)
 * - Module M10: Documentation Guidance & Case Tracking (Nepali Vital Registrations)
 * - Module M2: Family Recovery Case (Journey Tracking & Access Policy Linking)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db');
const { app } = require('../src/app');

// Helper to make test HTTP requests using native fetch against Express instance
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

describe('SPEC-008 Phase 2 Modules (M3, M10, M2)', () => {
    const testFamilyUnitId = '22222222-0000-0000-0000-000000000001';
    let testCaseId = null;

    before(async () => {
        // Ensure test family unit exists
        await pool.query(`
            INSERT INTO family_unit (family_unit_id, primary_contact_person_id, country, preferred_language)
            VALUES ('${testFamilyUnitId}', null, 'NP', 'ne')
            ON CONFLICT (family_unit_id) DO NOTHING
        `);

        // Ensure a test emergency case_record exists for linking
        const caseRes = await pool.query(`
            INSERT INTO case_record (
                case_reference, 
                event_id, 
                case_type,
                status, 
                priority, 
                data_sharing_status
            )
            VALUES (
                'FC-TST-PH2-001', 
                'EVENT-NP-TIBET-2026', 
                'FAMILY_ASSISTANCE',
                'NEW', 
                'P1', 
                'NORMAL'
            )
            ON CONFLICT (case_reference) DO UPDATE 
            SET data_sharing_status = 'NORMAL'
            RETURNING case_id
        `);
        testCaseId = caseRes.rows[0].case_id;

        // Insert test assistance request linked to this case (ADR-001 reconciliation)
        await pool.query(`
            INSERT INTO assistance_request (
                case_id, 
                requested_service, 
                priority, 
                status
            )
            VALUES (
                '${testCaseId}', 
                'EMERGENCY_SHELTER', 
                'CRITICAL', 
                'ASSIGNED'
            )
            ON CONFLICT DO NOTHING
        `);
    });

    // ───────────────────────────────────────────────────────────
    // M3: Community Recovery Tests
    // ───────────────────────────────────────────────────────────
    describe('Module M3 — Community Recovery Status View', () => {
        it('GET /api/v1/communities lists active disaster localities', async () => {
            const res = await fetch(`${baseUrl}/api/v1/communities`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(Array.isArray(data.communities));
            assert.ok(data.communities.length >= 3);

            const dhunche = data.communities.find(c => c.communityId === 'comm-rasuwa-dhunche');
            assert.ok(dhunche);
            assert.equal(dhunche.name, 'Dhunche Bazaar & Environs');
            assert.equal(dhunche.thresholdMet, true);
        });

        it('GET /api/v1/communities/:id/recovery-summary returns live metrics for threshold-met locality', async () => {
            const res = await fetch(`${baseUrl}/api/v1/communities/comm-rasuwa-dhunche/recovery-summary`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.communityId, 'comm-rasuwa-dhunche');
            assert.equal(data.thresholdMet, true);
            assert.ok(typeof data.metrics.totalReportedNeeds === 'number');
            assert.ok(data.metrics.totalReportedNeeds >= 2);
            assert.ok(Array.isArray(data.serviceStates));
            assert.ok(data.serviceStates.some(s => s.service_type === 'DRINKING_WATER'));
        });

        it('BR-008-013: GET recovery-summary suppresses granular counts when population < 25', async () => {
            const res = await fetch(`${baseUrl}/api/v1/communities/comm-langtang-kyangjin/recovery-summary`);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.communityId, 'comm-langtang-kyangjin');
            assert.equal(data.thresholdMet, false);
            assert.equal(data.metrics.totalReportedNeeds, 'SUPPRESSED');
            assert.equal(data.metrics.verifiedNeedsCount, 'SUPPRESSED');
            assert.equal(data.metrics.unmetNeedsCount, 'SUPPRESSED');
            assert.ok(data.disclosureWarning.includes('BR-008-013'));
        });
    });

    // ───────────────────────────────────────────────────────────
    // M10: Documentation Guidance & Tracking Tests
    // ───────────────────────────────────────────────────────────
    describe('Module M10 — Documentation Guidance & Case Tracking', () => {
        it('GET /api/v1/families/:id/documentation initializes legal guidance templates', async () => {
            const res = await fetch(`${baseUrl}/api/v1/families/${testFamilyUnitId}/documentation`, {
                headers: {
                    'X-Debug-Actor-Class': 'CASE_WORKER',
                    'X-Debug-Actor-Id': 'cw-test-101'
                }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.familyUnitId, testFamilyUnitId);
            assert.ok(Array.isArray(data.processes));
            assert.ok(data.processes.length >= 2);

            const deathCert = data.processes.find(p => p.processType === 'NEPALI_DEATH_CERTIFICATE');
            assert.ok(deathCert);
            assert.ok(deathCert.guidanceText.includes('Ward Office'));
            assert.ok(deathCert.guidanceText.includes('Vital Events'));
            assert.ok(Array.isArray(deathCert.requiredDocuments));

            const citizenReplace = data.processes.find(p => p.processType === 'NEPALI_CITIZENSHIP_RESTORATION');
            assert.ok(citizenReplace);
            assert.ok(citizenReplace.guidanceText.includes('District Administration Office'));
        });

        it('POST /api/v1/families/:id/documentation/:type/status updates tracking status with audit trail', async () => {
            const res = await fetch(`${baseUrl}/api/v1/families/${testFamilyUnitId}/documentation/NEPALI_DEATH_CERTIFICATE/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'CASE_WORKER',
                    'X-Debug-Actor-Id': 'cw-test-101'
                },
                body: JSON.stringify({
                    status: 'DOCUMENTS_GATHERED',
                    trackingReference: 'WARD-DHUNCHE-MUCHULKA-882',
                    notes: 'Police inquest report and two witness citizenship copies collected.'
                })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.process.processType, 'NEPALI_DEATH_CERTIFICATE');
            assert.equal(data.process.status, 'DOCUMENTS_GATHERED');
            assert.equal(data.process.trackingReference, 'WARD-DHUNCHE-MUCHULKA-882');

            // Verify audit event written to audit_event table
            const auditRes = await pool.query(
                "SELECT * FROM audit_event WHERE action = 'DOCUMENTATION_PROCESS_DOCUMENTS_GATHERED' ORDER BY audit_id DESC LIMIT 1"
            );
            assert.ok(auditRes.rows.length > 0);
            assert.equal(auditRes.rows[0].entity_type, 'DOCUMENTATION_PROCESS');
        });

        it('Rejects unauthorized PUBLIC actor with 404 (shielded access)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/families/${testFamilyUnitId}/documentation`, {
                headers: {
                    'X-Debug-Actor-Class': 'PUBLIC'
                }
            });
            assert.equal(res.status, 404);
        });
    });

    // ───────────────────────────────────────────────────────────
    // M2: Family Recovery Journey Tests
    // ───────────────────────────────────────────────────────────
    describe('Module M2 — Family Recovery Journey', () => {
        it('POST /api/v1/families/:id/recovery-case creates recovery case linked to emergency case', async () => {
            const res = await fetch(`${baseUrl}/api/v1/families/${testFamilyUnitId}/recovery-case`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Actor-Class': 'FAMILY',
                    'X-Debug-Actor-Id': 'fam-user-test'
                },
                body: JSON.stringify({
                    primaryCaseId: testCaseId,
                    eventId: 'EVENT-NP-TIBET-2026',
                    housingRecoveryStatus: 'TEMPORARY_SHELTER',
                    educationStatus: 'DISRUPTED',
                    livelihoodStatus: 'DISRUPTED',
                    missingDeceasedSummary: {
                        missing_count: 1,
                        deceased_count: 0,
                        inquest_complete: false
                    },
                    goals: [
                        { id: 1, title: 'Restore citizenship credentials', target: '2026-10-15' },
                        { id: 2, title: 'Transitional shelter repair grant', target: '2026-11-01' }
                    ],
                    notes: 'Family residing in community center; seeking livelihood restart grant.'
                })
            });

            assert.equal(res.status, 201);
            const data = await res.json();
            assert.ok(data.recoveryCase.caseReference.startsWith('FC-REC-'));
            assert.equal(data.recoveryCase.familyUnitId, testFamilyUnitId);
            assert.equal(data.recoveryCase.primaryCaseId, testCaseId);
            assert.equal(data.recoveryCase.status, 'OPEN');
            assert.equal(data.recoveryCase.housingRecoveryStatus, 'TEMPORARY_SHELTER');
        });

        it('GET /api/v1/families/:id/recovery-case returns complete journey including assistance & docs', async () => {
            const res = await fetch(`${baseUrl}/api/v1/families/${testFamilyUnitId}/recovery-case`, {
                headers: {
                    'X-Debug-Actor-Class': 'FAMILY',
                    'X-Debug-Actor-Id': 'fam-user-test'
                }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            const rec = data.recoveryCase;
            assert.equal(rec.familyUnitId, testFamilyUnitId);
            assert.ok(Array.isArray(rec.linkedDocumentation));
            assert.ok(rec.linkedDocumentation.some(d => d.processType === 'NEPALI_DEATH_CERTIFICATE'));
            assert.ok(Array.isArray(rec.linkedAssistance));
            assert.ok(rec.linkedAssistance.some(a => a.requestedService === 'EMERGENCY_SHELTER'));
        });

        it('SPEC-004 §9 / BR-017: Freezes disclosure with 403 DISPUTED_ACCESS when linked case is under dispute', async () => {
            // Set linked case_record data_sharing_status to RESTRICTED_PENDING_REVIEW
            await pool.query(
                "UPDATE case_record SET data_sharing_status = 'RESTRICTED_PENDING_REVIEW' WHERE case_id = $1",
                [testCaseId]
            );

            // Attempt access as FAMILY actor -> must be blocked
            const res = await fetch(`${baseUrl}/api/v1/families/${testFamilyUnitId}/recovery-case`, {
                headers: {
                    'X-Debug-Actor-Class': 'FAMILY',
                    'X-Debug-Actor-Id': 'fam-user-test'
                }
            });

            assert.equal(res.status, 403);
            const prob = await res.json();
            assert.equal(prob.code, 'FC_ERR_403_DISPUTED_ACCESS');

            // Attempt access as AUTHORITY actor -> permitted through freeze
            const authRes = await fetch(`${baseUrl}/api/v1/families/${testFamilyUnitId}/recovery-case`, {
                headers: {
                    'X-Debug-Actor-Class': 'AUTHORITY',
                    'X-Debug-Actor-Id': 'authority-officer-1'
                }
            });
            assert.equal(authRes.status, 200);

            // Restore normal status
            await pool.query(
                "UPDATE case_record SET data_sharing_status = 'NORMAL' WHERE case_id = $1",
                [testCaseId]
            );
        });

        it('Rejects unauthorized PUBLIC actor with 404 (shielded access)', async () => {
            const res = await fetch(`${baseUrl}/api/v1/families/${testFamilyUnitId}/recovery-case`, {
                headers: {
                    'X-Debug-Actor-Class': 'PUBLIC'
                }
            });
            assert.equal(res.status, 404);
        });
    });
});
