const express = require('express');
const crypto = require('crypto');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');

const router = express.Router({ mergeParams: true });

function generateRecoveryCaseRef() {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `FC-REC-${randomHex}`;
}

/**
 * POST /api/v1/families/:familyId/recovery-case
 * Creates or updates a comprehensive Family Recovery Case (Module M2, FR-008-009).
 * Bridges emergency case_record, family_unit, and long-term recovery needs (ADR-001).
 */
router.post('/:familyId/recovery-case', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch (connectErr) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const familyUnitId = req.params.familyId;
        const actorClass = req.actor?.actorClass;

        // Strict RBAC: only FAMILY, CASE_WORKER, AUTHORITY, or ADMIN
        if (!['FAMILY', 'CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(actorClass)) {
            // Shielded per SPEC-004 §4
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }

        const famRes = await client.query('SELECT * FROM family_unit WHERE family_unit_id = $1', [familyUnitId]);
        if (famRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', 'Family unit not found.', req.originalUrl);
        }

        await client.query('BEGIN');

        // Check if an existing recovery case is already active
        const existingRes = await client.query(
            'SELECT * FROM family_recovery_case WHERE family_unit_id = $1 FOR UPDATE',
            [familyUnitId]
        );

        const {
            primaryCaseId,
            eventId,
            housingRecoveryStatus,
            educationStatus,
            livelihoodStatus,
            missingDeceasedSummary,
            goals,
            notes,
            leadOrganisationId
        } = req.body || {};

        let recoveryCase;

        if (existingRes.rows.length > 0) {
            // Update existing
            const current = existingRes.rows[0];
            const updateRes = await client.query(
                `UPDATE family_recovery_case
                 SET primary_case_id = COALESCE($1, primary_case_id),
                     event_id = COALESCE($2, event_id),
                     housing_recovery_status = COALESCE($3, housing_recovery_status),
                     education_status = COALESCE($4, education_status),
                     livelihood_status = COALESCE($5, livelihood_status),
                     missing_deceased_summary = COALESCE($6, missing_deceased_summary),
                     goals = COALESCE($7, goals),
                     notes = COALESCE($8, notes),
                     lead_organisation_id = COALESCE($9, lead_organisation_id),
                     updated_at = now()
                 WHERE recovery_case_id = $10
                 RETURNING *`,
                [
                    primaryCaseId || null,
                    eventId || null,
                    housingRecoveryStatus || null,
                    educationStatus || null,
                    livelihoodStatus || null,
                    missingDeceasedSummary ? JSON.stringify(missingDeceasedSummary) : null,
                    goals ? JSON.stringify(goals) : null,
                    notes || null,
                    leadOrganisationId || null,
                    current.recovery_case_id
                ]
            );
            recoveryCase = updateRes.rows[0];

            await writeAuditEvent(client, {
                actor: req.actor.actorId || req.actor.actorClass,
                organisation: req.actor.organisationId || 'RECOVERY_COORDINATION',
                action: 'FAMILY_RECOVERY_CASE_UPDATED',
                entityType: 'FAMILY_RECOVERY_CASE',
                entityId: recoveryCase.recovery_case_id,
                newState: { status: recoveryCase.status, housing: recoveryCase.housing_recovery_status },
                accessReason: 'Updated family recovery case goals/status',
                outcome: 'SUCCESS'
            });
        } else {
            // Create new recovery case
            const caseRef = generateRecoveryCaseRef();
            const insertRes = await client.query(
                `INSERT INTO family_recovery_case (
                    case_reference,
                    family_unit_id,
                    primary_case_id,
                    event_id,
                    status,
                    housing_recovery_status,
                    education_status,
                    livelihood_status,
                    missing_deceased_summary,
                    assigned_caseworker_id,
                    lead_organisation_id,
                    goals,
                    notes
                ) VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [
                    caseRef,
                    familyUnitId,
                    primaryCaseId || null,
                    eventId || 'EVENT-NP-TIBET-2026',
                    housingRecoveryStatus || 'ASSESSMENT_PENDING',
                    educationStatus || 'NOT_APPLICABLE',
                    livelihoodStatus || 'DISRUPTED',
                    JSON.stringify(missingDeceasedSummary || { missing_count: 0, deceased_count: 0 }),
                    req.actor.actorId || null,
                    leadOrganisationId || null,
                    JSON.stringify(goals || []),
                    notes || null
                ]
            );
            recoveryCase = insertRes.rows[0];

            await writeAuditEvent(client, {
                actor: req.actor.actorId || req.actor.actorClass,
                organisation: req.actor.organisationId || 'RECOVERY_COORDINATION',
                action: 'FAMILY_RECOVERY_CASE_CREATED',
                entityType: 'FAMILY_RECOVERY_CASE',
                entityId: recoveryCase.recovery_case_id,
                newState: { caseReference: caseRef, status: 'OPEN' },
                accessReason: 'Initialized long-term family recovery case journey',
                outcome: 'SUCCESS'
            });
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Family recovery case established.',
            recoveryCase: {
                recoveryCaseId: recoveryCase.recovery_case_id,
                caseReference: recoveryCase.case_reference,
                familyUnitId: recoveryCase.family_unit_id,
                primaryCaseId: recoveryCase.primary_case_id,
                eventId: recoveryCase.event_id,
                status: recoveryCase.status,
                housingRecoveryStatus: recoveryCase.housing_recovery_status,
                educationStatus: recoveryCase.education_status,
                livelihoodStatus: recoveryCase.livelihood_status,
                missingDeceasedSummary: recoveryCase.missing_deceased_summary,
                goals: recoveryCase.goals,
                notes: recoveryCase.notes,
                createdAt: recoveryCase.created_at,
                updatedAt: recoveryCase.updated_at
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/families/:familyId/recovery-case
 * Retrieves single family recovery journey overview (Module M2, FR-008-009).
 * Reconciled with existing case_record access-policy mechanism and dispute freezing.
 */
router.get('/:familyId/recovery-case', async (req, res, next) => {
    try {
        const familyUnitId = req.params.familyId;
        const actorClass = req.actor?.actorClass;

        if (!['FAMILY', 'CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(actorClass)) {
            throw new ProblemError('NOT_FOUND', 'Not found', req.originalUrl);
        }

        const caseRes = await pool.query(
            'SELECT * FROM family_recovery_case WHERE family_unit_id = $1',
            [familyUnitId]
        );

        if (caseRes.rows.length === 0) {
            return next(new ProblemError('NOT_FOUND', 'No family recovery case found for this family unit.', req.originalUrl));
        }

        const recoveryCase = caseRes.rows[0];

        // Access Policy Linking (SPEC-004 §9 / BR-017 / ADR-001):
        // If linked primary case_record is in RESTRICTED_PENDING_REVIEW, freeze disclosure to non-authority actors
        if (recoveryCase.primary_case_id) {
            const primaryCaseRes = await pool.query(
                'SELECT data_sharing_status, status FROM case_record WHERE case_id = $1',
                [recoveryCase.primary_case_id]
            );

            if (primaryCaseRes.rows.length > 0) {
                const pc = primaryCaseRes.rows[0];
                if (pc.data_sharing_status === 'RESTRICTED_PENDING_REVIEW' &&
                    !['CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(actorClass)) {
                    throw new ProblemError(
                        'DISPUTED_ACCESS', 
                        'Case data disclosure is temporarily frozen pending dispute resolution.', 
                        req.originalUrl
                    );
                }
            }
        }

        // Fetch linked documentation processes
        const docsRes = await pool.query(
            'SELECT process_type, status, authority_name, tracking_reference FROM documentation_process WHERE family_unit_id = $1',
            [familyUnitId]
        );

        // Fetch linked emergency assistance requests (ADR-001 reconciliation)
        let assistanceItems = [];
        if (recoveryCase.primary_case_id) {
            const assistRes = await pool.query(
                'SELECT assistance_request_id, requested_service, priority, status FROM assistance_request WHERE case_id = $1',
                [recoveryCase.primary_case_id]
            );
            assistanceItems = assistRes.rows;
        }

        res.json({
            recoveryCase: {
                recoveryCaseId: recoveryCase.recovery_case_id,
                caseReference: recoveryCase.case_reference,
                familyUnitId: recoveryCase.family_unit_id,
                primaryCaseId: recoveryCase.primary_case_id,
                eventId: recoveryCase.event_id,
                status: recoveryCase.status,
                housingRecoveryStatus: recoveryCase.housing_recovery_status,
                educationStatus: recoveryCase.education_status,
                livelihoodStatus: recoveryCase.livelihood_status,
                missingDeceasedSummary: recoveryCase.missing_deceased_summary,
                goals: recoveryCase.goals,
                notes: recoveryCase.notes,
                linkedDocumentation: docsRes.rows.map(d => ({
                    processType: d.process_type,
                    status: d.status,
                    authority: d.authority_name,
                    trackingReference: d.tracking_reference
                })),
                linkedAssistance: assistanceItems.map(a => ({
                    requestId: a.assistance_request_id,
                    requestedService: a.requested_service,
                    priority: a.priority,
                    status: a.status
                })),
                createdAt: recoveryCase.created_at,
                updatedAt: recoveryCase.updated_at
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
