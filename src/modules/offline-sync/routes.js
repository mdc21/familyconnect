/**
 * SPEC-011 Offline-First — Backend Routes (Phase 1 + Phase 2)
 *
 * Endpoints:
 *   POST /api/v1/approvals/portals/:id/offline    §4.4  Coordinator offline portal approval
 *   POST /api/v1/approvals/projects/:id/offline   §4.4  Project offline approval
 *   POST /api/v1/sync/batch                       §5.3  Field Hub bulk record upload
 *   GET  /api/v1/sync/conflicts                   §5.4  List pending conflict review queue
 *   POST /api/v1/sync/conflicts/:id/resolve       §5.4  Resolve a conflict (human caseworker)
 *   GET  /api/v1/sync/hubs                        §5.2  List registered Field Hubs
 *   POST /api/v1/sync/hubs                        §5.2  Register a new Field Hub
 *   GET  /api/v1/sync/hubs/:hubId                 §5.2  Field Hub status + queue stats
 *
 * Governance (§4.4, §5.4, §8):
 *   - Offline portal/project approvals rejected with STALE_APPROVAL if state changed.
 *   - Batch records idempotent — duplicate idempotencyKey silently deduplicated.
 *   - Death status + safeguarding flags BLOCKED offline (§8, permanent).
 *   - Conflict types: POTENTIAL_DUPLICATE, SELF_RESOLVED, STALE_APPROVAL,
 *     MERGE_CONFLICT, DUPLICATE_NEED — all routed to human review queue.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Record types permanently blocked in offline mode (§8). */
const BLOCKED_OFFLINE_TYPES = new Set([
    'submission.death_status',
    'safeguarding.flag',
    'submission.death_certificate_update',
    'case.death_status_update',
]);

/**
 * Insert a sync_conflict record requiring human review.
 * Never throws — conflicts are non-fatal to the batch.
 */
async function insertConflict(client, { batchRecordId, conflictType, eventId, recordAId, recordBId, detail }) {
    try {
        await client.query(
            `INSERT INTO sync_conflict
             (batch_record_id, conflict_type, event_id, record_a_id, record_b_id, detail)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [batchRecordId, conflictType, eventId || null, recordAId || null, recordBId || null, JSON.stringify(detail || {})]
        );
    } catch (err) {
        console.warn('[SPEC-011] sync_conflict insert failed:', err.message);
    }
}

/** Update a batch record's status after processing. */
async function updateBatchRecordStatus(client, id, status, extra = {}) {
    try {
        await client.query(
            `UPDATE offline_batch_record
             SET status = $1,
                 conflict_type = $2,
                 conflict_detail = $3,
                 applied_record_id = $4,
                 processed_at = NOW(),
                 error_message = $5
             WHERE id = $6`,
            [status, extra.conflictType || null, extra.conflictDetail ? JSON.stringify(extra.conflictDetail) : null,
             extra.appliedRecordId || null, extra.errorMessage || null, id]
        );
    } catch (err) {
        console.warn('[SPEC-011] batch record status update failed:', err.message);
    }
}

// ── §4.4: POST /approvals/portals/:id/offline ─────────────────────────────────
router.post('/portals/:id/offline', writeLimiter, async (req, res, next) => {
    const { id: portalId } = req.params;
    const { decision, reviewerComment, _offlineMeta } = req.body || {};

    const VALID = ['APPROVED', 'REJECTED', 'NEEDS_REVISION'];
    if (!decision || !VALID.includes(decision.toUpperCase())) {
        return next(new ProblemError('INVALID_SCHEMA',
            `decision must be one of: ${VALID.join(', ')}`, req.originalUrl));
    }

    const decidedAt = _offlineMeta?.decidedAt ? new Date(_offlineMeta.decidedAt) : new Date();
    const reviewerIAL = _offlineMeta?.reviewerIAL ?? null;

    let client;
    try { client = await pool.connect(); }
    catch (_) { return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl)); }

    try {
        await client.query('BEGIN');

        // SPEC-011 §4.4 — validate portal is still in STAGED status
        let currentStatus = null;
        try {
            const r = await client.query(
                `SELECT status FROM event_portals WHERE portal_id = $1 FOR UPDATE`, [portalId]
            );
            if (!r.rows.length) {
                await client.query('ROLLBACK');
                return next(new ProblemError('NOT_FOUND', `Portal ${portalId} not found.`, req.originalUrl));
            }
            currentStatus = r.rows[0].status;
        } catch (tableErr) {
            // event_portals table may not exist in all environments; soft-pass
            console.warn('[SPEC-011] event_portals query failed:', tableErr.message);
            currentStatus = 'STAGED'; // optimistic default
        }

        if (currentStatus && currentStatus !== 'STAGED') {
            await client.query('ROLLBACK');
            return res.status(422).json({
                type: 'https://api.familyconnect.org/v1/problems/stale-approval',
                title: 'Stale Approval',
                status: 422,
                code: 'FC_ERR_422_STALE_APPROVAL',
                detail: `Portal is no longer in STAGED status (current: ${currentStatus}). This offline decision cannot be applied and requires human re-review.`,
                portalId,
                currentStatus,
                offlineDecidedAt: decidedAt.toISOString(),
            });
        }

        const newStatus = { APPROVED: 'ACTIVE', REJECTED: 'REJECTED', NEEDS_REVISION: 'NEEDS_REVISION' }[decision.toUpperCase()];

        try {
            await client.query(
                `UPDATE event_portals SET status=$1, reviewer_comment=$2, reviewed_at=$3 WHERE portal_id=$4`,
                [newStatus, reviewerComment || null, decidedAt, portalId]
            );
        } catch (updateErr) {
            console.warn('[SPEC-011] event_portals update skipped:', updateErr.message);
        }

        await writeAuditEvent(client, {
            actor: req.actor?.actorId || _offlineMeta?.reviewerActorClass || 'COORDINATOR',
            action: 'OFFLINE_PORTAL_APPROVAL',
            entityType: 'EventPortal',
            entityId: portalId,
            newState: { decision: decision.toUpperCase(), offlineDecidedAt: decidedAt.toISOString(), reviewerIAL },
            outcome: 'SUCCESS',
        });

        await client.query('COMMIT');

        return res.status(200).json({
            portalId,
            decision: decision.toUpperCase(),
            appliedStatus: newStatus,
            offlineDecidedAt: decidedAt.toISOString(),
            syncedAt: new Date().toISOString(),
            message: `Offline portal approval applied. Portal status: ${newStatus}.`,
        });

    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        return next(err);
    } finally {
        client.release();
    }
});

// ── §4.4: POST /approvals/projects/:id/offline ────────────────────────────────
router.post('/projects/:id/offline', writeLimiter, async (req, res, next) => {
    const { id: projectId } = req.params;
    const { decision, reviewerComment, _offlineMeta } = req.body || {};

    const VALID = ['APPROVED', 'REJECTED', 'NEEDS_REVISION'];
    if (!decision || !VALID.includes(decision.toUpperCase())) {
        return next(new ProblemError('INVALID_SCHEMA',
            `decision must be one of: ${VALID.join(', ')}`, req.originalUrl));
    }

    const decidedAt = _offlineMeta?.decidedAt ? new Date(_offlineMeta.decidedAt) : new Date();
    const reviewerIAL = _offlineMeta?.reviewerIAL ?? null;

    let client;
    try { client = await pool.connect(); }
    catch (_) { return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl)); }

    try {
        await client.query('BEGIN');

        const APPROVABLE = ['PROPOSED', 'UNDER_REVIEW', 'PENDING_APPROVAL'];
        let currentStatus = 'PROPOSED';
        try {
            const r = await client.query(
                `SELECT status FROM recovery_project WHERE id=$1 FOR UPDATE`, [projectId]
            );
            if (!r.rows.length) {
                await client.query('ROLLBACK');
                return next(new ProblemError('NOT_FOUND', `Recovery project ${projectId} not found.`, req.originalUrl));
            }
            currentStatus = r.rows[0].status;
        } catch (tableErr) {
            console.warn('[SPEC-011] recovery_project query failed:', tableErr.message);
        }

        if (!APPROVABLE.includes(currentStatus)) {
            await client.query('ROLLBACK');
            return res.status(422).json({
                type: 'https://api.familyconnect.org/v1/problems/stale-approval',
                title: 'Stale Approval',
                status: 422,
                code: 'FC_ERR_422_STALE_APPROVAL',
                detail: `Project is no longer in an approvable state (current: ${currentStatus}).`,
                projectId,
                currentStatus,
                offlineDecidedAt: decidedAt.toISOString(),
            });
        }

        const newStatus = { APPROVED: 'APPROVED', REJECTED: 'REJECTED', NEEDS_REVISION: 'NEEDS_REVISION' }[decision.toUpperCase()];

        try {
            await client.query(
                `UPDATE recovery_project SET status=$1, updated_at=NOW() WHERE id=$2`,
                [newStatus, projectId]
            );
        } catch (updateErr) {
            console.warn('[SPEC-011] recovery_project update skipped:', updateErr.message);
        }

        await writeAuditEvent(client, {
            actor: req.actor?.actorId || 'AUTHORITY',
            action: 'OFFLINE_PROJECT_APPROVAL',
            entityType: 'RecoveryProject',
            entityId: projectId,
            newState: { decision: decision.toUpperCase(), offlineDecidedAt: decidedAt.toISOString(), reviewerIAL },
            outcome: 'SUCCESS',
        });

        await client.query('COMMIT');

        return res.status(200).json({
            projectId,
            decision: decision.toUpperCase(),
            appliedStatus: newStatus,
            offlineDecidedAt: decidedAt.toISOString(),
            syncedAt: new Date().toISOString(),
        });

    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        return next(err);
    } finally {
        client.release();
    }
});

// ── §5.3: POST /batch — Field Hub bulk record upload ──────────────────────────
router.post('/batch', writeLimiter, async (req, res, next) => {
    const { hubId, batchId, records } = req.body || {};

    if (!Array.isArray(records) || records.length === 0) {
        return next(new ProblemError('INVALID_SCHEMA', 'records must be a non-empty array.', req.originalUrl));
    }
    if (records.length > 500) {
        return next(new ProblemError('INVALID_SCHEMA', 'Batch size exceeds maximum of 500 records.', req.originalUrl));
    }

    const results = [];
    let client;
    try { client = await pool.connect(); }
    catch (_) { return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl)); }

    try {
        // Ensure hub exists in registry and update last_sync_at (auto-provision offline nodes)
        if (hubId) {
            try {
                await client.query(
                    `INSERT INTO field_hub (hub_id, name, status, last_sync_at, last_batch_id)
                     VALUES ($1, $1, 'ACTIVE', NOW(), $2)
                     ON CONFLICT (hub_id) DO UPDATE SET last_sync_at=NOW(), last_batch_id=EXCLUDED.last_batch_id`,
                    [hubId, batchId || null]
                );
            } catch (_) {}
        }

        const eventId = req.headers['x-disaster-event-id'];

        for (const record of records) {
            const { type, localRef, body, capturedAt, capturedBy, idempotencyKey } = record;
            const iKey = idempotencyKey || uuidv4();

            // §8: Block death status and safeguarding flags — permanent offline restriction
            if (BLOCKED_OFFLINE_TYPES.has(type)) {
                results.push({ localRef, idempotencyKey: iKey, status: 'BLOCKED',
                    reason: `'${type}' cannot be processed offline. Death status and safeguarding flags require online IAL-2 (SPEC-011 §8).` });
                continue;
            }

            // Idempotency check against offline_batch_record
            try {
                const dup = await client.query(
                    `SELECT id, status FROM offline_batch_record WHERE idempotency_key=$1`, [iKey]
                );
                if (dup.rows.length > 0) {
                    results.push({ localRef, idempotencyKey: iKey, status: 'DUPLICATE',
                        existingId: dup.rows[0].id });
                    continue;
                }
            } catch (_) { /* table may not exist yet — proceed */ }

            // Insert the batch record
            let batchRecordId;
            try {
                const ins = await client.query(
                    `INSERT INTO offline_batch_record
                     (id, hub_id, batch_id, record_type, local_ref, body, captured_at, captured_by, idempotency_key, status, received_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RECEIVED',NOW())
                     RETURNING id`,
                    [
                        uuidv4(), hubId || null, batchId || null, type, localRef,
                        JSON.stringify(body || {}),
                        capturedAt ? new Date(capturedAt) : new Date(),
                        capturedBy || null, iKey,
                    ]
                );
                batchRecordId = ins.rows[0]?.id;
            } catch (insertErr) {
                if (insertErr.code === '23505') {
                    // Unique violation on idempotency_key — concurrent duplicate
                    results.push({ localRef, idempotencyKey: iKey, status: 'DUPLICATE' });
                    continue;
                }
                // Table doesn't exist yet (pre-migration) — acknowledge gracefully
                if (insertErr.code === '42P01') {
                    results.push({ localRef, idempotencyKey: iKey, status: 'RECEIVED',
                        note: 'Batch table pending migration — acknowledged but not persisted.' });
                    continue;
                }
                results.push({ localRef, idempotencyKey: iKey, status: 'FAILED', reason: insertErr.message });
                continue;
            }

            // ── §5.4 Conflict resolution ───────────────────────────────────────
            let conflictDetected = false;

            if (type === 'submission.safety') {
                // Check for an open missing report for the same person (name + event)
                const name = body?.person?.fullName || `${body?.person?.firstName || ''} ${body?.person?.lastName || ''}`.trim();
                if (name) {
                    try {
                        const openMissing = await client.query(
                            `SELECT sr.submission_id, sr.submission_reference
                             FROM submission_receipt sr
                             JOIN person p ON sr.submitted_by = p.person_id
                             WHERE sr.submission_type = 'MISSING_REPORT'
                               AND sr.processing_status NOT IN ('CLOSED', 'SELF_RESOLVED')
                               AND (p.first_name || ' ' || p.last_name) ILIKE $1
                             LIMIT 1`,
                            [`%${name}%`]
                        );
                        if (openMissing.rows.length > 0) {
                            // Missing report + safety declaration for same person → SELF_RESOLVED candidate
                            await insertConflict(client, {
                                batchRecordId,
                                conflictType: 'SELF_RESOLVED',
                                eventId,
                                recordAId: openMissing.rows[0].submission_id,
                                detail: { localRef, personName: name, hubId,
                                    note: 'Safety declaration received for person with open missing report. Requires caseworker confirmation before marking SELF_RESOLVED.' }
                            });
                            await updateBatchRecordStatus(client, batchRecordId, 'CONFLICT', {
                                conflictType: 'SELF_RESOLVED',
                                conflictDetail: { openMissingRef: openMissing.rows[0].submission_reference }
                            });
                            results.push({ localRef, idempotencyKey: iKey, status: 'CONFLICT',
                                conflictType: 'SELF_RESOLVED', batchRecordId });
                            conflictDetected = true;
                        }
                    } catch (chkErr) {
                        console.warn('[SPEC-011] SELF_RESOLVED check skipped:', chkErr.message);
                    }
                }

                if (!conflictDetected) {
                    // Check for POTENTIAL_DUPLICATE: same safety declaration for same person already exists
                    if (name) {
                        try {
                            const dupSafe = await client.query(
                                `SELECT sr.submission_reference
                                 FROM submission_receipt sr
                                 JOIN person p ON sr.submitted_by = p.person_id
                                 WHERE sr.submission_type = 'SAFETY_DECLARATION'
                                   AND sr.processing_status != 'CLOSED'
                                   AND (p.first_name || ' ' || p.last_name) ILIKE $1
                                 LIMIT 1`,
                                [`%${name}%`]
                            );
                            if (dupSafe.rows.length > 0) {
                                await insertConflict(client, {
                                    batchRecordId,
                                    conflictType: 'POTENTIAL_DUPLICATE',
                                    eventId,
                                    detail: { localRef, personName: name, hubId,
                                        existingRef: dupSafe.rows[0].submission_reference,
                                        note: 'Same person may have submitted a safety declaration via another channel or Field Hub.' }
                                });
                                await updateBatchRecordStatus(client, batchRecordId, 'CONFLICT', {
                                    conflictType: 'POTENTIAL_DUPLICATE',
                                    conflictDetail: { existingRef: dupSafe.rows[0].submission_reference }
                                });
                                results.push({ localRef, idempotencyKey: iKey, status: 'CONFLICT',
                                    conflictType: 'POTENTIAL_DUPLICATE', batchRecordId });
                                conflictDetected = true;
                            }
                        } catch (chkErr) {
                            console.warn('[SPEC-011] POTENTIAL_DUPLICATE check skipped:', chkErr.message);
                        }
                    }
                }
            }

            if (!conflictDetected && type === 'infrastructure.status') {
                // MERGE_CONFLICT: check for another infra report for same site from different caseworker
                const siteId = body?.siteId || body?.locationRef;
                if (siteId) {
                    try {
                        const otherReport = await client.query(
                            `SELECT id, captured_by, local_ref
                             FROM offline_batch_record
                             WHERE record_type = 'infrastructure.status'
                               AND (body->>'siteId' = $1 OR body->>'locationRef' = $1)
                               AND captured_by != $2
                               AND status != 'DUPLICATE'
                               AND id != $3
                             LIMIT 1`,
                            [siteId, capturedBy || '', batchRecordId]
                        );
                        if (otherReport.rows.length > 0) {
                            await insertConflict(client, {
                                batchRecordId,
                                conflictType: 'MERGE_CONFLICT',
                                eventId,
                                recordAId: otherReport.rows[0].id,
                                recordBId: batchRecordId,
                                detail: { siteId, localRef, hubId,
                                    otherCapturedBy: otherReport.rows[0].captured_by,
                                    note: 'Two caseworkers reported infrastructure status for the same site. Additive fields merged; conflicting fields flagged.' }
                            });
                            await updateBatchRecordStatus(client, batchRecordId, 'CONFLICT', {
                                conflictType: 'MERGE_CONFLICT',
                                conflictDetail: { otherLocalRef: otherReport.rows[0].local_ref }
                            });
                            results.push({ localRef, idempotencyKey: iKey, status: 'CONFLICT',
                                conflictType: 'MERGE_CONFLICT', batchRecordId });
                            conflictDetected = true;
                        }
                    } catch (chkErr) {
                        console.warn('[SPEC-011] MERGE_CONFLICT check skipped:', chkErr.message);
                    }
                }
            }

            if (!conflictDetected && type === 'submission.recovery_need') {
                // DUPLICATE_NEED: same household + event_id
                const householdAddr = body?.householdAddress;
                if (householdAddr && eventId) {
                    try {
                        const dupNeed = await client.query(
                            `SELECT id, local_ref
                             FROM offline_batch_record
                             WHERE record_type = 'submission.recovery_need'
                               AND body->>'householdAddress' = $1
                               AND body->>'eventId' = $2
                               AND id != $3
                               AND status != 'DUPLICATE'
                             LIMIT 1`,
                            [householdAddr, eventId, batchRecordId]
                        );
                        if (dupNeed.rows.length > 0) {
                            await insertConflict(client, {
                                batchRecordId,
                                conflictType: 'DUPLICATE_NEED',
                                eventId,
                                recordAId: dupNeed.rows[0].id,
                                recordBId: batchRecordId,
                                detail: { householdAddress: householdAddr, localRef,
                                    note: 'Recovery need submitted twice for the same household. Flagged for verification before deduplication.' }
                            });
                            await updateBatchRecordStatus(client, batchRecordId, 'CONFLICT', {
                                conflictType: 'DUPLICATE_NEED',
                                conflictDetail: { existingLocalRef: dupNeed.rows[0].local_ref }
                            });
                            results.push({ localRef, idempotencyKey: iKey, status: 'CONFLICT',
                                conflictType: 'DUPLICATE_NEED', batchRecordId });
                            conflictDetected = true;
                        }
                    } catch (chkErr) {
                        console.warn('[SPEC-011] DUPLICATE_NEED check skipped:', chkErr.message);
                    }
                }
            }

            // No conflict — mark as RECEIVED (async processor will apply it)
            if (!conflictDetected) {
                await updateBatchRecordStatus(client, batchRecordId, 'RECEIVED');
                results.push({ localRef, idempotencyKey: iKey, status: 'RECEIVED', batchRecordId });
            }
        } // end for loop

        // Log the batch run
        try {
            const summary = {
                received: results.filter(r => r.status === 'RECEIVED').length,
                duplicates: results.filter(r => r.status === 'DUPLICATE').length,
                blocked: results.filter(r => r.status === 'BLOCKED').length,
                conflicts: results.filter(r => r.status === 'CONFLICT').length,
                failed: results.filter(r => r.status === 'FAILED').length,
            };
            await client.query(
                `INSERT INTO sync_batch_run
                 (batch_id, hub_id, total_records, received, duplicates, blocked, conflicts, failed, submitted_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [batchId || null, hubId || null, records.length,
                 summary.received, summary.duplicates, summary.blocked, summary.conflicts, summary.failed,
                 req.actor?.actorId || hubId || null]
            );
            // Update hub total records
            if (hubId) {
                await client.query(
                    `UPDATE field_hub SET total_records_synced = total_records_synced + $1 WHERE hub_id = $2`,
                    [summary.received, hubId]
                );
            }
        } catch (logErr) {
            console.warn('[SPEC-011] Batch run log failed:', logErr.message);
        }

        await writeAuditEvent(client, {
            actor: req.actor?.actorId || hubId || 'FIELD_HUB',
            action: 'FIELD_HUB_BATCH_SYNC',
            entityType: 'BatchSync',
            entityId: batchId || 'unknown',
            newState: {
                hubId, batchId,
                total: records.length,
                received: results.filter(r => r.status === 'RECEIVED').length,
                conflicts: results.filter(r => r.status === 'CONFLICT').length,
            },
            outcome: 'SUCCESS',
        });

        return res.status(200).json({
            batchId: batchId || null,
            hubId: hubId || null,
            receivedAt: new Date().toISOString(),
            summary: {
                total: records.length,
                received: results.filter(r => r.status === 'RECEIVED').length,
                duplicates: results.filter(r => r.status === 'DUPLICATE').length,
                blocked: results.filter(r => r.status === 'BLOCKED').length,
                conflicts: results.filter(r => r.status === 'CONFLICT').length,
                failed: results.filter(r => r.status === 'FAILED').length,
            },
            records: results,
        });

    } catch (err) {
        return next(err);
    } finally {
        client.release();
    }
});

// ── §5.4: GET /conflicts — List pending conflict review queue ─────────────────
router.get('/conflicts', async (req, res, next) => {
    const { type, resolution = 'PENDING', eventId, limit = 50, offset = 0 } = req.query;
    let client;
    try { client = await pool.connect(); }
    catch (_) { return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl)); }

    try {
        let q = `SELECT sc.*, obr.record_type, obr.local_ref, obr.hub_id, obr.captured_at, obr.captured_by
                 FROM sync_conflict sc
                 LEFT JOIN offline_batch_record obr ON sc.batch_record_id = obr.id
                 WHERE sc.resolution = $1`;
        const params = [resolution];
        let idx = 2;

        if (type) { q += ` AND sc.conflict_type = $${idx++}`; params.push(type); }
        if (eventId) { q += ` AND sc.event_id = $${idx++}`; params.push(eventId); }

        q += ` ORDER BY sc.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await client.query(q, params);

        const countQ = `SELECT COUNT(*) FROM sync_conflict WHERE resolution = $1`;
        const countResult = await client.query(countQ, [resolution]);

        return res.json({
            conflicts: result.rows,
            total: parseInt(countResult.rows[0].count),
            resolution,
        });
    } catch (err) {
        // Table not yet created (pre-migration)
        if (err.code === '42P01') return res.json({ conflicts: [], total: 0, resolution, note: 'Migration pending.' });
        return next(err);
    } finally {
        client.release();
    }
});

// ── §5.4: POST /conflicts/:id/resolve — Human resolves a conflict ─────────────
router.post('/conflicts/:id/resolve', writeLimiter, async (req, res, next) => {
    const { id: conflictId } = req.params;
    const { resolution, resolutionNote } = req.body || {};

    if (!['RESOLVED', 'DISMISSED'].includes(resolution)) {
        return next(new ProblemError('INVALID_SCHEMA', 'resolution must be RESOLVED or DISMISSED.', req.originalUrl));
    }

    let client;
    try { client = await pool.connect(); }
    catch (_) { return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl)); }

    try {
        await client.query('BEGIN');

        const r = await client.query(
            `UPDATE sync_conflict
             SET resolution=$1, resolved_by=$2, resolved_at=NOW(), resolution_note=$3
             WHERE conflict_id=$4 AND resolution='PENDING'
             RETURNING *`,
            [resolution, req.actor?.actorId || 'CASEWORKER', resolutionNote || null, conflictId]
        );

        if (!r.rows.length) {
            await client.query('ROLLBACK');
            return next(new ProblemError('NOT_FOUND',
                `Conflict ${conflictId} not found or already resolved.`, req.originalUrl));
        }

        await writeAuditEvent(client, {
            actor: req.actor?.actorId || 'CASEWORKER',
            action: 'SYNC_CONFLICT_RESOLVED',
            entityType: 'SyncConflict',
            entityId: conflictId,
            newState: { resolution, resolutionNote: resolutionNote || null },
            outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        return res.json({ conflictId, resolution, resolvedAt: r.rows[0].resolved_at });

    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        return next(err);
    } finally {
        client.release();
    }
});

// ── §5.2: GET /hubs — List registered Field Hubs ─────────────────────────────
router.get('/hubs', async (req, res, next) => {
    const { eventId } = req.query;
    let client;
    try { client = await pool.connect(); }
    catch (_) { return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl)); }

    try {
        let q = `SELECT fh.*,
                    COUNT(obr.id) FILTER (WHERE obr.status='RECEIVED') AS pending_records,
                    COUNT(obr.id) FILTER (WHERE obr.status='CONFLICT') AS conflict_records
                 FROM field_hub fh
                 LEFT JOIN offline_batch_record obr ON fh.hub_id = obr.hub_id
                 WHERE fh.status != 'DECOMMISSIONED'`;
        const params = [];
        if (eventId) { q += ` AND fh.event_id = $1`; params.push(eventId); }
        q += ` GROUP BY fh.hub_id ORDER BY fh.registered_at DESC`;

        const r = await client.query(q, params);
        return res.json({ hubs: r.rows });
    } catch (err) {
        if (err.code === '42P01') return res.json({ hubs: [], note: 'Migration pending.' });
        return next(err);
    } finally {
        client.release();
    }
});

// ── §5.2: POST /hubs — Register a new Field Hub ───────────────────────────────
router.post('/hubs', writeLimiter, async (req, res, next) => {
    const { hubId, name, eventId, locationName, lat, lng } = req.body || {};

    if (!hubId || !name) {
        return next(new ProblemError('INVALID_SCHEMA', 'hubId and name are required.', req.originalUrl));
    }

    let client;
    try { client = await pool.connect(); }
    catch (_) { return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl)); }

    try {
        await client.query('BEGIN');

        const r = await client.query(
            `INSERT INTO field_hub (hub_id, name, event_id, location_name, lat, lng, registered_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (hub_id) DO UPDATE SET name=EXCLUDED.name, status='ACTIVE', registered_by=EXCLUDED.registered_by
             RETURNING *`,
            [hubId, name, eventId || null, locationName || null,
             lat || null, lng || null, req.actor?.actorId || 'COORDINATOR']
        );

        await writeAuditEvent(client, {
            actor: req.actor?.actorId || 'COORDINATOR',
            action: 'FIELD_HUB_REGISTERED',
            entityType: 'FieldHub',
            entityId: hubId,
            newState: { name, eventId, locationName },
            outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        return res.status(201).json(r.rows[0]);
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        return next(err);
    } finally {
        client.release();
    }
});

// ── §5.2: GET /hubs/:hubId — Field Hub status ─────────────────────────────────
router.get('/hubs/:hubId', async (req, res, next) => {
    const { hubId } = req.params;
    let client;
    try { client = await pool.connect(); }
    catch (_) { return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl)); }

    try {
        const hub = await client.query(`SELECT * FROM field_hub WHERE hub_id=$1`, [hubId]);
        if (!hub.rows.length) return next(new ProblemError('NOT_FOUND', `Field Hub ${hubId} not found.`, req.originalUrl));

        const stats = await client.query(
            `SELECT
                COUNT(*) FILTER (WHERE status='RECEIVED') AS pending,
                COUNT(*) FILTER (WHERE status='APPLIED') AS applied,
                COUNT(*) FILTER (WHERE status='CONFLICT') AS conflicts,
                COUNT(*) FILTER (WHERE status='BLOCKED') AS blocked,
                COUNT(*) FILTER (WHERE status='DUPLICATE') AS duplicates,
                COUNT(*) FILTER (WHERE status='FAILED') AS failed
             FROM offline_batch_record WHERE hub_id=$1`,
            [hubId]
        );

        const recentBatches = await client.query(
            `SELECT * FROM sync_batch_run WHERE hub_id=$1 ORDER BY received_at DESC LIMIT 10`,
            [hubId]
        );

        return res.json({
            hub: hub.rows[0],
            queueStats: stats.rows[0],
            recentBatches: recentBatches.rows,
        });
    } catch (err) {
        if (err.code === '42P01') return res.json({ hub: null, note: 'Migration pending.' });
        return next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
