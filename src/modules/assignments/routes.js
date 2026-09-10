const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');

const router = express.Router({ mergeParams: true });

/**
 * POST /api/v1/cases/:caseId/assignments
 * Gap fix #3. SPEC-002 §21 defines CaseAssignment as an MVP entity and
 * FR-006 ("every active case shall have an accountable owner") / FR-007
 * ("cases shall be assignable to authorised case workers/organisations")
 * both depend on it, but SPEC-003 v0.2 never exposed it as an endpoint —
 * the only way a case moved from NEW to owned was implied, not specified.
 * Actors: CASE_WORKER, AUTHORITY, ADMIN (assignment is an internal
 * coordination action, never PUBLIC/FAMILY).
 */
router.post('/:caseId/assignments', async (req, res, next) => {
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
        if (!['CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(req.actor.actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl); // BR-013 shield
        }
        await client.query('BEGIN');
        const { organisationId, caseWorkerId, assignmentRole } = req.body;
        if (!assignmentRole) throw new ProblemError('INVALID_SCHEMA', 'assignmentRole is required', req.originalUrl);

        const assignment = await client.query(
            `INSERT INTO case_assignment (case_id, organisation_id, case_worker_id, assignment_role, assigned_by)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [req.params.caseId, organisationId || null, caseWorkerId || null, assignmentRole, req.actor.actorId],
        );

        if (assignmentRole === 'PRIMARY_OWNER') {
            await client.query(
                `UPDATE case_record SET case_owner_org_id = $1, version = version + 1 WHERE case_id = $2`,
                [organisationId, req.params.caseId],
            );
        }

        await writeAuditEvent(client, {
            actor: req.actor.actorId, organisation: organisationId, action: 'CASE_ASSIGNED',
            entityType: 'CaseAssignment', entityId: assignment.rows[0].assignment_id,
            newState: { assignmentRole }, outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.status(201).json({
            assignmentId: assignment.rows[0].assignment_id,
            caseId: req.params.caseId,
            assignmentRole,
            assignedAt: assignment.rows[0].assigned_at,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
