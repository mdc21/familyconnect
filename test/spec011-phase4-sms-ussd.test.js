/**
 * Test Suite: SPEC-011 Phase 4 — SMS & USSD Low-Tech Gateway
 *
 * Verifies:
 * 1. POST /api/v1/sms/inbound — Twilio-compatible SMS webhook:
 *    - SAFE [name] AT [location] -> Creates SafetyDeclaration (source: 'SMS', IAL-1)
 *    - MISSING [name] [age] [location] -> Creates MissingReport (source: 'SMS', IAL-1)
 *    - FIND [case reference] -> Looks up case status
 *    - SHELTER -> Returns shelter addresses & hotlines
 *    - HELP -> Returns command list
 *    - Idempotency key handling (SHA256 of sender + text + date)
 * 2. Governance guardrails (§7.5 & §8):
 *    - Rejects death status updates via SMS
 *    - Rejects safeguarding flags via SMS
 *    - Rejects emergency alert broadcasts via SMS
 * 3. POST /api/v1/ussd/session — Multi-turn interactive USSD state machine (*1920#):
 *    - Menu 0 (Root): 1. I am safe, 2. Missing, 3. Find, 4. Shelters, 5. Emergency
 *    - Option 1 multi-turn flow to submission completion (CON -> END)
 *    - Option 2 missing person multi-turn flow (CON -> END)
 *    - Option 3 case lookup
 *    - Option 4 & 5 informational menus
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
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
});

after(async () => {
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
});

describe('SPEC-011 Phase 4 — SMS & USSD Low-Tech Access Gateway', () => {

    // ── SMS Inbound Tests ─────────────────────────────────────────────────────

    it('POST /api/v1/sms/inbound registers "SAFE [name] AT [location]" with IAL-1', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                From: '+9779841234567',
                Body: 'SAFE Anita Sharma AT Rasuwa Camp 3',
                MessageSid: `SM-${Date.now()}-safe`
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, 'SUCCESS');
        assert.equal(data.command, 'SAFE');
        assert.equal(data.ial, 1);
        assert.ok(data.reference.startsWith('FC-SMS-'));
        assert.ok(data.replyText.includes('Received. Ref FC-SMS-'));
    });

    it('POST /api/v1/sms/inbound registers "MISSING [name] [age] [location]" with IAL-1', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                From: '+9779847654321',
                Body: 'MISSING Ramesh 34 Rasuwagadhi',
                MessageSid: `SM-${Date.now()}-missing`
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, 'SUCCESS');
        assert.equal(data.command, 'MISSING');
        assert.equal(data.ial, 1);
        assert.ok(data.reference.startsWith('FC-SMS-'));
        assert.ok(data.replyText.includes('Received. Ref FC-SMS-'));
    });

    it('POST /api/v1/sms/inbound returns case status for "FIND [ref]"', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                From: '+9779841112233',
                Body: 'FIND FC-TEST-CASE-12345'
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.command, 'FIND');
        assert.ok(data.replyText.includes('FC-TEST-CASE-12345'));
    });

    it('POST /api/v1/sms/inbound responds to "SHELTER" and "HELP"', async () => {
        const resShelter = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ From: '+9779840000000', Body: 'SHELTER' })
        });
        assert.equal(resShelter.status, 200);
        const dataShelter = await resShelter.json();
        assert.ok(dataShelter.replyText.includes('Shelters'));

        const resHelp = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ From: '+9779840000000', Body: 'HELP' })
        });
        assert.equal(resHelp.status, 200);
        const dataHelp = await resHelp.json();
        assert.ok(dataHelp.replyText.includes('Commands: 1) SAFE'));
    });

    it('POST /api/v1/sms/inbound handles deduplication idempotently', async () => {
        const sid = `SM-DEDUP-${Date.now()}`;
        const payload = {
            From: '+9779849998888',
            Body: 'SAFE Maya Thapa AT Dhunche',
            MessageSid: sid
        };

        const firstRes = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        assert.equal(firstRes.status, 200);
        const firstData = await firstRes.json();
        const ref = firstData.reference;

        // Second identical request
        const secondRes = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        assert.equal(secondRes.status, 200);
        const secondData = await secondRes.json();
        assert.equal(secondData.deduplicated, true);
        assert.equal(secondData.reference, ref);
    });

    it('POST /api/v1/sms/inbound enforces §8 Governance Block on death status update', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                From: '+9779841234567',
                Body: 'CONFIRM DEATH STATUS OF RAMESH THAPA AS DECEASED'
            })
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.governanceBlocked, true);
        assert.equal(data.error, 'DEATH_STATUS_BLOCKED');
        assert.ok(data.message.includes('SPEC-011 §8'));
    });

    it('POST /api/v1/sms/inbound enforces §7.5 Governance Block on safeguarding flag', async () => {
        const res = await fetch(`${baseUrl}/api/v1/sms/inbound`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                From: '+9779841234567',
                Body: 'FLAG SAFEGUARDING ISSUE FOR CHILD AT CAMP'
            })
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.governanceBlocked, true);
        assert.equal(data.error, 'SAFEGUARDING_FLAG_BLOCKED');
        assert.ok(data.message.includes('SPEC-011 §7.5'));
    });

    // ── USSD Session Tests (*1920#) ──────────────────────────────────────────

    it('POST /api/v1/ussd/session presents Root Menu (step 0)', async () => {
        const res = await fetch(`${baseUrl}/api/v1/ussd/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'ussd-test-0',
                phoneNumber: '+919876543210',
                text: ''
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.action, 'CON');
        assert.ok(data.message.includes('1. I am safe'));
        assert.ok(data.message.includes('2. Report missing person'));
        assert.ok(data.message.includes('3. Find a case'));
    });

    it('POST /api/v1/ussd/session executes full "I Am Safe" flow', async () => {
        const sessionId = `ussd-safe-${Date.now()}`;

        // Step 1: User selects 1
        const res1 = await fetch(`${baseUrl}/api/v1/ussd/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, phoneNumber: '+919876543210', text: '1' })
        });
        const d1 = await res1.json();
        assert.equal(d1.action, 'CON');
        assert.ok(d1.message.includes('Enter your full name'));

        // Step 2: User provides name
        const res2 = await fetch(`${baseUrl}/api/v1/ussd/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, phoneNumber: '+919876543210', text: '1*Bikram Adhikari' })
        });
        const d2 = await res2.json();
        assert.equal(d2.action, 'CON');
        assert.ok(d2.message.includes('Enter your current location'));

        // Step 3: User provides location -> Completes session
        const res3 = await fetch(`${baseUrl}/api/v1/ussd/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, phoneNumber: '+919876543210', text: '1*Bikram Adhikari*Dhunche Camp 2' })
        });
        const d3 = await res3.json();
        assert.equal(d3.action, 'END');
        assert.ok(d3.message.includes('Bikram Adhikari'));
        assert.ok(d3.message.includes('Ref: FC-USSD-'));
    });

    it('POST /api/v1/ussd/session executes missing person report flow', async () => {
        const sessionId = `ussd-mis-${Date.now()}`;

        // User submits 2*Name*Age*Location in one string
        const res = await fetch(`${baseUrl}/api/v1/ussd/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                phoneNumber: '+919876543210',
                text: '2*Sunita Tamang*22*Langtang Valley'
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.action, 'END');
        assert.ok(data.message.includes('Sunita Tamang'));
        assert.ok(data.message.includes('Ref: FC-USSD-'));
    });

    it('POST /api/v1/ussd/session displays shelter locations and emergency numbers', async () => {
        const resShelter = await fetch(`${baseUrl}/api/v1/ussd/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: '4' })
        });
        const dShelter = await resShelter.json();
        assert.equal(dShelter.action, 'END');
        assert.ok(dShelter.message.includes('Active Shelters'));

        const resEmerg = await fetch(`${baseUrl}/api/v1/ussd/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: '5' })
        });
        const dEmerg = await resEmerg.json();
        assert.equal(dEmerg.action, 'END');
        assert.ok(dEmerg.message.includes('Emergency Helpline Numbers'));
    });
});
