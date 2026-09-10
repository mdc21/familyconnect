const express = require('express');
const crypto = require('crypto');
const { validate: isUuid } = require('uuid');
const { pool, writeAuditEvent, isIdempotencyKeyRaceConflict } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireIdempotencyKey } = require('../../middleware/idempotency');

const router = express.Router({ mergeParams: true });

function payloadHash(payload) {
    // Normalises key order so equivalent JSON bodies hash identically.
    return crypto.createHash('sha256').update(JSON.stringify(payload, Object.keys(payload).sort())).digest('hex');
}

async function insertCommunication(client, caseId, actorId, payload, idempotencyKey) {
    const { channel, recipientName, purpose, attemptedAt, outcome, notes, nextAction } = payload;
    if (!channel) throw new ProblemError('INVALID_SCHEMA', 'channel is required');

    const hash = payloadHash(payload);
    const existing = await client.query(
        'SELECT * FROM communication_attempt WHERE idempotency_key = $1', [idempotencyKey],
    );
    if (existing.rows.length) {
        // SPEC-003 §6: same key + same payload replays cleanly; same key +
        // different payload is a genuine conflict (409), not a silent
        // pass-through — the follow-up flagged after Phase 2 that this
        // distinction wasn't being made.
        if (existing.rows[0].payload_hash === hash) {
            return { row: existing.rows[0], duplicate: true };
        }
        throw new ProblemError(
            'IDEMPOTENCY_CONFLICT',
            'This Idempotency-Key was already used with a different request body.',
        );
    }

    try {
        const inserted = await client.query(
            `INSERT INTO communication_attempt
                (case_id, recipient, channel, initiated_by, purpose, attempted_at, outcome, notes, next_action, idempotency_key, payload_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [caseId, recipientName || null, channel, actorId, purpose || null,
                attemptedAt || new Date().toISOString(), outcome || null, notes || null, nextAction || null, idempotencyKey, hash],
        );
        await writeAuditEvent(client, {
            actor: actorId, action: 'COMMUNICATION_LOGGED', entityType: 'CommunicationAttempt',
            entityId: inserted.rows[0].communication_id, newState: { channel, outcome }, outcome: 'SUCCESS',
        });
        return { row: inserted.rows[0], duplicate: false };
    } catch (err) {
        if (isIdempotencyKeyRaceConflict(err, 'communication_attempt_idempotency_key_key')) {
            // SPEC-007 §2.A: lost a genuine concurrent race after the
            // existence check above passed. The caller's transaction is
            // now aborted, so the caller is responsible for ROLLBACK before
            // re-reading — this function only signals which case it is.
            const raceError = new Error('IDEMPOTENCY_RACE_LOST');
            raceError.isIdempotencyRace = true;
            raceError.idempotencyKey = idempotencyKey;
            throw raceError;
        }
        throw err;
    }
}

/**
 * POST /api/v1/cases/:caseId/communications — SPEC-003 §3.4.
 * Records radio broadcasts, in-person visits, satellite/embassy relays
 * when telecom infrastructure fails (SPEC-003 v0.2 gap-analysis item #3,
 * already fixed in the v0.2 baseline — this scaffold just implements it).
 */
router.post('/:caseId/communications', requireIdempotencyKey, async (req, res, next) => {
    if (!['CASE_WORKER', 'PARTNER', 'AUTHORITY'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    let client;
    try {
        client = await pool.connect();
    } catch (connectErr) {
        // SPEC-003 §6: a DB outage is a 503 Degraded Mode, not an unhandled
        // rejection — this is the one failure mode every write handler
        // shares, so it is worth getting right everywhere at once.
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }
    try {
        await client.query('BEGIN');
        const { row } = await insertCommunication(client, req.params.caseId, req.actor.actorId, req.body, req.idempotencyKey);
        await client.query('COMMIT');
        res.status(201).json({
            communicationId: row.communication_id,
            caseId: req.params.caseId,
            loggedAt: row.attempted_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.isIdempotencyRace) {
            try {
                const winner = await pool.query('SELECT * FROM communication_attempt WHERE idempotency_key = $1', [err.idempotencyKey]);
                if (winner.rows.length) {
                    return res.status(201).json({
                        communicationId: winner.rows[0].communication_id, caseId: req.params.caseId, loggedAt: winner.rows[0].attempted_at,
                    });
                }
            } catch (reReadErr) {
                return next(reReadErr);
            }
        }
        next(err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/cases/:caseId/communications/batch — SPEC-006 §5
 * "Offline Communication Sync ... Batch Upload interface". Field workers
 * accumulate CommunicationAttempt entries on paper/offline devices, then
 * upload the queue once connectivity returns. Each item carries its own
 * clientIdempotencyKey (generated on-device at time of entry) so a
 * partially-successful batch can be safely retried without duplicating
 * the entries that already landed.
 */
router.post('/:caseId/communications/batch', async (req, res, next) => {
    const items = req.body && req.body.communications;
    if (!Array.isArray(items) || !items.length) {
        return next(new ProblemError('INVALID_SCHEMA', 'communications must be a non-empty array', req.originalUrl));
    }
    if (items.length > 100) {
        return next(new ProblemError('INVALID_SCHEMA', 'communications batch cannot exceed 100 items', req.originalUrl));
    }
    if (!['CASE_WORKER', 'PARTNER', 'AUTHORITY'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }

    let client;
    try {
        client = await pool.connect();
    } catch (connectErr) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    const results = [];
    try {
        await client.query('BEGIN');
        for (const item of items) {
            if (!item.clientIdempotencyKey || !isUuid(item.clientIdempotencyKey)) {
                results.push({ status: 'REJECTED', reason: 'clientIdempotencyKey (UUIDv4) is required per item' });
                continue;
            }
            try {
                // Use savepoints for partial batch success without breaking the whole transaction
                await client.query(`SAVEPOINT batch_item`);
                const { row, duplicate } = await insertCommunication(client, req.params.caseId, req.actor.actorId, item, item.clientIdempotencyKey);
                results.push({
                    status: duplicate ? 'DUPLICATE' : 'ACCEPTED',
                    communicationId: row.communication_id,
                    clientIdempotencyKey: item.clientIdempotencyKey,
                });
                await client.query(`RELEASE SAVEPOINT batch_item`);
            } catch (err) {
                await client.query(`ROLLBACK TO SAVEPOINT batch_item`);
                if (err.isIdempotencyRace) {
                    try {
                        const winner = await client.query('SELECT * FROM communication_attempt WHERE idempotency_key = $1', [err.idempotencyKey]);
                        if (winner.rows.length) {
                            results.push({ status: 'DUPLICATE', communicationId: winner.rows[0].communication_id, clientIdempotencyKey: item.clientIdempotencyKey });
                            continue;
                        }
                    } catch (reReadErr) {
                        results.push({ status: 'REJECTED', clientIdempotencyKey: item.clientIdempotencyKey, reason: reReadErr.message });
                        continue;
                    }
                }
                results.push({ status: 'REJECTED', clientIdempotencyKey: item.clientIdempotencyKey, reason: err.detail || err.message });
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        return next(err);
    } finally {
        client.release();
    }

    const accepted = results.filter((r) => r.status === 'ACCEPTED').length;
    const duplicates = results.filter((r) => r.status === 'DUPLICATE').length;
    const rejected = results.filter((r) => r.status === 'REJECTED').length;
    res.status(207).json({ // 207 Multi-Status: per-item outcomes, matching the mixed success reality of a batch sync
        caseId: req.params.caseId,
        summary: { accepted, duplicates, rejected, total: items.length },
        results,
    });
});

module.exports = router;
