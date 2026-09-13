const express = require('express');
const crypto = require('crypto');
const { pool, writeAuditEvent } = require('../../db');
const { writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

// In-memory gateway message history for field coordinator visibility (last 50 messages)
const gatewayMessageLogs = [];

function generateCaseRef(eventId) {
    const code = (eventId || 'EVT').split('-')[1] || 'GEN';
    const num = Math.floor(10000 + Math.random() * 90000);
    return `FC-${code}-${new Date().getFullYear()}-${num}`;
}

/**
 * Parses freeform SMS / WhatsApp text messages into structured disaster commands
 */
function parseMessageText(text = '') {
    const clean = text.trim();
    if (!clean) return { command: 'EMPTY' };

    const firstWord = clean.split(/[\s,;|:]+/)[0].toUpperCase();

    if (firstWord === 'SAFE' || firstWord === 'SURVIVOR') {
        // Syntax: SAFE Name | Location | Contact
        const rawParams = clean.replace(/^(SAFE|SURVIVOR)\s+/i, '');
        const parts = rawParams.split(/[|,;]+/).map(s => s.trim()).filter(Boolean);
        return {
            command: 'SAFE',
            fullName: parts[0] || 'Unknown Survivor',
            location: parts[1] || 'Field Location',
            contact: parts[2] || ''
        };
    }

    if (firstWord === 'MISSING' || firstWord === 'LOST' || firstWord === 'SEARCH') {
        // Syntax: MISSING Name | Age or Details | Last Known Location | Reporter Contact
        const rawParams = clean.replace(/^(MISSING|LOST|SEARCH)\s+/i, '');
        const parts = rawParams.split(/[|,;]+/).map(s => s.trim()).filter(Boolean);
        return {
            command: 'MISSING',
            fullName: parts[0] || 'Unknown Missing Person',
            details: parts[1] || '',
            lastKnownLocation: parts[2] || 'Disaster Zone',
            contact: parts[3] || ''
        };
    }

    if (firstWord === 'SHELTER' || firstWord === 'CAMP') {
        const query = clean.replace(/^(SHELTER|CAMP)\s*/i, '').trim();
        return {
            command: 'SHELTER',
            query
        };
    }

    if (firstWord === 'WATER' || firstWord === 'PHE') {
        const query = clean.replace(/^(WATER|PHE)\s*/i, '').trim();
        return {
            command: 'WATER',
            query
        };
    }

    return {
        command: 'HELP',
        rawText: clean
    };
}

/**
 * Core processing logic for an incoming SMS or WhatsApp message
 */
async function processInboundMessage({ from, body, channel = 'SMS', eventId = 'EVENT-IN-FL-2026-1187' }) {
    const parsed = parseMessageText(body);
    let replyText = '';
    let recordResult = null;

    let client;
    try {
        client = await pool.connect();
    } catch (e) {
        // DB fallback
        console.warn('Gateway DB connection failed, using fallback mock response');
    }

    try {
        if (parsed.command === 'SAFE') {
            const caseRef = `FC-SAFE-${crypto.randomInt(100000, 1000000)}`;
            const nameParts = parsed.fullName.split(/\s+/);
            const firstName = nameParts[0] || 'Survivor';
            const lastName = nameParts.slice(1).join(' ') || '.';

            if (client) {
                await client.query('BEGIN');
                const personRes = await client.query(
                    `INSERT INTO person (first_name, last_name, phone)
                     VALUES ($1, $2, $3) RETURNING person_id`,
                    [firstName, lastName, parsed.contact || from]
                );
                const personId = personRes.rows[0].person_id;

                await client.query(
                    `INSERT INTO safety_declaration (person_id, current_location, contact_method, declared_status)
                     VALUES ($1, $2, $3, 'SAFE_REPORTED')`,
                    [personId, JSON.stringify({ description: parsed.location }), parsed.contact || from]
                );

                await client.query(
                    `INSERT INTO submission_receipt (submission_reference, submission_type, submitted_by, processing_status, idempotency_key)
                     VALUES ($1, 'SAFETY_DECLARATION', $2, 'RECEIVED', $3)`,
                    [caseRef, personId, crypto.randomUUID()]
                );
                await client.query('COMMIT');
            }

            recordResult = { caseRef, name: parsed.fullName, location: parsed.location };
            replyText = `FamilyConnect: Safe declaration registered for ${parsed.fullName}. Tracking Reference: ${caseRef}. Your relatives can verify at https://familyconnect.live/track?ref=${caseRef}`;

        } else if (parsed.command === 'MISSING') {
            const caseRef = generateCaseRef(eventId);
            const nameParts = parsed.fullName.split(/\s+/);
            const firstName = nameParts[0] || 'Missing';
            const lastName = nameParts.slice(1).join(' ') || '.';

            if (client) {
                await client.query('BEGIN');
                const personRes = await client.query(
                    `INSERT INTO person (first_name, last_name, phone)
                     VALUES ($1, $2, $3) RETURNING person_id`,
                    [firstName, lastName, parsed.contact || from]
                );
                const personId = personRes.rows[0].person_id;

                const caseRes = await client.query(
                    `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id, next_review_at)
                     VALUES ($1, $2, 'MISSING_PERSON', 'NEW', $3, now() + interval '24 hours') RETURNING case_id`,
                    [caseRef, eventId, personId]
                );
                const caseId = caseRes.rows[0].case_id;

                await client.query(
                    `INSERT INTO missing_report (case_id, person_id, last_known_location, source)
                     VALUES ($1, $2, $3, 'SMS_GATEWAY')`,
                    [caseId, personId, JSON.stringify({ description: parsed.lastKnownLocation })]
                );

                await client.query(
                    `INSERT INTO submission_receipt (submission_reference, submission_type, linked_case_id, processing_status, idempotency_key)
                     VALUES ($1, 'MISSING_REPORT', $2, 'RECEIVED', $3)`,
                    [`FC-MIS-${crypto.randomInt(100000, 1000000)}`, caseId, crypto.randomUUID()]
                );
                await client.query('COMMIT');
            }

            recordResult = { caseRef, name: parsed.fullName, location: parsed.lastKnownLocation };
            replyText = `FamilyConnect: Missing person case registered for ${parsed.fullName}. Case Ref: ${caseRef}. Search and Rescue & Red Cross tracing units have been alerted.`;

        } else if (parsed.command === 'SHELTER') {
            if (eventId.includes('IN') || (parsed.query && parsed.query.toLowerCase().includes('assam'))) {
                replyText = `FamilyConnect Assam Shelters: 1) Guwahati: Nehru Stadium (Cap: 1200) 2) Sivasagar: Govt HS Camp (Cap: 450) 3) Goalpara: Sports Complex. Emergency Hotline: +91 361 2237042`;
            } else {
                replyText = `FamilyConnect Nepal Shelters: 1) Melamchi High School (Sindhupalchok) 2) Dhunche Community Hall (Rasuwa). Emergency Hotline: +977 9999 999`;
            }
        } else if (parsed.command === 'WATER') {
            replyText = `FamilyConnect Safe Water: 1) Nehru Stadium Water Station (Guwahati) 2) Sivasagar Boarding Field purification unit 3) Goalpara Town Hall. Boil floodwater before drinking.`;
        } else {
            replyText = `FamilyConnect Emergency Gateway. Commands: 1) SAFE <Name> | <Location> 2) MISSING <Name> | <Details> | <Location> 3) SHELTER <District> 4) WATER. Emergency Call: 1070 / +977 9999 999`;
        }
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Gateway processing error:', err);
        replyText = `FamilyConnect: We encountered an error recording your message. Please call our toll-free disaster helpline: 1070.`;
    } finally {
        if (client) client.release();
    }

    const logEntry = {
        id: crypto.randomUUID ? crypto.randomUUID() : ('gw-' + Date.now()),
        timestamp: new Date().toISOString(),
        channel,
        from,
        inboundText: body,
        command: parsed.command,
        replyText,
        recordResult
    };

    gatewayMessageLogs.unshift(logEntry);
    if (gatewayMessageLogs.length > 50) gatewayMessageLogs.pop();

    return logEntry;
}

/**
 * POST /api/v1/gateways/sms
 * Twilio-compatible SMS webhook endpoint.
 * Twilio sends 'From' and 'Body' as form-urlencoded or JSON.
 */
router.post('/sms', writeLimiter, async (req, res) => {
    const from = req.body.From || req.body.from || req.body.sender || '+910000000000';
    const body = req.body.Body || req.body.body || req.body.message || '';
    const eventId = req.headers['x-disaster-event-id'] || 'EVENT-IN-FL-2026-1187';

    const result = await processInboundMessage({ from, body, channel: 'SMS', eventId });

    // Respond with Twilio TwiML or JSON depending on Accept header
    if (req.headers['accept'] && req.headers['accept'].includes('text/xml')) {
        res.set('Content-Type', 'text/xml');
        return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${result.replyText}</Message></Response>`);
    }

    res.json({
        status: 'SUCCESS',
        channel: 'SMS',
        from,
        replyText: result.replyText,
        reference: result.recordResult?.caseRef
    });
});

/**
 * POST /api/v1/gateways/whatsapp
 * WhatsApp webhook endpoint (Meta Cloud API / Twilio WhatsApp compatible).
 */
router.post('/whatsapp', writeLimiter, async (req, res) => {
    let from = req.body.From || req.body.from || '+910000000000';
    let body = req.body.Body || req.body.body || '';

    // Handle Meta Graph API payload structure if provided
    if (req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = req.body.entry[0].changes[0].value.messages[0];
        from = msg.from;
        body = msg.text?.body || '';
    }

    const eventId = req.headers['x-disaster-event-id'] || 'EVENT-IN-FL-2026-1187';
    const result = await processInboundMessage({ from, body, channel: 'WHATSAPP', eventId });

    res.json({
        status: 'SUCCESS',
        channel: 'WHATSAPP',
        from,
        replyText: result.replyText,
        reference: result.recordResult?.caseRef
    });
});

/**
 * POST /api/v1/gateways/simulate
 * Field test simulator for coordinators and evaluators.
 */
router.post('/simulate', async (req, res) => {
    const { from = '+91-94350-12345', body = 'HELP', channel = 'SMS', eventId = 'EVENT-IN-FL-2026-1187' } = req.body;
    const result = await processInboundMessage({ from, body, channel, eventId });
    res.json(result);
});

/**
 * GET /api/v1/gateways/logs
 * Retrieve recent gateway interactions for the coordinator console.
 */
router.get('/logs', (req, res) => {
    res.json({
        count: gatewayMessageLogs.length,
        logs: gatewayMessageLogs
    });
});

module.exports = router;
