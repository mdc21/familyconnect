const express = require('express');
const crypto = require('crypto');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');

const router = express.Router();

function generateProjectReference() {
    const hex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `FC-PROJ-${hex}`;
}

const ALLOWED_PROJECT_STATUSES = [
    'PROPOSED',
    'HUMAN_APPROVED',
    'PLANNED',
    'RESOURCE_CONFIRMED',
    'IN_PROGRESS',
    'FIELD_VERIFICATION',
    'COMPLETED',
    'ACCEPTED',
    'ARCHIVED'
];

/**
 * POST /api/v1/recovery-projects
 * Module M8 — Create a recovery project (SPEC-008 §8 & §5.2).
 * Strictly requires AUTHORITY or ADMIN actor class.
 */
router.post('/', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const actorClass = req.actor?.actorClass;
        if (!['AUTHORITY', 'ADMIN'].includes(actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }

        const {
            title,
            objective,
            scope,
            eventId,
            communityId,
            leadOrganisationId,
            budgetRef,
            budgetAmount,
            dependencies,
            milestones,
            verificationMethod,
            evidence,
            status = 'PROPOSED',
            visibility = 'PUBLIC'
        } = req.body || {};

        if (!title || !objective) {
            throw new ProblemError('INVALID_SCHEMA', 'title and objective are required.', req.originalUrl);
        }

        if (!ALLOWED_PROJECT_STATUSES.includes(status)) {
            throw new ProblemError('INVALID_SCHEMA', `status must be one of: ${ALLOWED_PROJECT_STATUSES.join(', ')}`, req.originalUrl);
        }

        await client.query('BEGIN');

        const projectRef = generateProjectReference();

        const insertRes = await client.query(
            `INSERT INTO recovery_project (
                project_reference, event_id, community_id, title,
                objective, scope, lead_organisation_id, budget_ref,
                budget_amount, dependencies, milestones, verification_method,
                evidence, status, visibility
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [
                projectRef,
                eventId || 'EVENT-NP-TIBET-2026',
                communityId || null,
                title,
                objective,
                scope || null,
                leadOrganisationId || null,
                budgetRef || null,
                budgetAmount || null,
                JSON.stringify(dependencies || []),
                JSON.stringify(milestones || []),
                verificationMethod || null,
                JSON.stringify(evidence || []),
                status,
                visibility
            ]
        );

        const project = insertRes.rows[0];

        await writeAuditEvent(client, {
            actor: req.actor.actorId || req.actor.actorClass,
            organisation: leadOrganisationId || 'AUTHORITY',
            action: 'RECOVERY_PROJECT_CREATED',
            entityType: 'RECOVERY_PROJECT',
            entityId: project.project_id,
            newState: { projectReference: projectRef, title, status },
            accessReason: 'Authority initialized recovery and reconstruction project',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Recovery project created successfully.',
            project: {
                projectId: project.project_id,
                projectReference: project.project_reference,
                title: project.title,
                objective: project.objective,
                scope: project.scope,
                status: project.status,
                communityId: project.community_id,
                leadOrganisationId: project.lead_organisation_id,
                budgetRef: project.budget_ref,
                budgetAmount: project.budget_amount,
                milestones: project.milestones,
                evidence: project.evidence,
                createdAt: project.created_at
            }
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/recovery-projects
 * Module M8 — Public Project Transparency API (FR-008-013).
 * Public users see non-sensitive project status, responsible organisations,
 * milestones, and completion evidence. Financial internal budgets are masked.
 */
router.get('/', async (req, res, next) => {
    try {
        const actorClass = req.actor?.actorClass;
        const isPrivileged = ['AUTHORITY', 'ADMIN'].includes(actorClass);
        const { eventId, communityId, status } = req.query;

        let query = `
            SELECT p.project_id, p.project_reference, p.event_id, p.community_id,
                   p.title, p.objective, p.scope, p.status, p.visibility,
                   p.milestones, p.verification_method, p.evidence, p.created_at,
                   p.budget_ref, p.budget_amount,
                   o.name as lead_organisation_name
            FROM recovery_project p
            LEFT JOIN organisation o ON p.lead_organisation_id = o.organisation_id
            WHERE 1=1
        `;
        const params = [];

        if (!isPrivileged) {
            query += " AND p.visibility = 'PUBLIC'";
        }
        if (eventId) {
            params.push(eventId);
            query += ` AND p.event_id = $${params.length}`;
        }
        if (communityId) {
            params.push(communityId);
            query += ` AND p.community_id = $${params.length}`;
        }
        if (status) {
            params.push(status);
            query += ` AND p.status = $${params.length}`;
        }

        query += ' ORDER BY p.created_at DESC LIMIT 50';

        const result = await pool.query(query, params);

        res.json({
            projects: result.rows.map(row => {
                const item = {
                    projectId: row.project_id,
                    projectReference: row.project_reference,
                    eventId: row.event_id,
                    communityId: row.community_id,
                    title: row.title,
                    objective: row.objective,
                    scope: row.scope,
                    status: row.status,
                    leadOrganisationName: row.lead_organisation_name || 'Designated Lead Agency',
                    milestones: row.milestones,
                    verificationMethod: row.verification_method,
                    evidence: row.evidence,
                    createdAt: row.created_at
                };

                // Transparency policy: Only privileged actors see raw budget numbers
                if (isPrivileged) {
                    item.budgetRef = row.budget_ref;
                    item.budgetAmount = row.budget_amount;
                }

                return item;
            })
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/recovery-projects/:id
 * Module M8 — Detailed project view including linked recovery tasks.
 */
router.get('/:id', async (req, res, next) => {
    try {
        const actorClass = req.actor?.actorClass;
        const isPrivileged = ['AUTHORITY', 'ADMIN'].includes(actorClass);
        const projectId = req.params.id;

        const projRes = await pool.query(
            `SELECT p.*, o.name as lead_organisation_name
             FROM recovery_project p
             LEFT JOIN organisation o ON p.lead_organisation_id = o.organisation_id
             WHERE p.project_id::text = $1 OR p.project_reference = $1`,
            [projectId]
        );

        if (projRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', 'Recovery project not found.', req.originalUrl);
        }

        const p = projRes.rows[0];

        // Tasks query
        const tasksRes = await pool.query(
            `SELECT t.*, o.name as implementer_name
             FROM recovery_task t
             LEFT JOIN organisation o ON t.implementer_org_id = o.organisation_id
             WHERE t.project_id = $1
             ORDER BY t.created_at ASC`,
            [p.project_id]
        );

        const project = {
            projectId: p.project_id,
            projectReference: p.project_reference,
            eventId: p.event_id,
            communityId: p.community_id,
            title: p.title,
            objective: p.objective,
            scope: p.scope,
            status: p.status,
            leadOrganisationName: p.lead_organisation_name,
            milestones: p.milestones,
            verificationMethod: p.verification_method,
            evidence: p.evidence,
            tasks: tasksRes.rows.map(t => ({
                taskId: t.task_id,
                taskType: t.task_type,
                title: t.title,
                description: t.description,
                authorityName: t.authority_name,
                implementerName: t.implementer_name,
                status: t.status,
                targetDate: t.target_date,
                completedAt: t.completed_at
            })),
            createdAt: p.created_at
        };

        if (isPrivileged) {
            project.budgetRef = p.budget_ref;
            project.budgetAmount = p.budget_amount;
        }

        res.json({ project });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/recovery-projects/:id/tasks
 * Module M8 — Add a recovery task to a project (SPEC-008 §8).
 * Actors: AUTHORITY, CASE_WORKER, ADMIN.
 */
router.post('/:id/tasks', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const actorClass = req.actor?.actorClass;
        if (!['AUTHORITY', 'CASE_WORKER', 'ADMIN'].includes(actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }

        const projectId = req.params.id;
        const {
            taskType,
            title,
            description,
            authorityName,
            implementerOrgId,
            assignedTo,
            needId,
            targetDate
        } = req.body || {};

        if (!taskType || !title) {
            throw new ProblemError('INVALID_SCHEMA', 'taskType and title are required.', req.originalUrl);
        }

        await client.query('BEGIN');

        const projRes = await client.query('SELECT project_id FROM recovery_project WHERE project_id::text = $1', [projectId]);
        if (projRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', 'Parent recovery project not found.', req.originalUrl);
        }

        const insertRes = await client.query(
            `INSERT INTO recovery_task (
                project_id, need_id, task_type, title,
                description, authority_name, implementer_org_id,
                assigned_to, status, target_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PLANNED', $9)
            RETURNING *`,
            [
                projectId,
                needId || null,
                taskType,
                title,
                description || null,
                authorityName || null,
                implementerOrgId || null,
                assignedTo || null,
                targetDate || null
            ]
        );

        const task = insertRes.rows[0];

        await writeAuditEvent(client, {
            actor: req.actor.actorId || req.actor.actorClass,
            organisation: req.actor.organisationId || 'PROJECT_COORDINATION',
            action: 'RECOVERY_TASK_CREATED',
            entityType: 'RECOVERY_TASK',
            entityId: task.task_id,
            newState: { projectId, taskType, title, status: 'PLANNED' },
            accessReason: 'Added recovery operational task to project',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Recovery task registered.',
            task: {
                taskId: task.task_id,
                projectId: task.project_id,
                needId: task.need_id,
                taskType: task.task_type,
                title: task.title,
                status: task.status,
                targetDate: task.target_date
            }
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
