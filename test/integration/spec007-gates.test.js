/**
 * SPEC-007 §2 Testing Gates — run against a REAL PostgreSQL instance.
 *
 * These are not shape/unit tests. They stand up the actual Express app,
 * make real HTTP requests through it, and assert on rows that actually
 * landed (or didn't) in a real database — including the one thing a
 * mocked/in-memory DB in this build's own trial run (pg-mem) could not
 * verify: that the audit_event append-only trigger genuinely fires.
 *
 * Requires: DATABASE_URL pointing at a Postgres instance with
 * src/db/schema.sql already loaded, and a disaster_event row for
 * EVENT-NP-TIBET-2026 (see docker-compose.yml + npm run test:integration).
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');

if (!process.env.DATABASE_URL) {
    console.log('Skipping SPEC-007 integration gates: DATABASE_URL not set. See docker-compose.yml.');
    process.exit(0);
}

const { app } = require('../../src/app');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function request(server, method, path, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: '127.0.0.1', port: server.address().port, path, method,
            headers: { 'Content-Type': 'application/json', ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
        }, (res) => {
            let chunks = '';
            res.on('data', (c) => { chunks += c; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: chunks ? JSON.parse(chunks) : null }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// ============================================================
// A. Chaos Engineering & Offline Resilience (SPEC-007 §2.A)
// ============================================================

test('GATE A1 — Idempotency Validation: concurrent identical POSTs create exactly one MissingReport/Case', async () => {
    const server = app.listen(0);
    try {
        const idempotencyKey = randomUUID();
        const testRunId = Date.now().toString();
        const firstName = `Concurrent_${testRunId}`;
        const body = {
            person: { firstName, lastName: 'Test', approximateAge: 30 },
            reporter: { phone: '+9779800000000', relationship: 'SIBLING' },
        };
        // Fire 10 concurrent, byte-identical requests with the same key
        const requests = Array.from({ length: 10 }, () => request(server, 'POST', '/api/v1/submissions/missing', {
            headers: { 'Idempotency-Key': idempotencyKey, 'X-Disaster-Event-ID': 'EVENT-NP-TIBET-2026' },
            body,
        }));
        const results = await Promise.all(requests);
        results.forEach((r) => assert.strictEqual(r.status, 202));

        const caseCount = await pool.query(
            "SELECT count(*)::int AS n FROM case_record WHERE case_type = 'MISSING_PERSON' AND primary_person_id = (SELECT person_id FROM person WHERE first_name = $1 AND last_name = 'Test')",
            [firstName],
        );
        assert.strictEqual(caseCount.rows[0].n, 1, 'exactly one Case must exist despite 10 concurrent identical submissions');

        const receiptCount = await pool.query('SELECT count(*)::int AS n FROM submission_receipt WHERE idempotency_key = $1', [idempotencyKey]);
        assert.strictEqual(receiptCount.rows[0].n, 1);
    } finally {
        server.close();
    }
});

test('GATE A2 — ETag Conflict Resolution: concurrent case-worker edits produce a 412, not a lost update', async () => {
    const server = app.listen(0);
    try {
        // Set up a case directly (bypassing the submission flow — we're
        // testing the case-action concurrency control here, not submission).
        const person = await pool.query("INSERT INTO person (first_name, last_name) VALUES ('Etag', 'Test') RETURNING person_id");
        const c = await pool.query(
            `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id)
             VALUES ($1, 'EVENT-NP-TIBET-2026', 'MISSING_PERSON', 'NEW', $2) RETURNING *`,
            [`FC-TEST-ETAG-${Date.now()}-${Math.random()}`, person.rows[0].person_id],
        );
        const caseId = c.rows[0].case_id;

        // Two case workers both read the same version...
        const read1 = await request(server, 'GET', `/api/v1/cases/${caseId}`, { headers: { 'X-Debug-Actor-Class': 'CASE_WORKER' } });
        const etag1 = read1.headers.etag;

        // ...worker 1 successfully triages...
        const triage1 = await request(server, 'POST', `/api/v1/cases/${caseId}/actions/triage`, {
            headers: { 'Idempotency-Key': '5f6a1b2c-0000-4000-8000-000000000002', 'If-Match': etag1 },
        });
        assert.strictEqual(triage1.status, 200);

        // ...worker 2 tries to act on the STALE etag they read before worker 1's change landed.
        const triage2Stale = await request(server, 'POST', `/api/v1/cases/${caseId}/actions/triage`, {
            headers: { 'Idempotency-Key': '5f6a1b2c-0000-4000-8000-000000000003', 'If-Match': etag1 },
        });
        assert.strictEqual(triage2Stale.status, 412, 'stale If-Match must be rejected as a precondition failure, per SPEC-003 §1 / SPEC-007 §2.A');
        assert.strictEqual(triage2Stale.body.code, 'FC_ERR_412_CONCURRENCY_LOCK');
    } finally {
        server.close();
    }
});

// ============================================================
// B. Security & Privacy Penetration — ABAC (SPEC-007 §2.B)
// ============================================================

test('GATE B1 — Cross-Tenant Isolation: FAMILY actor cannot read a case under active dispute', async () => {
    const server = app.listen(0);
    try {
        const person = await pool.query("INSERT INTO person (first_name, last_name) VALUES ('Disputed', 'Case') RETURNING person_id");
        const c = await pool.query(
            `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id, data_sharing_status)
             VALUES ($1, 'EVENT-NP-TIBET-2026', 'MISSING_PERSON', 'ACTIVE', $2, 'RESTRICTED_PENDING_REVIEW') RETURNING case_id`,
            [`FC-TEST-DISPUTE-${Date.now()}-${Math.random()}`, person.rows[0].person_id],
        );
        const caseId = c.rows[0].case_id;

        const familyRead = await request(server, 'GET', `/api/v1/cases/${caseId}`, { headers: { 'X-Debug-Actor-Class': 'FAMILY' } });
        assert.strictEqual(familyRead.status, 403, 'FAMILY must be blocked from a case frozen by an active dispute');
        assert.strictEqual(familyRead.body.code, 'FC_ERR_403_DISPUTED_ACCESS');

        const caseWorkerRead = await request(server, 'GET', `/api/v1/cases/${caseId}`, { headers: { 'X-Debug-Actor-Class': 'CASE_WORKER' } });
        assert.strictEqual(caseWorkerRead.status, 200, 'CASE_WORKER must still be able to read a disputed case');
    } finally {
        server.close();
    }
});

test('GATE B2 — Audit Immutability: UPDATE/DELETE on audit_event is rejected at the database layer', async () => {
    // This is the gate the earlier pg-mem attempt could NOT verify — it
    // couldn't execute the PL/pgSQL trigger body at all. Running it here
    // against real Postgres is the actual proof the control works.
    const inserted = await pool.query(
        `INSERT INTO audit_event (actor, action, entity_type, entity_id, outcome)
         VALUES ('gate-b2-actor', 'GATE_TEST', 'Case', 'gate-b2', 'SUCCESS') RETURNING audit_id`,
    );
    const auditId = inserted.rows[0].audit_id;

    await assert.rejects(
        () => pool.query('UPDATE audit_event SET actor = $1 WHERE audit_id = $2', ['tampered', auditId]),
        /append-only/,
        'UPDATE on audit_event must be rejected by the database trigger, using application credentials, with no application-layer workaround',
    );
    await assert.rejects(
        () => pool.query('DELETE FROM audit_event WHERE audit_id = $1', [auditId]),
        /append-only/,
        'DELETE on audit_event must be rejected by the database trigger',
    );

    const stillThere = await pool.query('SELECT actor FROM audit_event WHERE audit_id = $1', [auditId]);
    assert.strictEqual(stillThere.rows[0].actor, 'gate-b2-actor', 'the original row must be untouched after both rejected mutation attempts');
});

test('GATE B3 — Agency Boundary: HIGHLY_RESTRICTED evidence is never returned to a non-CASE_WORKER/AUTHORITY actor', async () => {
    const server = app.listen(0);
    try {
        const person = await pool.query("INSERT INTO person (first_name, last_name) VALUES ('Evidence', 'Boundary') RETURNING person_id");
        const c = await pool.query(
            `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id)
             VALUES ($1, 'EVENT-NP-TIBET-2026', 'MISSING_PERSON', 'ACTIVE', $2) RETURNING case_id`,
            [`FC-TEST-EVIDENCE-${Date.now()}-${Math.random()}`, person.rows[0].person_id],
        );
        const caseId = c.rows[0].case_id;

        const submit = await request(server, 'POST', `/api/v1/cases/${caseId}/evidence`, {
            headers: { 'X-Debug-Actor-Class': 'CASE_WORKER', 'X-Debug-Actor-Id': 'gate-b3-caseworker', 'X-Debug-IAL': 'IAL-2', 'Idempotency-Key': randomUUID() },
            body: { evidenceType: 'PHYSICAL_DESCRIPTOR', descriptors: { height: '175cm', scars: 'left forearm' } },
        });
        assert.strictEqual(submit.status, 201);
        assert.strictEqual(submit.body.classification, 'HIGHLY_RESTRICTED');

        const partnerRead = await request(server, 'GET', `/api/v1/cases/${caseId}/evidence`, { headers: { 'X-Debug-Actor-Class': 'PARTNER' } });
        assert.strictEqual(partnerRead.status, 404, 'PARTNER (e.g. hospital portal) must not be able to list HIGHLY_RESTRICTED forensic evidence');

        const familyRead = await request(server, 'GET', `/api/v1/cases/${caseId}/evidence`, { headers: { 'X-Debug-Actor-Class': 'FAMILY' } });
        assert.strictEqual(familyRead.status, 404);

        const authorityRead = await request(server, 'GET', `/api/v1/cases/${caseId}/evidence`, { headers: { 'X-Debug-Actor-Class': 'AUTHORITY' } });
        assert.strictEqual(authorityRead.status, 200);
        assert.strictEqual(authorityRead.body[0].classification, 'HIGHLY_RESTRICTED');
    } finally {
        server.close();
    }
});

// ============================================================
// D. System Handover & Lifecycle (SPEC-007 §2.D)
// ============================================================

test('GATE D1 — Safeguarding Custody: handover is refused without digital acknowledgment, succeeds with it', async () => {
    const server = app.listen(0);
    try {
        const alert = await pool.query(
            `INSERT INTO safeguarding_alert (category) VALUES ('CHILD_PROTECTION') RETURNING alert_id`,
        );
        const alertId = alert.rows[0].alert_id;

        const withoutAck = await request(server, 'POST', `/api/v1/safeguarding/${alertId}/handover`, {
            headers: { 'X-Debug-Actor-Class': 'AUTHORITY', 'X-Debug-Actor-Id': 'gate-authority-actor', 'X-Debug-IAL': 'IAL-2' },
            body: {
                receivingOfficer: 'Insp. R. Thapa, Badge 4471',
                receivingAuthority: 'Nepal Police - Child Protection Unit',
                interventionType: 'STATUTORY_REFERRAL',
                reason: 'Unaccompanied minor located, requires statutory custody transfer.',
                // handoverAcknowledgement intentionally omitted
            },
        });
        assert.strictEqual(withoutAck.status, 400, 'a safeguarding handover must be refused without an explicit digital acknowledgment');

        const withAck = await request(server, 'POST', `/api/v1/safeguarding/${alertId}/handover`, {
            headers: { 'X-Debug-Actor-Class': 'AUTHORITY', 'X-Debug-Actor-Id': 'gate-authority-actor', 'X-Debug-IAL': 'IAL-2' },
            body: {
                receivingOfficer: 'Insp. R. Thapa, Badge 4471',
                receivingAuthority: 'Nepal Police - Child Protection Unit',
                interventionType: 'STATUTORY_REFERRAL',
                reason: 'Unaccompanied minor located, requires statutory custody transfer.',
                handoverAcknowledgement: true,
            },
        });
        assert.strictEqual(withAck.status, 200);
        assert.strictEqual(withAck.body.status, 'COMPLETED');
    } finally {
        server.close();
    }
});

test('GATE D2 — External Handover Sync: case export preserves original audit history untouched', async () => {
    const server = app.listen(0);
    try {
        const person = await pool.query("INSERT INTO person (first_name, last_name) VALUES ('Handover', 'History') RETURNING person_id");
        const c = await pool.query(
            `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id)
             VALUES ($1, 'EVENT-NP-TIBET-2026', 'MISSING_PERSON', 'ACTIVE', $2) RETURNING case_id`,
            [`FC-TEST-HANDOVER-${Date.now()}-${Math.random()}`, person.rows[0].person_id],
        );
        const caseId = c.rows[0].case_id;

        await pool.query(
            `INSERT INTO audit_event (actor, action, entity_type, entity_id, outcome) VALUES ('pre-handover-actor', 'PRE_HANDOVER_EVENT', 'Case', $1, 'SUCCESS')`,
            [caseId],
        );

        const handover = await request(server, 'POST', `/api/v1/cases/${caseId}/handovers`, {
            headers: { 'X-Debug-Actor-Class': 'AUTHORITY', 'X-Debug-Actor-Id': 'gate-authority-actor', 'X-Debug-IAL': 'IAL-2' },
            body: {
                receivingSystem: 'ICRC_TRACING', externalCaseReference: 'ICRC-2026-00417',
                handoverReason: 'Long-term unresolved case transferred per BR-014.',
                authorisedBy: 'District Authority of Record',
            },
        });
        assert.strictEqual(handover.status, 200);
        assert.strictEqual(handover.body.caseStatus, 'TRANSFERRED');
        assert.strictEqual(handover.body.originalHistoryPreserved, true);

        // BR-014: the prior audit history attached to the Case entity
        // itself must survive the handover completely unmodified...
        const priorEventStillIntact = await pool.query(
            "SELECT actor FROM audit_event WHERE entity_id = $1 AND entity_type = 'Case' AND action = 'PRE_HANDOVER_EVENT'", [caseId],
        );
        assert.strictEqual(priorEventStillIntact.rows.length, 1, 'the pre-handover Case audit event must still exist, unmodified');
        assert.strictEqual(priorEventStillIntact.rows[0].actor, 'pre-handover-actor');

        // ...and the handover itself must also have generated its own new
        // audit event (attributed to the CaseHandover entity it created,
        // consistent with how every other action in this build logs
        // audit entries against the entity the action produced).
        const handoverEvent = await pool.query(
            "SELECT actor FROM audit_event WHERE entity_id = $1 AND entity_type = 'CaseHandover' AND action = 'CASE_EXTERNALLY_TRANSFERRED'",
            [handover.body.handoverId],
        );
        assert.strictEqual(handoverEvent.rows.length, 1, 'the handover action must itself be audited');
        assert.strictEqual(handoverEvent.rows[0].actor, 'gate-authority-actor');
    } finally {
        server.close();
    }
});

test.after(async () => {
    await pool.end();
});
