const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app } = require('../src/app');
const { pool } = require('../src/db');
const { recordVisit, getVisitorOverview } = require('../src/services/analytics/visitorService');

function request(server, method, path, { body, headers = {} } = {}) {
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
                } catch (e) {
                    parsed = chunks;
                }
                resolve({ status: res.statusCode, body: parsed, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

test('recordVisit records page views and hashes IPs anonymously (SPEC-004)', async () => {
    const eventId = 'EVENT-NP-TIBET-2026';
    const testIp = '203.0.113.195';

    await recordVisit({ eventId, pagePath: '/missing.html', clientIp: testIp });
    await recordVisit({ eventId, pagePath: '/missing.html', clientIp: testIp }); // Second visit from same IP

    const overview = await getVisitorOverview(eventId);
    assert.ok(overview);
    assert.ok(overview.today.pageViews >= 2);
    assert.ok(overview.today.uniqueVisitors >= 1);
    assert.ok(Array.isArray(overview.topPages));

    // SPEC-004 verification: Confirm database has no raw IP addresses
    const hashCheck = await pool.query(
        `SELECT visitor_hash FROM portal_daily_visitor_hash WHERE event_id = $1 LIMIT 10`,
        [eventId]
    );
    assert.ok(hashCheck.rows.length > 0);
    for (const row of hashCheck.rows) {
        assert.match(row.visitor_hash, /^[a-f0-9]{64}$/i, 'Hash must be 64-char SHA-256 hex');
        assert.ok(!row.visitor_hash.includes('203.0.113'), 'Raw IP must NEVER be stored');
    }
});

test('GET /api/v1/analytics/overview returns aggregated metrics', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'GET', '/api/v1/analytics/overview?eventId=EVENT-NP-TIBET-2026');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body);
        assert.strictEqual(res.body.eventId, 'EVENT-NP-TIBET-2026');
        assert.ok(typeof res.body.today.pageViews === 'number');
        assert.ok(typeof res.body.today.uniqueVisitors === 'number');
        assert.ok(typeof res.body.last7Days.pageViews === 'number');
        assert.ok(typeof res.body.last7Days.uniqueVisitors === 'number');
        assert.ok(Array.isArray(res.body.topPages));
        assert.ok(Array.isArray(res.body.dailyTrend));
    } finally {
        server.close();
    }
});

test('POST /api/v1/analytics/beacon records visit ping', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/analytics/beacon', {
            body: { eventId: 'EVENT-NP-TIBET-2026', pagePath: '/tunnels.html' }
        });
        assert.strictEqual(res.status, 204);
    } finally {
        server.close();
    }
});
