const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../src/app');

function makeRequest(server, method, path, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
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

test('Two-Way SMS & WhatsApp Gateway Verification', async (t) => {
    let server;
    t.before(() => {
        server = app.listen(0);
    });
    t.after(() => {
        server.close();
    });

    await t.test('POST /api/v1/gateways/sms processes SAFE command and returns reference', async () => {
        const res = await makeRequest(server, 'POST', '/api/v1/gateways/sms', {
            body: {
                From: '+919876543210',
                Body: 'SAFE Bipul Kalita | Ulubari Camp Guwahati | +919876543210'
            }
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.status, 'SUCCESS');
        assert.strictEqual(res.body.channel, 'SMS');
        assert.ok(res.body.replyText.includes('Safe declaration registered'));
        assert.ok(res.body.replyText.includes('Bipul Kalita'));
        assert.ok(res.body.reference.startsWith('FC-'));
    });

    await t.test('POST /api/v1/gateways/whatsapp processes MISSING command and returns case ref', async () => {
        const res = await makeRequest(server, 'POST', '/api/v1/gateways/whatsapp', {
            body: {
                From: 'whatsapp:+919812345678',
                Body: 'MISSING Manjit Barua | Age 42, Blue shirt | Sivasagar riverbank | +919812345678'
            }
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.status, 'SUCCESS');
        assert.strictEqual(res.body.channel, 'WHATSAPP');
        assert.ok(res.body.replyText.includes('Missing person case registered'));
        assert.ok(res.body.replyText.includes('Manjit Barua'));
        assert.ok(res.body.reference.startsWith('FC-'));
    });

    await t.test('POST /api/v1/gateways/sms processes SHELTER inquiry', async () => {
        const res = await makeRequest(server, 'POST', '/api/v1/gateways/sms', {
            body: {
                From: '+919876543210',
                Body: 'SHELTER Guwahati'
            }
        });

        assert.strictEqual(res.status, 200);
        assert.ok(res.body.replyText.includes('Nehru Stadium'));
    });

    await t.test('POST /api/v1/gateways/simulate provides full simulation inspection', async () => {
        const res = await makeRequest(server, 'POST', '/api/v1/gateways/simulate', {
            body: {
                from: '+919999988888',
                body: 'SAFE Anita Devi | Goalpara Relief Camp',
                channel: 'SMS'
            }
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.command, 'SAFE');
        assert.ok(res.body.replyText.includes('Anita Devi'));
        assert.ok(res.body.recordResult.caseRef.startsWith('FC-'));
    });

    await t.test('GET /api/v1/gateways/logs returns message history', async () => {
        const res = await makeRequest(server, 'GET', '/api/v1/gateways/logs');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.count > 0);
        assert.ok(Array.isArray(res.body.logs));
    });
});
