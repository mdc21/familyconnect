const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../src/app');

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
            res.on('end', () => resolve({ status: res.statusCode, body: chunks ? JSON.parse(chunks) : null }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

test('AI News Agent endpoints and verification hub integration', async (t) => {

    await t.test('POST /api/v1/news/agent/run rejects unauthenticated caller', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/news/agent/run', {
                headers: { 'X-Disaster-Event-ID': 'EVENT-NP-TIBET-2026' }
            });
            assert.strictEqual(res.status, 404);
        } finally {
            server.close();
        }
    });

    await t.test('POST /api/v1/news/agent/run triggers AI news collector cycle when authorized', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'POST', '/api/v1/news/agent/run', {
                headers: {
                    'X-Disaster-Event-ID': 'EVENT-NP-TIBET-2026',
                    'X-Debug-Actor-Class': 'CASE_WORKER'
                }
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.status, 'SUCCESS');
            assert.ok(typeof res.body.insertedCount === 'number');
            assert.ok(Array.isArray(res.body.items));
        } finally {
            server.close();
        }
    });

    await t.test('GET /api/v1/news/queue rejects unauthenticated caller', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'GET', '/api/v1/news/queue', {
                headers: { 'X-Disaster-Event-ID': 'EVENT-NP-TIBET-2026' }
            });
            assert.strictEqual(res.status, 404);
        } finally {
            server.close();
        }
    });

    await t.test('GET /api/v1/news/queue returns pending AI news items for authorized coordinator review', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'GET', '/api/v1/news/queue', {
                headers: {
                    'X-Disaster-Event-ID': 'EVENT-NP-TIBET-2026',
                    'X-Debug-Actor-Class': 'CASE_WORKER'
                }
            });
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body));
            if (res.body.length > 0) {
                const item = res.body[0];
                assert.ok(item.newsId);
                assert.ok(item.title);
                assert.ok(item.sourceName);
            }
        } finally {
            server.close();
        }
    });

    await t.test('POST /api/v1/news/queue/:id/review publishes item as VERIFIED information update', async () => {
        const server = app.listen(0);
        try {
            const queueRes = await makeRequest(server, 'GET', '/api/v1/news/queue', {
                headers: {
                    'X-Disaster-Event-ID': 'EVENT-NP-TIBET-2026',
                    'X-Debug-Actor-Class': 'CASE_WORKER'
                }
            });

            if (queueRes.body && queueRes.body.length > 0) {
                const newsId = queueRes.body[0].newsId;
                const reviewRes = await makeRequest(server, 'POST', `/api/v1/news/queue/${newsId}/review`, {
                    headers: { 'X-Debug-Actor-Class': 'CASE_WORKER' },
                    body: { action: 'PUBLISH_VERIFIED' }
                });

                assert.strictEqual(reviewRes.status, 200);
                assert.strictEqual(reviewRes.body.action, 'PUBLISH_VERIFIED');
                assert.ok(reviewRes.body.publishedAsUpdateId);
            }
        } finally {
            server.close();
        }
    });

    await t.test('GET /api/v1/news/public returns published verified updates for public portal', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'GET', '/api/v1/news/public', {
                headers: { 'X-Disaster-Event-ID': 'EVENT-NP-TIBET-2026' }
            });
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body));
        } finally {
            server.close();
        }
    });

    await t.test('GET /api/v1/news/schedule returns schedule config (6h / 24h mode)', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'GET', '/api/v1/news/schedule');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.agentId, 'NEPAL_TIBET_GLOF_AGENT');
            assert.ok(res.body.currentPhase);
            assert.ok(res.body.intervalHours);
        } finally {
            server.close();
        }
    });

    await t.test('PUT /api/v1/news/schedule rejects unauthorized caller', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'PUT', '/api/v1/news/schedule', {
                body: { currentPhase: 'WEEKS_2_TO_5', intervalHours: 24 }
            });
            assert.strictEqual(res.status, 404);
        } finally {
            server.close();
        }
    });

    await t.test('PUT /api/v1/news/schedule updates schedule mode when called by ADMIN', async () => {
        const server = app.listen(0);
        try {
            const res = await makeRequest(server, 'PUT', '/api/v1/news/schedule', {
                headers: { 'X-Debug-Actor-Class': 'ADMIN' },
                body: { currentPhase: 'WEEKS_2_TO_5', intervalHours: 24 }
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.currentPhase, 'WEEKS_2_TO_5');
            assert.strictEqual(res.body.intervalHours, 24);
        } finally {
            server.close();
        }
    });

});
