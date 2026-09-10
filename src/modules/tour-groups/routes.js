const express = require('express');
const { validate: isUuid } = require('uuid');
const { pool, writeAuditEvent, isIdempotencyKeyRaceConflict } = require('../../db');
const { ProblemError } = require('../../middleware/problems');

const router = express.Router();

const MANIFEST_STATUSES = new Set(['LISTED', 'SAFE', 'MISSING', 'DECEASED', 'UNKNOWN']);

/**
 * POST /api/v1/tour-groups
 * Actors: PARTNER (tour operator), AUTHORITY. SPEC-001 §5 identifies tour
 * operators as a distinct actor with group-manifest responsibilities that
 * the rest of the model doesn't otherwise capture — a group of travellers
 * moves and is accounted for together, ahead of any individual missing
 * report being filed.
 */
router.post('/', async (req, res, next) => {
    if (!['PARTNER', 'AUTHORITY'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    const { itinerary, departure, expectedReturn, coordinator, memberCount } = req.body || {};
    if (!coordinator) return next(new ProblemError('INVALID_SCHEMA', 'coordinator is required', req.originalUrl));

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
        const group = await client.query(
            `INSERT INTO tour_group (operator_id, itinerary, departure, expected_return, coordinator, member_count)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [req.actor.organisationId || null, itinerary || null, departure || null, expectedReturn || null, coordinator, memberCount || null],
        );
        await writeAuditEvent(client, {
            actor: req.actor.actorId, organisation: req.actor.organisationId, action: 'TOUR_GROUP_REGISTERED',
            entityType: 'TourGroup', entityId: group.rows[0].group_id, newState: { coordinator }, outcome: 'SUCCESS',
        });
        await client.query('COMMIT');
        res.status(201).json({
            groupId: group.rows[0].group_id, coordinator, verificationStatus: 'UNVERIFIED',
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/tour-groups/:groupId/members/batch
 * Manifest upload, same 207 Multi-Status / per-item idempotency-key
 * pattern as the communications batch endpoint — a manifest is often
 * transcribed from a paper passenger list after connectivity returns,
 * and re-sending the same list must not double-count members.
 */
router.post('/:groupId/members/batch', async (req, res, next) => {
    if (!['PARTNER', 'AUTHORITY', 'CASE_WORKER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    const members = req.body && req.body.members;
    if (!Array.isArray(members) || !members.length) {
        return next(new ProblemError('INVALID_SCHEMA', 'members must be a non-empty array', req.originalUrl));
    }

    const results = [];
    for (const m of members) {
        if (!m.clientIdempotencyKey || !isUuid(m.clientIdempotencyKey)) {
            results.push({ status: 'REJECTED', reason: 'clientIdempotencyKey (UUIDv4) is required per member' });
            continue;
        }
        if (!m.firstName || !m.lastName) {
            results.push({ status: 'REJECTED', clientIdempotencyKey: m.clientIdempotencyKey, reason: 'firstName and lastName are required' });
            continue;
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
            const existing = await client.query(
                'SELECT * FROM tour_group_member WHERE idempotency_key = $1', [m.clientIdempotencyKey],
            );
            if (existing.rows.length) {
                await client.query('COMMIT');
                results.push({ status: 'DUPLICATE', membershipId: existing.rows[0].membership_id, clientIdempotencyKey: m.clientIdempotencyKey });
                continue;
            }
            const person = await client.query(
                `INSERT INTO person (first_name, last_name, nationality) VALUES ($1,$2,$3) RETURNING person_id`,
                [m.firstName, m.lastName, m.nationality || null],
            );
            const membership = await client.query(
                `INSERT INTO tour_group_member (group_id, person_id, role_in_group, idempotency_key)
                 VALUES ($1,$2,$3,$4) RETURNING *`,
                [req.params.groupId, person.rows[0].person_id, m.roleInGroup || 'PARTICIPANT', m.clientIdempotencyKey],
            );
            await writeAuditEvent(client, {
                actor: req.actor.actorId, action: 'TOUR_GROUP_MEMBER_ADDED', entityType: 'TourGroupMember',
                entityId: membership.rows[0].membership_id, newState: { manifestStatus: 'LISTED' }, outcome: 'SUCCESS',
            });
            await client.query('COMMIT');
            results.push({ status: 'ACCEPTED', membershipId: membership.rows[0].membership_id, clientIdempotencyKey: m.clientIdempotencyKey });
        } catch (err) {
            await client.query('ROLLBACK');
            if (isIdempotencyKeyRaceConflict(err, 'tour_group_member_idempotency_key_key')) {
                // SPEC-007 §2.A race: two concurrent uploads of the same
                // manifest item. Rollback discards this attempt's orphaned
                // person row; re-read the winner's membership instead of
                // reporting a spurious rejection.
                try {
                    const winner = await pool.query('SELECT * FROM tour_group_member WHERE idempotency_key = $1', [m.clientIdempotencyKey]);
                    if (winner.rows.length) {
                        results.push({ status: 'DUPLICATE', membershipId: winner.rows[0].membership_id, clientIdempotencyKey: m.clientIdempotencyKey });
                        continue;
                    }
                } catch (reReadErr) {
                    results.push({ status: 'REJECTED', clientIdempotencyKey: m.clientIdempotencyKey, reason: reReadErr.message });
                    continue;
                }
            }
            results.push({ status: 'REJECTED', clientIdempotencyKey: m.clientIdempotencyKey, reason: err.detail || err.message });
        } finally {
            client.release();
        }
    }

    const accepted = results.filter((r) => r.status === 'ACCEPTED').length;
    const duplicates = results.filter((r) => r.status === 'DUPLICATE').length;
    const rejected = results.filter((r) => r.status === 'REJECTED').length;
    res.status(207).json({
        groupId: req.params.groupId,
        summary: { accepted, duplicates, rejected, total: members.length },
        results,
    });
});

/**
 * POST /api/v1/tour-groups/:groupId/members/:membershipId/status
 * Actors: CASE_WORKER, AUTHORITY, PARTNER. Updates a single manifest
 * entry's resolution status, optionally linking it to a Case opened
 * separately (e.g. once a member is individually reported missing, the
 * resulting MissingReport case gets cross-referenced back onto the
 * manifest so the group rollup stays accurate).
 */
router.post('/:groupId/members/:membershipId/status', async (req, res, next) => {
    if (!['CASE_WORKER', 'AUTHORITY', 'PARTNER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    const { manifestStatus, linkedCaseId } = req.body || {};
    if (!manifestStatus || !MANIFEST_STATUSES.has(manifestStatus)) {
        return next(new ProblemError('INVALID_SCHEMA', `manifestStatus must be one of ${[...MANIFEST_STATUSES].join(', ')}`, req.originalUrl));
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
        const updated = await client.query(
            `UPDATE tour_group_member SET manifest_status = $1, linked_case_id = COALESCE($2, linked_case_id)
             WHERE membership_id = $3 AND group_id = $4 RETURNING *`,
            [manifestStatus, linkedCaseId || null, req.params.membershipId, req.params.groupId],
        );
        if (!updated.rows.length) throw new ProblemError('NOT_FOUND', 'Membership not found', req.originalUrl);

        await writeAuditEvent(client, {
            actor: req.actor.actorId, action: 'TOUR_GROUP_MEMBER_STATUS_UPDATED', entityType: 'TourGroupMember',
            entityId: req.params.membershipId, newState: { manifestStatus }, outcome: 'SUCCESS',
        });
        await client.query('COMMIT');
        res.json({ membershipId: req.params.membershipId, manifestStatus, linkedCaseId: updated.rows[0].linked_case_id });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/tour-groups/:groupId
 * Group detail plus a manifest status rollup, so a coordinator or
 * authority can see "38 of 42 accounted for" without paging through
 * every individual member.
 */
router.get('/:groupId', async (req, res, next) => {
    if (!['PARTNER', 'AUTHORITY', 'CASE_WORKER'].includes(req.actor.actorClass)) {
        return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
    }
    try {
        const group = await pool.query('SELECT * FROM tour_group WHERE group_id = $1', [req.params.groupId]);
        if (!group.rows.length) throw new ProblemError('NOT_FOUND', 'Tour group not found', req.originalUrl);

        const rollup = await pool.query(
            `SELECT manifest_status, count(*)::int AS count FROM tour_group_member
             WHERE group_id = $1 GROUP BY manifest_status`,
            [req.params.groupId],
        );
        const statusRollup = Object.fromEntries([...MANIFEST_STATUSES].map((s) => [s, 0]));
        rollup.rows.forEach((r) => { statusRollup[r.manifest_status] = r.count; });

        res.json({
            groupId: group.rows[0].group_id,
            coordinator: group.rows[0].coordinator,
            itinerary: group.rows[0].itinerary,
            verificationStatus: group.rows[0].verification_status,
            statusRollup,
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
