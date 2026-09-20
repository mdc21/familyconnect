const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireActor } = require('../../middleware/actor');
const { getGuidanceForProcess, getAllTemplates } = require('../../services/documentation/legalGuidance');

const router = express.Router({ mergeParams: true });

const ALLOWED_STATUSES = [
    'NOT_STARTED',
    'GUIDANCE_PROVIDED',
    'DOCUMENTS_GATHERED',
    'SUBMITTED_TO_AUTHORITY',
    'UNDER_REVIEW',
    'ISSUED',
    'REJECTED'
];

/**
 * Helper to ensure family exists and check actor authorization
 */
async function verifyFamilyAccess(familyUnitId, req) {
    const famRes = await pool.query('SELECT * FROM family_unit WHERE family_unit_id = $1', [familyUnitId]);
    if (famRes.rows.length === 0) {
        return null;
    }
    const family = famRes.rows[0];

    // Actor validation: FAMILY, CASE_WORKER, AUTHORITY, ADMIN
    const actorClass = req.actor?.actorClass;
    if (!['FAMILY', 'CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(actorClass)) {
        return false; // Forbidden / shielded
    }

    return family;
}

/**
 * GET /api/v1/families/:familyId/documentation
 * Retrieves active documentation processes for the family.
 * If none exist, initializes default templates (e.g. Nepali Death Certificate and Citizenship Restoration).
 */
router.get('/:familyId/documentation', async (req, res, next) => {
    try {
        const familyUnitId = req.params.familyId;
        const family = await verifyFamilyAccess(familyUnitId, req);
        
        if (family === null) {
            return next(new ProblemError('NOT_FOUND', 'Family unit not found.', req.originalUrl));
        }
        if (family === false) {
            // Shielded from unauthorized actors per SPEC-004
            return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
        }

        let docRes = await pool.query(
            'SELECT * FROM documentation_process WHERE family_unit_id = $1 ORDER BY created_at ASC',
            [familyUnitId]
        );

        // If no processes exist yet, initialize standard templates for disaster recovery guidance
        if (docRes.rows.length === 0) {
            const templates = getAllTemplates();
            for (const tpl of templates) {
                await pool.query(
                    `INSERT INTO documentation_process 
                     (family_unit_id, process_type, authority_name, status, guidance_text, required_documents)
                     VALUES ($1, $2, $3, 'GUIDANCE_PROVIDED', $4, $5)`,
                    [
                        familyUnitId,
                        tpl.processType,
                        tpl.authorityName,
                        `${tpl.title}\n${tpl.statutoryBasis}\n\n${tpl.statutoryDisclaimer}\n\nStandard Timeline: ${tpl.standardTimeline}\n\nDisaster Procedure: ${tpl.disasterSpecialProcedure}`,
                        JSON.stringify(tpl.requiredDocuments)
                    ]
                );
            }

            docRes = await pool.query(
                'SELECT * FROM documentation_process WHERE family_unit_id = $1 ORDER BY created_at ASC',
                [familyUnitId]
            );
        }

        res.json({
            familyUnitId,
            processes: docRes.rows.map(row => ({
                processId: row.process_id,
                processType: row.process_type,
                authorityName: row.authority_name,
                status: row.status,
                guidanceText: row.guidance_text,
                requiredDocuments: row.required_documents,
                trackingReference: row.tracking_reference,
                notes: row.notes,
                submittedDate: row.submitted_date,
                issuedDate: row.issued_date,
                updatedAt: row.updated_at
            }))
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/families/:familyId/documentation/:type/status
 * Updates status, tracking reference, or notes for a documentation process.
 * Emits audit log event.
 */
router.post('/:familyId/documentation/:type/status', async (req, res, next) => {
    const client = await pool.connect();
    try {
        const familyUnitId = req.params.familyId;
        const processType = req.params.type.toUpperCase();
        const family = await verifyFamilyAccess(familyUnitId, req);

        if (family === null) {
            return next(new ProblemError('NOT_FOUND', 'Family unit not found.', req.originalUrl));
        }
        if (family === false) {
            return next(new ProblemError('NOT_FOUND', 'Not found', req.originalUrl));
        }

        const { status, trackingReference, notes, submittedDate, issuedDate } = req.body || {};

        if (!status || !ALLOWED_STATUSES.includes(status)) {
            return next(new ProblemError(
                'INVALID_SCHEMA', 
                `status is required and must be one of: ${ALLOWED_STATUSES.join(', ')}`, 
                req.originalUrl
            ));
        }

        await client.query('BEGIN');

        // Check if process row already exists
        const existingRes = await client.query(
            'SELECT * FROM documentation_process WHERE family_unit_id = $1 AND UPPER(process_type) = $2 FOR UPDATE',
            [familyUnitId, processType]
        );

        let updatedRow;
        let previousStatus = null;

        if (existingRes.rows.length === 0) {
            // Initialize from guidance template
            const tpl = getGuidanceForProcess(processType);
            const guidanceText = tpl 
                ? `${tpl.title}\n${tpl.statutoryBasis}\n\n${tpl.statutoryDisclaimer}\n\nStandard Timeline: ${tpl.standardTimeline}\n\nDisaster Procedure: ${tpl.disasterSpecialProcedure}`
                : 'Documentation guidance and status tracking.';
            const authorityName = tpl ? tpl.authorityName : 'Competent Government Authority';
            const reqDocs = tpl ? JSON.stringify(tpl.requiredDocuments) : '[]';

            const insertRes = await client.query(
                `INSERT INTO documentation_process
                 (family_unit_id, process_type, authority_name, status, guidance_text, required_documents, tracking_reference, notes, submitted_date, issued_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [
                    familyUnitId,
                    processType,
                    authorityName,
                    status,
                    guidanceText,
                    reqDocs,
                    trackingReference || null,
                    notes || null,
                    submittedDate || null,
                    issuedDate || null
                ]
            );
            updatedRow = insertRes.rows[0];
        } else {
            const current = existingRes.rows[0];
            previousStatus = current.status;

            const updateRes = await client.query(
                `UPDATE documentation_process
                 SET status = $1,
                     tracking_reference = COALESCE($2, tracking_reference),
                     notes = COALESCE($3, notes),
                     submitted_date = COALESCE($4, submitted_date),
                     issued_date = COALESCE($5, issued_date),
                     updated_at = now()
                 WHERE process_id = $6
                 RETURNING *`,
                [
                    status,
                    trackingReference || null,
                    notes || null,
                    submittedDate || null,
                    issuedDate || null,
                    current.process_id
                ]
            );
            updatedRow = updateRes.rows[0];
        }

        // Audit event per SPEC-008 §6 (FR-008-016)
        await writeAuditEvent(client, {
            actor: req.actor.actorId || req.actor.actorClass,
            organisation: req.actor.organisationId || 'DOCUMENTATION_DESK',
            action: `DOCUMENTATION_PROCESS_${status}`,
            entityType: 'DOCUMENTATION_PROCESS',
            entityId: updatedRow.process_id,
            previousState: { status: previousStatus },
            newState: { 
                status, 
                processType, 
                trackingReference: updatedRow.tracking_reference,
                notes: updatedRow.notes
            },
            accessReason: `Documentation status updated to ${status}`,
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.json({
            message: `Documentation process status updated to '${status}'.`,
            process: {
                processId: updatedRow.process_id,
                familyUnitId: updatedRow.family_unit_id,
                processType: updatedRow.process_type,
                authorityName: updatedRow.authority_name,
                status: updatedRow.status,
                guidanceText: updatedRow.guidance_text,
                trackingReference: updatedRow.tracking_reference,
                notes: updatedRow.notes,
                submittedDate: updatedRow.submitted_date,
                issuedDate: updatedRow.issued_date,
                updatedAt: updatedRow.updated_at
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
