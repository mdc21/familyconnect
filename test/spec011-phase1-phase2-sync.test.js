/**
 * Test Suite: SPEC-011 Phase 1 & Phase 2 — Offline-First & Field Hub Sync Engine
 *
 * Verifies:
 * 1. Offline coordinator approval endpoints (POST /api/v1/approvals/portals/:id/offline):
 *    - Schema validation for decision enum
 *    - Validates portal state at sync time; rejects non-staged with HTTP 422 STALE_APPROVAL
 * 2. Offline project approval endpoints (POST /api/v1/approvals/projects/:id/offline):
 *    - Schema validation for decision enum
 * 3. Field Hub bulk batch upload (POST /api/v1/sync/batch):
 *    - Schema validation (non-empty records array, max limit)
 *    - Permanent governance blocks for death status and safeguarding flags (§8)
 *    - Idempotent deduplication via idempotencyKey
 * 4. Human conflict resolution queue (GET /api/v1/sync/conflicts, POST /api/v1/sync/conflicts/:id/resolve)
 * 5. Field Hub registry & telemetry (GET/POST /api/v1/sync/hubs, GET /api/v1/sync/hubs/:hubId)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { app } = require('../src/app');
const { pool } = require('../src/db');

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

    // Ensure migration tables exist for test environment
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS field_hub (
                hub_id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                event_id VARCHAR(64),
                location_name VARCHAR(255),
                lat NUMERIC(9,6),
                lng NUMERIC(9,6),
                ip_address VARCHAR(45),
                status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
                total_records_synced INTEGER NOT NULL DEFAULT 0,
                last_sync_at TIMESTAMPTZ,
                last_batch_id VARCHAR(64),
                registered_by VARCHAR(64),
                registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS offline_batch_record (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                hub_id VARCHAR(64),
                batch_id VARCHAR(64),
                record_type VARCHAR(64) NOT NULL,
                local_ref VARCHAR(64),
                body JSONB NOT NULL DEFAULT '{}',
                captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                captured_by VARCHAR(64),
                idempotency_key UUID UNIQUE NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
                conflict_type VARCHAR(32),
                conflict_detail JSONB,
                applied_record_id VARCHAR(64),
                error_message TEXT,
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                processed_at TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS sync_conflict (
                conflict_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                batch_record_id UUID,
                conflict_type VARCHAR(32) NOT NULL,
                event_id VARCHAR(64),
                record_a_id UUID,
                record_b_id UUID,
                detail JSONB NOT NULL DEFAULT '{}',
                resolution VARCHAR(32) NOT NULL DEFAULT 'PENDING',
                resolved_by VARCHAR(64),
                resolved_at TIMESTAMPTZ,
                resolution_note TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS sync_batch_run (
                run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                batch_id VARCHAR(64),
                hub_id VARCHAR(64),
                total_records INTEGER NOT NULL DEFAULT 0,
                received INTEGER NOT NULL DEFAULT 0,
                duplicates INTEGER NOT NULL DEFAULT 0,
                blocked INTEGER NOT NULL DEFAULT 0,
                conflicts INTEGER NOT NULL DEFAULT 0,
                failed INTEGER NOT NULL DEFAULT 0,
                submitted_by VARCHAR(64),
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
    } finally {
        client.release();
    }
});

after(async () => {
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
});

describe('SPEC-011 Phase 1 & Phase 2 — Offline-First & Field Hub Sync Engine', () => {

    it('POST /api/v1/approvals/portals/:id/offline rejects invalid decision enum with 400 problem+json', async () => {
        const res = await fetch(`${baseUrl}/api/v1/approvals/portals/PORTAL-TEST-001/offline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: 'INVALID_STATUS' })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.type, 'https://api.familyconnect.org/v1/problems/invalid-payload');
    });

    it('POST /api/v1/approvals/portals/:id/offline validates portal state and accepts STAGED portal', async () => {
        // Create an event portal in STAGED status if table exists
        const client = await pool.connect();
        const testPortalId = `PORTAL-${Date.now()}`;
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS event_portals (
                    portal_id VARCHAR(64) PRIMARY KEY,
                    event_id VARCHAR(64),
                    status VARCHAR(32) NOT NULL DEFAULT 'STAGED',
                    reviewer_comment TEXT,
                    reviewed_at TIMESTAMPTZ
                );
            `);
            await client.query(
                `INSERT INTO event_portals (portal_id, status) VALUES ($1, 'STAGED')
                 ON CONFLICT (portal_id) DO UPDATE SET status='STAGED'`,
                [testPortalId]
            );
        } finally {
            client.release();
        }

        const res = await fetch(`${baseUrl}/api/v1/approvals/portals/${testPortalId}/offline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                decision: 'APPROVED',
                reviewerComment: 'Coordinator verified offline at camp',
                _offlineMeta: {
                    reviewerIAL: 2,
                    decidedAt: new Date().toISOString()
                }
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.portalId, testPortalId);
        assert.equal(data.appliedStatus, 'ACTIVE');
    });

    it('POST /api/v1/approvals/portals/:id/offline enforces STALE_APPROVAL when portal is not STAGED', async () => {
        const client = await pool.connect();
        const stalePortalId = `PORTAL-STALE-${Date.now()}`;
        try {
            await client.query(
                `INSERT INTO event_portals (portal_id, status) VALUES ($1, 'ACTIVE')
                 ON CONFLICT (portal_id) DO UPDATE SET status='ACTIVE'`,
                [stalePortalId]
            );
        } finally {
            client.release();
        }

        const res = await fetch(`${baseUrl}/api/v1/approvals/portals/${stalePortalId}/offline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                decision: 'APPROVED',
                reviewerComment: 'Late sync from offline device',
                _offlineMeta: { decidedAt: new Date().toISOString() }
            })
        });

        assert.equal(res.status, 422);
        const data = await res.json();
        assert.equal(data.code, 'FC_ERR_422_STALE_APPROVAL');
        assert.ok(data.detail.includes('no longer in STAGED status'));
    });

    it('POST /api/v1/approvals/projects/:id/offline rejects invalid decision enum with 400', async () => {
        const res = await fetch(`${baseUrl}/api/v1/approvals/projects/PROJ-TEST-001/offline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: 'UNKNOWN_DECISION' })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.type, 'https://api.familyconnect.org/v1/problems/invalid-payload');
    });

    it('POST /api/v1/sync/batch rejects empty or non-array records with 400 problem+json', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sync/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hubId: 'HUB-001', records: [] })
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.type, 'https://api.familyconnect.org/v1/problems/invalid-payload');
    });

    it('POST /api/v1/sync/batch permanently BLOCKS death status and safeguarding flags (§8)', async () => {
        const batchPayload = {
            hubId: 'HUB-NP-KTM-001',
            batchId: `BATCH-${Date.now()}`,
            records: [
                {
                    type: 'submission.death_status',
                    localRef: 'FC-LOCAL-DEATH-01',
                    body: { personId: 'PER-001', deathConfirmed: true },
                    idempotencyKey: crypto.randomUUID()
                },
                {
                    type: 'safeguarding.flag',
                    localRef: 'FC-LOCAL-SAFEGUARD-01',
                    body: { caseId: 'CASE-001', reason: 'Unaccompanied minor' },
                    idempotencyKey: crypto.randomUUID()
                }
            ]
        };

        const res = await fetch(`${baseUrl}/api/v1/sync/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batchPayload)
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.summary.blocked, 2);
        assert.equal(data.records[0].status, 'BLOCKED');
        assert.equal(data.records[1].status, 'BLOCKED');
        assert.ok(data.records[0].reason.includes('cannot be processed offline'));
    });

    it('POST /api/v1/sync/batch processes valid records and handles duplicate idempotency keys', async () => {
        const sharedKey = crypto.randomUUID();
        const batchPayload = {
            hubId: 'HUB-NP-KTM-001',
            batchId: `BATCH-VAL-${Date.now()}`,
            records: [
                {
                    type: 'submission.safety',
                    localRef: 'FC-LOCAL-SAFE-01',
                    body: { person: { firstName: 'Sita', lastName: 'Adhikari' } },
                    idempotencyKey: sharedKey
                }
            ]
        };

        // First upload: should be RECEIVED
        const res1 = await fetch(`${baseUrl}/api/v1/sync/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batchPayload)
        });
        assert.equal(res1.status, 200);
        const data1 = await res1.json();
        assert.equal(data1.summary.received, 1);
        assert.equal(data1.records[0].status, 'RECEIVED');

        // Re-upload with same idempotencyKey: should be DUPLICATE
        const res2 = await fetch(`${baseUrl}/api/v1/sync/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batchPayload)
        });
        assert.equal(res2.status, 200);
        const data2 = await res2.json();
        assert.equal(data2.summary.duplicates, 1);
        assert.equal(data2.records[0].status, 'DUPLICATE');
    });

    it('Field Hub registry: POST and GET /api/v1/sync/hubs manages field hubs', async () => {
        const testHubId = `HUB-TEST-${Date.now()}`;

        // Register hub
        const regRes = await fetch(`${baseUrl}/api/v1/sync/hubs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hubId: testHubId,
                name: 'Sindhupalchok Relief Camp Hub',
                locationName: 'Chautara Ward 4',
                lat: 27.78,
                lng: 85.71
            })
        });
        assert.equal(regRes.status, 201);
        const hubData = await regRes.json();
        assert.equal(hubData.hub_id, testHubId);

        // List hubs
        const listRes = await fetch(`${baseUrl}/api/v1/sync/hubs`);
        assert.equal(listRes.status, 200);
        const listData = await listRes.json();
        const found = listData.hubs.some(h => h.hub_id === testHubId);
        assert.ok(found, 'Newly registered hub should be in list');

        // Get single hub status & queue stats
        const getRes = await fetch(`${baseUrl}/api/v1/sync/hubs/${testHubId}`);
        assert.equal(getRes.status, 200);
        const statusData = await getRes.json();
        assert.equal(statusData.hub.hub_id, testHubId);
        assert.ok(statusData.queueStats !== undefined);
    });

    it('GET /api/v1/sync/conflicts returns conflict queue and POST /resolve validates status', async () => {
        // List conflicts
        const confRes = await fetch(`${baseUrl}/api/v1/sync/conflicts?resolution=PENDING`);
        assert.equal(confRes.status, 200);
        const confData = await confRes.json();
        assert.ok(Array.isArray(confData.conflicts));

        // Resolve unknown conflict returns 404
        const badId = crypto.randomUUID();
        const resBad = await fetch(`${baseUrl}/api/v1/sync/conflicts/${badId}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolution: 'RESOLVED', resolutionNote: 'Confirmed via call' })
        });
        assert.equal(resBad.status, 404);

        // Invalid resolution status returns 400
        const resInvalid = await fetch(`${baseUrl}/api/v1/sync/conflicts/${badId}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolution: 'INVALID_STATUS' })
        });
        assert.equal(resInvalid.status, 400);
    });

});
