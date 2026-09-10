const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../src/app');
const { pool } = require('../src/db');

function makeRequest(server, method, path, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: '127.0.0.1',
            port: server.address().port,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            },
        }, (res) => {
            let chunks = '';
            res.on('data', (c) => { chunks += c; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = chunks ? JSON.parse(chunks) : null;
                } catch {
                    parsed = chunks;
                }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

test('OWASP Top 10 Security Controls Verification', async (t) => {

    await t.test('Orchestrator: /scan rejects unauthenticated caller with 404 (BR-013 enumeration protection)', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/orchestrator/scan');
            assert.strictEqual(res.status, 404);
        } finally {
            server.close();
        }
    });

    await t.test('Orchestrator: /scan rejects ADMIN with IAL-0 (IAL-2 required)', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/orchestrator/scan', {
                headers: {
                    'X-Debug-Actor-Class': 'ADMIN',
                    'X-Debug-IAL': 'IAL-0',
                }
            });
            assert.strictEqual(res.status, 401);
        } finally {
            server.close();
        }
    });

    await t.test('Orchestrator: /plan rejects unauthenticated caller with 404', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/orchestrator/plan', {
                body: { detectedEventId: 'fake-id' }
            });
            assert.strictEqual(res.status, 404);
        } finally {
            server.close();
        }
    });

    await t.test('Tunnels: PUT /:siteId/status rejects unauthenticated caller with 404', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'PUT', '/api/v1/tunnels/SITE-01/status', {
                body: { operationalStatus: 'ACTIVE' }
            });
            assert.strictEqual(res.status, 404);
        } finally {
            server.close();
        }
    });

    await t.test('Tunnels: POST /agent/run rejects unauthenticated caller with 404', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/tunnels/agent/run');
            assert.strictEqual(res.status, 404);
        } finally {
            server.close();
        }
    });

    await t.test('Rumours: POST /:eventId/information forces PENDING status when submitted by PARTNER', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/events/EVENT-IN-FL-2026-1187/information', {
                headers: {
                    'X-Debug-Actor-Class': 'PARTNER',
                    'X-Debug-Actor-Id': 'ORG-TEST-1',
                },
                body: {
                    informationType: 'ROAD_STATUS',
                    content: 'NH-37 passable for light vehicles.',
                    verificationStatus: 'VERIFIED'
                }
            });
            assert.strictEqual(res.status, 201);
            assert.ok(res.body.updateId);

            // Verify in database that it was saved as PENDING, NOT VERIFIED
            const check = await pool.query('SELECT verification_status FROM information_update WHERE information_id = $1', [res.body.updateId]);
            assert.strictEqual(check.rows[0].verification_status, 'PENDING');
        } finally {
            server.close();
        }
    });

    await t.test('DNA Requests: Generates cryptographically secure tracking reference format', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/dna/requests', {
                body: {
                    requesterName: 'Aarav Sharma',
                    requesterEmail: 'aarav@example.com',
                    relationship: 'Brother',
                    missingPersonName: 'Vikram Sharma',
                }
            });
            assert.strictEqual(res.status, 201);
            assert.ok(res.body.trackingReference);
            // Matches DNA-YYYYMMDD-[6 hex uppercase digits]
            assert.match(res.body.trackingReference, /^DNA-\d{8}-[A-F0-9]{6}$/);
        } finally {
            server.close();
        }
    });

    await t.test('Auth: Unknown user login records failed audit log in audit_event table', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/auth/login', {
                body: {
                    email: 'nonexistent-adversary@example.org',
                    password: 'Password123!',
                }
            });
            assert.strictEqual(res.status, 401);

            // Verify audit_event has recorded LOGIN_FAILED with UNREGISTERED_EMAIL
            const auditRes = await pool.query(
                `SELECT * FROM audit_event WHERE action = 'LOGIN_FAILED' AND actor = 'UNREGISTERED_EMAIL' ORDER BY timestamp DESC LIMIT 1`
            );
            assert.ok(auditRes.rows.length > 0);
            assert.strictEqual(auditRes.rows[0].action, 'LOGIN_FAILED');
            assert.strictEqual(auditRes.rows[0].outcome, 'FAILURE');
        } finally {
            server.close();
        }
    });

});
