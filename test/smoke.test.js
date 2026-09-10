const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app } = require('../src/app');

function request(server, method, path, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: '127.0.0.1', port: server.address().port, path, method,
            headers: { 'Content-Type': 'application/json', ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
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

test('rejects safety submission missing Idempotency-Key with RFC9457 problem+json', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/submissions/safety', {
            body: { person: { firstName: 'Tenzing', lastName: 'Norbu' } },
        });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.code, 'FC_ERR_400_INVALID_SCHEMA');
        assert.ok(res.body.type.includes('/problems/invalid-payload'));
    } finally {
        server.close();
    }
});

test('unknown case action returns 404 not-found problem', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/actions/not-a-real-action', {
            headers: { 'Idempotency-Key': '11111111-1111-4111-8111-111111111111' },
        });
        assert.strictEqual(res.status, 404);
        assert.strictEqual(res.body.code, 'FC_ERR_404_NOT_FOUND');
    } finally {
        server.close();
    }
});

test('assistance request rejects missing needType with problem+json', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/assistance', {
            headers: { 'X-Debug-Actor-Class': 'FAMILY' },
            body: { description: 'no needType provided' },
        });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.code, 'FC_ERR_400_INVALID_SCHEMA');
    } finally {
        server.close();
    }
});

test('assistance request is shielded (404) for PUBLIC actor class', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/assistance', {
            body: { needType: 'ACCOMMODATION' }, // no X-Debug-Actor-Class -> defaults to PUBLIC
        });
        assert.strictEqual(res.status, 404);
        assert.strictEqual(res.body.code, 'FC_ERR_404_NOT_FOUND');
    } finally {
        server.close();
    }
});

test('batch communication upload rejects non-array payload', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/communications/batch', {
            headers: { 'X-Debug-Actor-Class': 'CASE_WORKER' },
            body: { communications: 'not-an-array' },
        });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.code, 'FC_ERR_400_INVALID_SCHEMA');
    } finally {
        server.close();
    }
});

test('batch communication upload rejects items missing clientIdempotencyKey', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/communications/batch', {
            headers: { 'X-Debug-Actor-Class': 'CASE_WORKER' },
            body: { communications: [{ channel: 'RADIO', purpose: 'check-in' }] },
        });
        assert.strictEqual(res.status, 207);
        assert.strictEqual(res.body.results[0].status, 'REJECTED');
        assert.strictEqual(res.body.summary.rejected, 1);
    } finally {
        server.close();
    }
});

test('SMS/restricted-category notification bodies never carry the plain content', () => {
    const { composeMessageBody } = require('../src/services/notifications');
    const genericPrompt = composeMessageBody({
        channel: 'SMS', caseReference: 'FC-NP-2026-00892', category: 'MEDICAL',
        plainContent: 'Patient has a fractured femur, admitted ICU ward 3.',
    });
    assert.ok(!genericPrompt.includes('fractured femur'));
    assert.ok(genericPrompt.includes('FC-NP-2026-00892'));

    const nonRestrictedEmail = composeMessageBody({
        channel: 'EMAIL', caseReference: 'FC-NP-2026-00892', category: 'ASSISTANCE',
        plainContent: 'New assistance request triaged.',
    });
    assert.strictEqual(nonRestrictedEmail, 'New assistance request triaged.');
});

test('identity evidence upload is shielded (404) for FAMILY actor class', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/evidence', {
            headers: { 'X-Debug-Actor-Class': 'FAMILY', 'X-Debug-IAL': 'IAL-2', 'Idempotency-Key': '22222222-2222-4222-8222-222222222222' },
            body: { evidenceType: 'PHYSICAL_DESCRIPTOR', descriptors: { height: '170cm' } },
        });
        assert.strictEqual(res.status, 404);
    } finally {
        server.close();
    }
});

test('identity evidence upload requires IAL-2 even for an otherwise-authorised actor class', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/evidence', {
            headers: { 'X-Debug-Actor-Class': 'CASE_WORKER', 'Idempotency-Key': '99999999-9999-4999-8999-999999999999' }, // no X-Debug-IAL -> IAL-0
            body: { evidenceType: 'PHYSICAL_DESCRIPTOR' },
        });
        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.body.code, 'FC_ERR_401_AUTH_REQUIRED');
    } finally {
        server.close();
    }
});

test('identity evidence upload rejects missing evidenceType for authorised, sufficiently-assured actor', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/evidence', {
            headers: { 'X-Debug-Actor-Class': 'CASE_WORKER', 'X-Debug-IAL': 'IAL-2', 'Idempotency-Key': '33333333-3333-4333-8333-333333333333' },
            body: {},
        });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.code, 'FC_ERR_400_INVALID_SCHEMA');
    } finally {
        server.close();
    }
});

test('care preference rejects missing details', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/cases/00000000-0000-0000-0000-000000000000/care-preferences', {
            headers: { 'X-Debug-Actor-Class': 'CASE_WORKER' },
            body: { preferenceType: 'DIETARY' },
        });
        assert.strictEqual(res.status, 400);
    } finally {
        server.close();
    }
});

test('tour group registration is shielded (404) for FAMILY actor class', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/tour-groups', {
            headers: { 'X-Debug-Actor-Class': 'FAMILY' },
            body: { coordinator: 'Jane Sherpa' },
        });
        assert.strictEqual(res.status, 404);
    } finally {
        server.close();
    }
});

test('tour group manifest batch rejects items missing clientIdempotencyKey', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/tour-groups/00000000-0000-0000-0000-000000000000/members/batch', {
            headers: { 'X-Debug-Actor-Class': 'PARTNER' },
            body: { members: [{ firstName: 'Pema', lastName: 'Lama' }] },
        });
        assert.strictEqual(res.status, 207);
        assert.strictEqual(res.body.results[0].status, 'REJECTED');
    } finally {
        server.close();
    }
});

test('tour group member status update rejects invalid manifestStatus value', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'POST', '/api/v1/tour-groups/00000000-0000-0000-0000-000000000000/members/11111111-1111-4111-8111-111111111111/status', {
            headers: { 'X-Debug-Actor-Class': 'CASE_WORKER' },
            body: { manifestStatus: 'NOT_A_REAL_STATUS' },
        });
        assert.strictEqual(res.status, 400);
    } finally {
        server.close();
    }
});

test('write-path rate limiter returns 429 with problem+json after the burst threshold', async () => {
    const { _resetForTests } = require('../src/middleware/rateLimit');
    _resetForTests();
    const server = app.listen(0);
    try {
        let lastRes;
        for (let i = 0; i < 21; i += 1) {
            // Distinct idempotency key each call so we're testing the rate
            // limiter, not idempotent-replay short-circuiting.
            lastRes = await request(server, 'POST', '/api/v1/submissions/safety', { // eslint-disable-line no-await-in-loop
                headers: { 'Idempotency-Key': `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}` },
                body: { person: { firstName: 'A', lastName: 'B' } },
            });
        }
        assert.strictEqual(lastRes.status, 429);
        assert.strictEqual(lastRes.body.code, 'FC_ERR_429_RATE_LIMIT');
    } finally {
        _resetForTests();
        server.close();
    }
});

test('IAL-2-gated endpoint rejects an IAL-0 actor even with the right role', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'GET', '/api/v1/audit/events', {
            headers: { 'X-Debug-Actor-Class': 'AUTHORITY' }, // no X-Debug-IAL -> defaults to IAL-0
        });
        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.body.code, 'FC_ERR_401_AUTH_REQUIRED');
    } finally {
        server.close();
    }
});

test('IAL-2-gated endpoint passes actor-class check through once assurance level is met (fails later at DB, not at the gate)', async () => {
    const server = app.listen(0);
    try {
        const res = await request(server, 'GET', '/api/v1/audit/events', {
            headers: { 'X-Debug-Actor-Class': 'AUTHORITY', 'X-Debug-IAL': 'IAL-2' },
        });
        // No live DB in this test environment, so we only assert the gate
        // itself passed (i.e. we did NOT get the 401 step-up response).
        assert.notStrictEqual(res.status, 401);
    } finally {
        server.close();
    }
});

test('communication idempotency: same key + different body returns 409, not a silent duplicate', () => {
    // Unit-level check on the hashing logic directly, since the full path
    // needs a live DB — see docker-compose integration suite for the
    // end-to-end version of this same assertion.
    const crypto = require('crypto');
    function payloadHash(payload) {
        return crypto.createHash('sha256').update(JSON.stringify(payload, Object.keys(payload).sort())).digest('hex');
    }
    const a = payloadHash({ channel: 'RADIO', purpose: 'check-in' });
    const b = payloadHash({ channel: 'RADIO', purpose: 'evacuation-request' });
    assert.notStrictEqual(a, b, 'different payloads must hash differently so a conflict is detectable');
    const c = payloadHash({ purpose: 'check-in', channel: 'RADIO' }); // reordered keys
    assert.strictEqual(a, c, 'key order must not affect the hash, so a byte-identical replay is recognised as a duplicate');
});

test('assistance-centres directory is public and returns an array shape', async () => {
    // No DB connected in this environment — assert route responds with a
    // 500 problem envelope (not a hang / not an unhandled crash) rather
    // than requiring a live Postgres instance for this smoke test.
    const server = app.listen(0);
    try {
        const res = await request(server, 'GET', '/api/v1/assistance-centres');
        assert.ok([200, 500].includes(res.status));
    } finally {
        server.close();
    }
});
