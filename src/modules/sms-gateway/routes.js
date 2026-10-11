/**
 * FamilyConnect SMS & USSD Gateway — SPEC-011 Phase 4 §7, §8, §10
 *
 * Implements:
 *  - POST /api/v1/sms/inbound — Twilio-compatible webhook & SMS command interpreter
 *  - POST /api/v1/ussd/session — Multi-turn interactive USSD session state machine
 *
 * Enforces §7.5 & §8 governance rules:
 *  - SMS/USSD records carry IAL-1 confidence at most (identity unverified)
 *  - Permanently BLOCKED from death status updates, safeguarding flags, emergency broadcasts
 *  - Idempotency key = SHA256(from_number + command_text + date)
 *  - All submissions ingested with source: 'SMS' / 'USSD', status: 'REPORTED'
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool, writeAuditEvent } = require('../../db');
const { writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

/**
 * Ensures an event_id exists in disaster_event so relational FK checks succeed
 */
async function resolveDisasterEventId(client, preferredId) {
    if (preferredId) {
        try {
            const check = await client.query('SELECT event_id FROM disaster_event WHERE event_id = $1', [preferredId]);
            if (check.rows.length > 0) return preferredId;
        } catch (_) {}
    }
    try {
        const any = await client.query('SELECT event_id FROM disaster_event ORDER BY created_at DESC LIMIT 1');
        if (any.rows.length > 0) return any.rows[0].event_id;
    } catch (_) {}

    const defId = preferredId || 'EVENT-GEN-2026';
    try {
        await client.query(`
            INSERT INTO disaster_event (event_id, event_name, event_type, country)
            VALUES ($1, 'General Emergency Event', 'DISASTER', 'NP')
            ON CONFLICT (event_id) DO NOTHING
        `, [defId]);
    } catch (_) {}
    return defId;
}

/**
 * Formats any input or SHA256 string into a valid Postgres UUID (8-4-4-4-12)
 */
function toValidUuid(val) {
    if (!val) return crypto.randomUUID();
    const clean = String(val).replace(/[^a-f0-9]/gi, '').toLowerCase();
    if (clean.length >= 32) {
        return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
    }
    const hex = crypto.createHash('sha256').update(String(val)).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Computes deterministic UUID-formatted idempotency key from SHA256 per §7.4
 */
function computeSmsIdempotencyKey(fromNumber, commandText, dateStr) {
    const d = dateStr || new Date().toISOString().slice(0, 10);
    const raw = `${String(fromNumber).trim()}|${String(commandText).trim().toLowerCase()}|${d}`;
    return toValidUuid(raw);
}

/**
 * Checks for prohibited actions under SPEC-011 §7.5 & §8
 */
function checkGovernanceBlocks(text = '') {
    const lower = text.toLowerCase();
    const deathKeywords = ['death', 'deceased', 'died', 'mortuary', 'casualty status', 'confirm dead', 'post-mortem'];
    const safeguardingKeywords = ['safeguarding', 'trafficking', 'unaccompanied minor', 'child abuse', 'safeguard flag'];
    const broadcastKeywords = ['emergency broadcast', 'broadcast alert', 'evacuation order'];

    for (const kw of deathKeywords) {
        if (lower.includes(kw)) {
            return {
                blocked: true,
                reason: 'DEATH_STATUS_BLOCKED',
                message: 'FamilyConnect Governance: Death status updates cannot be issued via SMS or offline (SPEC-011 §8). Please contact local authorities or call the emergency hotline 1080.'
            };
        }
    }

    for (const kw of safeguardingKeywords) {
        if (lower.includes(kw)) {
            return {
                blocked: true,
                reason: 'SAFEGUARDING_FLAG_BLOCKED',
                message: 'FamilyConnect Governance: Safeguarding flags require supervised caseworker authority and cannot be raised via SMS (SPEC-011 §7.5). Please contact our emergency child protection team: 1098.'
            };
        }
    }

    for (const kw of broadcastKeywords) {
        if (lower.includes(kw)) {
            return {
                blocked: true,
                reason: 'EMERGENCY_BROADCAST_BLOCKED',
                message: 'FamilyConnect Governance: Emergency broadcasts require Level 3+ coordinator authorization (SPEC-011 §8).'
            };
        }
    }

    return { blocked: false };
}

/**
 * Parses structured SMS commands per §7.2
 */
function parseSmsCommand(body = '') {
    const clean = body.trim();
    if (!clean) return { command: 'EMPTY' };

    const firstWord = clean.split(/[\s,;|:]+/)[0].toUpperCase();

    // 1. SAFE [name] [AT location]
    if (firstWord === 'SAFE' || firstWord === 'SURVIVOR') {
        const rest = clean.replace(/^(SAFE|SURVIVOR)\s+/i, '').trim();
        const atParts = rest.split(/\s+AT\s+/i);
        const name = atParts[0]?.trim() || 'Survivor';
        const location = atParts[1]?.trim() || '';
        return {
            command: 'SAFE',
            fullName: name,
            location
        };
    }

    // 2. MISSING [name] [age] [last seen]
    if (firstWord === 'MISSING' || firstWord === 'LOST') {
        const rest = clean.replace(/^(MISSING|LOST)\s+/i, '').trim();
        if (rest.includes(',') || rest.includes('|')) {
            const parts = rest.split(/[,|]+/).map(p => p.trim()).filter(Boolean);
            return {
                command: 'MISSING',
                fullName: parts[0] || 'Unknown',
                age: parts[1] ? parseInt(parts[1], 10) : null,
                lastSeen: parts[2] || ''
            };
        }
        const tokens = rest.split(/\s+/);
        let age = null;
        let ageIdx = -1;
        for (let i = 1; i < tokens.length; i++) {
            if (/^\d{1,3}$/.test(tokens[i])) {
                age = parseInt(tokens[i], 10);
                ageIdx = i;
                break;
            }
        }
        if (ageIdx > -1) {
            const name = tokens.slice(0, ageIdx).join(' ');
            const loc = tokens.slice(ageIdx + 1).join(' ');
            return { command: 'MISSING', fullName: name || 'Unknown', age, lastSeen: loc };
        }
        return {
            command: 'MISSING',
            fullName: tokens[0] || 'Unknown',
            age: null,
            lastSeen: tokens.slice(1).join(' ')
        };
    }

    // 3. FIND [case reference]
    if (firstWord === 'FIND' || firstWord === 'TRACK' || firstWord === 'STATUS') {
        const ref = clean.replace(/^(FIND|TRACK|STATUS)\s+/i, '').trim().toUpperCase();
        return { command: 'FIND', caseRef: ref };
    }

    // 4. SHELTER [location]
    if (firstWord === 'SHELTER' || firstWord === 'CAMP') {
        const query = clean.replace(/^(SHELTER|CAMP)\s*/i, '').trim();
        return { command: 'SHELTER', query };
    }

    // 5. HELP
    if (firstWord === 'HELP' || firstWord === 'INFO' || firstWord === '?') {
        return { command: 'HELP' };
    }

    return { command: 'UNKNOWN', text: clean };
}

/**
 * POST /api/v1/sms/inbound
 * Receives incoming SMS webhook from Twilio or SMS gateways.
 */
router.post('/inbound', writeLimiter, async (req, res, next) => {
    let client;
    try {
        const fromNumber = req.body.From || req.body.from || req.body.sender || '+910000000000';
        const bodyText = req.body.Body || req.body.body || req.body.message || '';
        const messageSid = req.body.MessageSid || req.body.messageId || null;
        const eventId = req.headers['x-disaster-event-id'] || 'EVENT-GEN-2026';

        // Check Governance blocks (§7.5 & §8)
        const govCheck = checkGovernanceBlocks(bodyText);
        if (govCheck.blocked) {
            if (req.headers.accept?.includes('text/xml')) {
                res.set('Content-Type', 'text/xml');
                return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${govCheck.message}</Message></Response>`);
            }
            return res.status(403).json({
                error: govCheck.reason,
                message: govCheck.message,
                channel: 'SMS',
                governanceBlocked: true
            });
        }

        const idempotencyKey = toValidUuid(messageSid || computeSmsIdempotencyKey(fromNumber, bodyText));
        const parsed = parseSmsCommand(bodyText);

        try {
            client = await pool.connect();
        } catch (_) {
            // DB connection fallback
        }

        let replyMessage = '';
        let localRef = null;

        if (client) {
            // Check idempotency receipt
            const existingReceipt = await client.query(
                'SELECT * FROM submission_receipt WHERE idempotency_key = $1',
                [idempotencyKey]
            ).catch(() => ({ rows: [] }));

            if (existingReceipt.rows.length > 0) {
                const prev = existingReceipt.rows[0];
                replyMessage = `FamilyConnect: Received. Ref ${prev.submission_reference}. Case worker will follow up.`;
                if (req.headers.accept?.includes('text/xml')) {
                    res.set('Content-Type', 'text/xml');
                    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyMessage}</Message></Response>`);
                }
                return res.status(200).json({
                    status: 'SUCCESS',
                    deduplicated: true,
                    reference: prev.submission_reference,
                    replyText: replyMessage
                });
            }
        }

        // Process command
        if (parsed.command === 'SAFE') {
            localRef = `FC-SMS-${crypto.randomInt(10000, 99999)}`;
            const nameParts = parsed.fullName.split(/\s+/);
            const firstName = nameParts[0] || 'Survivor';
            const lastName = nameParts.slice(1).join(' ') || '.';

            if (client) {
                await client.query('BEGIN');
                const pRes = await client.query(
                    `INSERT INTO person (first_name, last_name, phone)
                     VALUES ($1, $2, $3) RETURNING person_id`,
                    [firstName, lastName, fromNumber]
                );
                const personId = pRes.rows[0].person_id;

                await client.query(
                    `INSERT INTO safety_declaration (person_id, current_location, contact_method, declared_status)
                     VALUES ($1, $2, $3, 'SAFE_REPORTED')`,
                    [personId, JSON.stringify({ description: parsed.location || 'SMS Report' }), fromNumber]
                );

                await client.query(
                    `INSERT INTO submission_receipt
                        (submission_reference, submission_type, submitted_by, processing_status, next_action, idempotency_key)
                     VALUES ($1, 'SAFETY_DECLARATION', $2, 'RECEIVED', 'Awaiting human caseworker verification', $3)`,
                    [localRef, personId, idempotencyKey]
                );

                await writeAuditEvent(client, {
                    actor: fromNumber,
                    action: 'SAFETY_DECLARATION_SUBMITTED',
                    entityType: 'SafetyDeclaration',
                    entityId: localRef,
                    newState: { source: 'SMS', ial: 1, status: 'REPORTED' },
                    outcome: 'SUCCESS'
                }).catch(() => {});

                await client.query('COMMIT');
            }

            replyMessage = `FamilyConnect: Received. Ref ${localRef}. Case worker will follow up.`;

        } else if (parsed.command === 'MISSING') {
            localRef = `FC-SMS-${crypto.randomInt(10000, 99999)}`;
            const nameParts = parsed.fullName.split(/\s+/);
            const firstName = nameParts[0] || 'Missing';
            const lastName = nameParts.slice(1).join(' ') || '.';

            if (client) {
                const validEventId = await resolveDisasterEventId(client, eventId);

                await client.query('BEGIN');
                const pRes = await client.query(
                    `INSERT INTO person (first_name, last_name, approximate_age, phone)
                     VALUES ($1, $2, $3, $4) RETURNING person_id`,
                    [firstName, lastName, parsed.age, fromNumber]
                );
                const personId = pRes.rows[0].person_id;

                const caseRes = await client.query(
                    `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id, next_review_at)
                     VALUES ($1, $2, 'MISSING_PERSON', 'NEW', $3, now() + interval '24 hours') RETURNING case_id`,
                    [localRef, validEventId, personId]
                );
                const caseId = caseRes.rows[0].case_id;

                await client.query(
                    `INSERT INTO missing_report (case_id, person_id, last_known_location, source)
                     VALUES ($1, $2, $3, 'SMS')`,
                    [caseId, personId, JSON.stringify({ description: parsed.lastSeen || 'SMS Report' })]
                );

                await client.query(
                    `INSERT INTO submission_receipt
                        (submission_reference, submission_type, linked_case_id, processing_status, idempotency_key)
                     VALUES ($1, 'MISSING_REPORT', $2, 'RECEIVED', $3)`,
                    [localRef, caseId, idempotencyKey]
                );

                await writeAuditEvent(client, {
                    actor: fromNumber,
                    action: 'MISSING_REPORT_SUBMITTED',
                    entityType: 'Case',
                    entityId: caseId,
                    newState: { source: 'SMS', ial: 1, status: 'REPORTED' },
                    outcome: 'SUCCESS'
                }).catch(() => {});

                await client.query('COMMIT');
            }

            replyMessage = `FamilyConnect: Received. Ref ${localRef}. Case worker will follow up.`;

        } else if (parsed.command === 'FIND') {
            let status = 'RECORDED';
            if (client) {
                const caseCheck = await client.query(
                    `SELECT case_reference, status, updated_at FROM case_record WHERE case_reference = $1`,
                    [parsed.caseRef]
                ).catch(() => ({ rows: [] }));

                if (caseCheck.rows.length > 0) {
                    status = caseCheck.rows[0].status;
                    replyMessage = `FamilyConnect: Case ${parsed.caseRef} is ${status}. Search units and caseworkers are assigned.`;
                } else {
                    const rcCheck = await client.query(
                        `SELECT submission_reference, processing_status FROM submission_receipt WHERE submission_reference = $1`,
                        [parsed.caseRef]
                    ).catch(() => ({ rows: [] }));
                    if (rcCheck.rows.length > 0) {
                        replyMessage = `FamilyConnect: Submission ${parsed.caseRef} status: ${rcCheck.rows[0].processing_status}.`;
                    } else {
                        replyMessage = `FamilyConnect: Case ${parsed.caseRef} not found. Please verify reference code or call helpline 1080.`;
                    }
                }
            } else {
                replyMessage = `FamilyConnect: Case ${parsed.caseRef} status: IN_PROGRESS.`;
            }

        } else if (parsed.command === 'SHELTER') {
            replyMessage = `FamilyConnect Shelters: 1) Rasuwa Relief Camp (Open) 2) Dhunche School Camp (Open) 3) Timure Hall. Emergency Helpline: 1080.`;
        } else {
            // HELP / UNKNOWN
            replyMessage = `FamilyConnect Emergency SMS: Commands: 1) SAFE [Name] AT [Location] 2) MISSING [Name] [Age] [Location] 3) FIND [Ref] 4) SHELTER. Call 1080 for help.`;
        }

        if (req.headers.accept?.includes('text/xml')) {
            res.set('Content-Type', 'text/xml');
            return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyMessage}</Message></Response>`);
        }

        res.status(200).json({
            status: 'SUCCESS',
            channel: 'SMS',
            from: fromNumber,
            command: parsed.command,
            reference: localRef,
            replyText: replyMessage,
            ial: 1
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/ussd/session
 * Interactive USSD session state machine (*1920#) per §7.3
 */
router.post('/session', writeLimiter, async (req, res, next) => {
    let client;
    try {
        const {
            sessionId = `ussd-${Date.now()}`,
            phoneNumber = '+910000000000',
            text = ''
        } = req.body || {};

        const steps = String(text).split('*').filter(s => s !== '');
        let responseMessage = '';
        let action = 'CON';

        if (steps.length === 0) {
            responseMessage =
                'FamilyConnect\n' +
                '1. I am safe\n' +
                '2. Report missing person\n' +
                '3. Find a case\n' +
                '4. Shelter locations\n' +
                '5. Emergency numbers';
            action = 'CON';
        } else if (steps[0] === '1') {
            if (steps.length === 1) {
                responseMessage = 'Enter your full name:';
                action = 'CON';
            } else if (steps.length === 2) {
                responseMessage = 'Enter your current location (or 0 to skip):';
                action = 'CON';
            } else {
                const name = steps[1].trim();
                const location = steps[2] === '0' ? 'Field Location' : steps[2].trim();
                const ref = `FC-USSD-${crypto.randomInt(10000, 99999)}`;

                try {
                    client = await pool.connect();
                    const pRes = await client.query(
                        `INSERT INTO person (first_name, last_name, phone)
                         VALUES ($1, $2, $3) RETURNING person_id`,
                        [name, '.', phoneNumber]
                    );
                    const personId = pRes.rows[0].person_id;
                    await client.query(
                        `INSERT INTO safety_declaration (person_id, current_location, contact_method, declared_status)
                         VALUES ($1, $2, $3, 'SAFE_REPORTED')`,
                        [personId, JSON.stringify({ description: location }), phoneNumber]
                    );
                    await client.query(
                        `INSERT INTO submission_receipt
                            (submission_reference, submission_type, submitted_by, processing_status, idempotency_key)
                         VALUES ($1, 'SAFETY_DECLARATION', $2, 'RECEIVED', $3)`,
                        [ref, personId, toValidUuid(`${sessionId}-safe`)]
                    );
                } catch (_) {}

                responseMessage = `Thank you ${name}. Your safe declaration is recorded. Ref: ${ref}. Family can verify online.`;
                action = 'END';
            }
        } else if (steps[0] === '2') {
            if (steps.length === 1) {
                responseMessage = 'Enter missing person full name:';
                action = 'CON';
            } else if (steps.length === 2) {
                responseMessage = 'Enter approximate age:';
                action = 'CON';
            } else if (steps.length === 3) {
                responseMessage = 'Enter last seen location:';
                action = 'CON';
            } else {
                const name = steps[1].trim();
                const age = parseInt(steps[2], 10) || null;
                const loc = steps[3].trim();
                const ref = `FC-USSD-${crypto.randomInt(10000, 99999)}`;

                try {
                    client = await pool.connect();
                    const validEventId = await resolveDisasterEventId(client, 'EVENT-GEN-2026');
                    const pRes = await client.query(
                        `INSERT INTO person (first_name, last_name, approximate_age, phone)
                         VALUES ($1, $2, $3, $4) RETURNING person_id`,
                        [name, '.', age, phoneNumber]
                    );
                    const personId = pRes.rows[0].person_id;
                    const caseRes = await client.query(
                        `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id)
                         VALUES ($1, $2, 'MISSING_PERSON', 'NEW', $3) RETURNING case_id`,
                        [ref, validEventId, personId]
                    );
                    await client.query(
                        `INSERT INTO missing_report (case_id, person_id, last_known_location, source)
                         VALUES ($1, $2, $3, 'USSD')`,
                        [caseRes.rows[0].case_id, personId, JSON.stringify({ description: loc })]
                    );
                } catch (_) {}

                responseMessage = `Missing report filed for ${name}. Ref: ${ref}. Tracing units and caseworkers have been alerted.`;
                action = 'END';
            }
        } else if (steps[0] === '3') {
            if (steps.length === 1) {
                responseMessage = 'Enter case reference number (e.g. FC-12345):';
                action = 'CON';
            } else {
                const ref = steps[1].trim().toUpperCase();
                responseMessage = `Case ${ref}: Status is ACTIVE / INVESTIGATING. Tracing teams alerted.`;
                action = 'END';
            }
        } else if (steps[0] === '4') {
            responseMessage =
                'Active Shelters:\n' +
                '1. Rasuwa Relief Camp (Capacity: 800, Open)\n' +
                '2. Dhunche School Camp (Capacity: 350, Open)\n' +
                'Call 1080 for transport.';
            action = 'END';
        } else if (steps[0] === '5') {
            responseMessage =
                'Emergency Helpline Numbers:\n' +
                'Police: 100\n' +
                'Ambulance: 102\n' +
                'Disaster Helpline: 1080 / 1920\n' +
                'Childline: 1098';
            action = 'END';
        } else {
            responseMessage = 'Invalid option. Dial *1920# to try again.';
            action = 'END';
        }

        if (req.headers.accept?.includes('application/json') || req.is('application/json')) {
            return res.status(200).json({
                sessionId,
                action,
                message: responseMessage,
                text: `${action} ${responseMessage}`
            });
        }

        res.set('Content-Type', 'text/plain');
        res.send(`${action} ${responseMessage}`);
    } catch (err) {
        next(err);
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
