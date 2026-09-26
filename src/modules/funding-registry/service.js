/**
 * SPEC-008 Module M9: Funding & Aid Coordination Ledger Service
 * Strictly non-custodial coordination ledger for pledges, project allocations,
 * and triangulated delivery evidence (Implementer + Authority + Monitor).
 */

const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');

const VALID_PLEDGE_TYPES = [
    'BILATERAL_GOVERNMENT',
    'MULTILATERAL_AGENCY',
    'INGO',
    'CORPORATE_FOUNDATION',
    'PRIVATE_PHILANTHROPY',
    'COMMUNITY_DIASPORA'
];

const VALID_SECTORS = [
    'DRINKING_WATER',
    'HOUSING_RECONSTRUCTION',
    'ELECTRICITY',
    'HEALTHCARE',
    'EDUCATION',
    'CRITICAL_INFRASTRUCTURE',
    'LIVELIHOODS',
    'CROSS_SECTOR_RECOVERY'
];

const VALID_CURRENCIES = ['NPR', 'USD', 'EUR', 'GBP', 'INR'];

const VALID_EVIDENCE_TYPES = [
    'COMPLETION_CERTIFICATE',
    'BANK_DEPOSIT_RECEIPT',
    'GPS_PHOTO_SURVEY',
    'LOCAL_WARD_ACKNOWLEDGMENT',
    'THIRD_PARTY_AUDIT_REPORT'
];

const VALID_ATTESTATION_TIERS = [
    'IMPLEMENTING_AGENCY',
    'LOCAL_GOVERNMENT_WARD',
    'INDEPENDENT_HUMANITARIAN_MONITOR'
];

/**
 * List funding pledges with privacy shielding (BR-008-013 / ANONYMOUS_PUBLIC)
 */
async function listPledges({ eventId, targetSector, status, isPrivileged }) {
    let query = `
        SELECT 
            fp.*,
            org.name as donor_org_name
        FROM funding_pledge fp
        LEFT JOIN organisation org ON fp.donor_org_id = org.organisation_id
        WHERE 1=1
    `;
    const params = [];

    if (!isPrivileged) {
        query += " AND fp.public_visibility != 'RESTRICTED_OFFICIAL'";
    }

    if (eventId) {
        params.push(eventId);
        query += ` AND fp.event_id = $${params.length}`;
    }
    if (targetSector && targetSector !== 'ALL') {
        params.push(targetSector);
        query += ` AND fp.target_sector = $${params.length}`;
    }
    if (status && status !== 'ALL') {
        params.push(status);
        query += ` AND fp.status = $${params.length}`;
    }

    query += ' ORDER BY fp.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map(r => formatPledgeRow(r, isPrivileged));
}

/**
 * Retrieve single pledge by ID with privacy protection
 */
async function getPledgeById(id, { isPrivileged }) {
    const query = `
        SELECT fp.*, org.name as donor_org_name
        FROM funding_pledge fp
        LEFT JOIN organisation org ON fp.donor_org_id = org.organisation_id
        WHERE fp.pledge_id::text = $1 OR fp.pledge_reference = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
        throw new ProblemError('NOT_FOUND', `Funding pledge '${id}' not found.`);
    }

    const pledge = result.rows[0];
    if (pledge.public_visibility === 'RESTRICTED_OFFICIAL' && !isPrivileged) {
        throw new ProblemError('NOT_FOUND', `Funding pledge '${id}' not found.`);
    }

    // Fetch linked allocations
    const allocRes = await pool.query(`
        SELECT 
            aa.*,
            rp.title as project_title,
            rp.project_reference,
            org.name as recipient_org_name
        FROM aid_allocation aa
        LEFT JOIN recovery_project rp ON aa.project_id = rp.project_id
        LEFT JOIN organisation org ON aa.recipient_org_id = org.organisation_id
        WHERE aa.pledge_id = $1
        ORDER BY aa.created_at DESC
    `, [pledge.pledge_id]);

    return {
        ...formatPledgeRow(pledge, isPrivileged),
        allocations: allocRes.rows.map(formatAllocationRow)
    };
}

/**
 * Register a new recovery funding pledge
 */
async function createPledge({
    eventId,
    donorName,
    donorOrgId,
    pledgeType,
    currency,
    amountDeclared,
    targetSector,
    targetLocality,
    agreementRef,
    ndrrmaTrackingNo,
    swcApprovalRef,
    publicVisibility,
    notes,
    actor
}) {
    if (!donorName || !pledgeType || !amountDeclared || !targetSector) {
        throw new ProblemError(
            'INVALID_SCHEMA',
            'donorName, pledgeType, amountDeclared, and targetSector are required.'
        );
    }

    if (!VALID_PLEDGE_TYPES.includes(pledgeType)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid pledgeType '${pledgeType}'. Allowed: ${VALID_PLEDGE_TYPES.join(', ')}`);
    }

    if (!VALID_SECTORS.includes(targetSector)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid targetSector '${targetSector}'. Allowed: ${VALID_SECTORS.join(', ')}`);
    }

    const curr = currency || 'NPR';
    if (!VALID_CURRENCIES.includes(curr)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid currency '${curr}'. Allowed: ${VALID_CURRENCIES.join(', ')}`);
    }

    const amount = parseFloat(amountDeclared);
    if (isNaN(amount) || amount <= 0) {
        throw new ProblemError('INVALID_SCHEMA', 'amountDeclared must be a positive numeric value.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // If institutional agreement is provided, verify it
        if (agreementRef) {
            const agreeRes = await client.query(
                'SELECT agreement_ref, status FROM data_sharing_agreement WHERE agreement_ref = $1',
                [agreementRef]
            );
            if (agreeRes.rows.length === 0 || agreeRes.rows[0].status !== 'ACTIVE') {
                throw new ProblemError('DISPUTED_ACCESS', `Data sharing agreement '${agreementRef}' is invalid or inactive.`);
            }
        }

        const pledgeRef = `PLG-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

        const insertSql = `
            INSERT INTO funding_pledge (
                pledge_reference,
                event_id,
                donor_name,
                donor_actor_id,
                donor_org_id,
                pledge_type,
                currency,
                amount_declared,
                amount_allocated,
                amount_disbursed,
                target_sector,
                target_locality,
                agreement_ref,
                ndrrma_tracking_no,
                swc_approval_ref,
                verification_status,
                status,
                public_visibility,
                notes,
                is_seed
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 0, 0, $9, $10, $11, $12, $13, $14, $15, $16, $17, FALSE
            ) RETURNING *
        `;

        const isInstitutional = ['BILATERAL_GOVERNMENT', 'MULTILATERAL_AGENCY', 'INGO'].includes(pledgeType);
        const initialStatus = isInstitutional ? 'COMMITTED' : 'ANNOUNCED';
        const initialVerification = (actor?.actorClass === 'AUTHORITY' || actor?.actorClass === 'ADMIN') ? 'OFFICIAL_CONFIRMED' : 'UNVERIFIED';

        const result = await client.query(insertSql, [
            pledgeRef,
            eventId || 'EVENT-NP-TIBET-2026',
            donorName,
            actor?.actorId || null,
            donorOrgId || null,
            pledgeType,
            curr,
            amount,
            targetSector,
            targetLocality ? JSON.stringify(targetLocality) : '{}',
            agreementRef || null,
            ndrrmaTrackingNo || null,
            swcApprovalRef || null,
            initialVerification,
            initialStatus,
            publicVisibility || 'PUBLIC',
            notes || null
        ]);

        const saved = result.rows[0];

        await writeAuditEvent(client, {
            actor: actor?.actorId || 'DONOR_REGISTRAR',
            organisation: actor?.organisation || donorName,
            action: 'FUNDING_PLEDGE_REGISTERED',
            entityType: 'funding_pledge',
            entityId: saved.pledge_id,
            previousState: null,
            newState: {
                pledgeReference: pledgeRef,
                amountDeclared: amount,
                currency: curr,
                targetSector
            },
            accessReason: 'Pledge registration under SPEC-008 Module M9',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return formatPledgeRow(saved, true);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Verify and confirm funding pledge (IAL-2 gated)
 */
async function verifyPledge({ pledgeId, ndrrmaTrackingNo, swcApprovalRef, notes, actor }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existingRes = await client.query(
            'SELECT * FROM funding_pledge WHERE pledge_id::text = $1 OR pledge_reference = $1',
            [pledgeId]
        );

        if (existingRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', `Funding pledge '${pledgeId}' not found.`);
        }

        const existing = existingRes.rows[0];

        const updateRes = await client.query(`
            UPDATE funding_pledge
            SET 
                verification_status = 'OFFICIAL_CONFIRMED',
                status = CASE WHEN status = 'ANNOUNCED' THEN 'COMMITTED' ELSE status END,
                ndrrma_tracking_no = COALESCE($1, ndrrma_tracking_no),
                swc_approval_ref = COALESCE($2, swc_approval_ref),
                verified_by = $3,
                verified_at = now(),
                notes = COALESCE($4, notes),
                updated_at = now()
            WHERE pledge_id = $5
            RETURNING *
        `, [
            ndrrmaTrackingNo || null,
            swcApprovalRef || null,
            actor?.actorId || 'AUTHORITY_AUDITOR',
            notes || null,
            existing.pledge_id
        ]);

        const updated = updateRes.rows[0];

        await writeAuditEvent(client, {
            actor: actor?.actorId || 'AUTHORITY_AUDITOR',
            organisation: actor?.organisation || 'AUTHORITY',
            action: 'FUNDING_PLEDGE_VERIFIED',
            entityType: 'funding_pledge',
            entityId: pledgeId,
            previousState: {
                verificationStatus: existing.verification_status,
                status: existing.status
            },
            newState: {
                verificationStatus: 'OFFICIAL_CONFIRMED',
                status: updated.status,
                ndrrmaTrackingNo: updated.ndrrma_tracking_no
            },
            accessReason: 'Official statutory verification under NDRRMA / SWC protocol',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return formatPledgeRow(updated, true);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Allocate verified pledge to a recovery project / task (Non-custodial ledger entry)
 */
async function createAllocation({
    pledgeId,
    projectId,
    taskId,
    recipientOrgId,
    allocatedAmount,
    currency,
    externalWireRef,
    notes,
    actor
}) {
    if (!pledgeId || !projectId || !allocatedAmount) {
        throw new ProblemError('INVALID_SCHEMA', 'pledgeId, projectId, and allocatedAmount are required.');
    }

    const amount = parseFloat(allocatedAmount);
    if (isNaN(amount) || amount <= 0) {
        throw new ProblemError('INVALID_SCHEMA', 'allocatedAmount must be a positive number.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch pledge
        const pledgeRes = await client.query(
            'SELECT * FROM funding_pledge WHERE pledge_id::text = $1 OR pledge_reference = $1',
            [pledgeId]
        );

        if (pledgeRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', `Funding pledge '${pledgeId}' not found.`);
        }

        const pledge = pledgeRes.rows[0];

        if (pledge.verification_status === 'UNVERIFIED' || pledge.verification_status === 'REJECTED') {
            throw new ProblemError(
                'DISPUTED_ACCESS',
                `Pledge '${pledge.pledge_reference}' must be officially verified before aid can be allocated.`
            );
        }

        const remaining = parseFloat(pledge.amount_declared) - parseFloat(pledge.amount_allocated);
        if (amount > remaining) {
            throw new ProblemError(
                'INVALID_SCHEMA',
                `Requested allocation of ${amount} exceeds remaining unallocated pledge balance of ${remaining} ${pledge.currency}.`
            );
        }

        // Verify project exists
        const projRes = await client.query(
            'SELECT project_id, title FROM recovery_project WHERE project_id::text = $1 OR project_reference = $1',
            [projectId]
        );

        if (projRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', `Recovery project '${projectId}' not found.`);
        }

        const actualProjectId = projRes.rows[0].project_id;
        const allocRef = `ALC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

        const insertSql = `
            INSERT INTO aid_allocation (
                allocation_reference,
                pledge_id,
                project_id,
                task_id,
                recipient_org_id,
                allocated_amount,
                disbursed_amount,
                currency,
                allocation_status,
                external_wire_ref,
                allocated_by_actor_id,
                notes,
                is_seed
            ) VALUES (
                $1, $2, $3, $4, $5, $6, 0.00, $7, 'COMMITTED', $8, $9, $10, FALSE
            ) RETURNING *
        `;

        const allocResult = await client.query(insertSql, [
            allocRef,
            pledge.pledge_id,
            actualProjectId,
            taskId || null,
            recipientOrgId || null,
            amount,
            currency || pledge.currency,
            externalWireRef || null,
            actor?.actorId || 'COORDINATOR',
            notes || null
        ]);

        const savedAlloc = allocResult.rows[0];

        // Update pledge allocated balance
        await client.query(`
            UPDATE funding_pledge
            SET 
                amount_allocated = amount_allocated + $1,
                status = 'ALLOCATED',
                updated_at = now()
            WHERE pledge_id = $2
        `, [amount, pledge.pledge_id]);

        await writeAuditEvent(client, {
            actor: actor?.actorId || 'AID_COORDINATOR',
            organisation: actor?.organisation || 'COORDINATION_DESK',
            action: 'AID_ALLOCATION_CREATED',
            entityType: 'aid_allocation',
            entityId: savedAlloc.allocation_id,
            previousState: null,
            newState: {
                allocationReference: allocRef,
                pledgeReference: pledge.pledge_reference,
                projectId: actualProjectId,
                allocatedAmount: amount
            },
            accessReason: 'Non-custodial aid allocation to verified recovery project',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return formatAllocationRow(savedAlloc);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Record triangulated proof-of-delivery evidence (Implementer + Authority + Monitor)
 */
async function recordDeliveryEvidence({
    allocationId,
    evidenceType,
    attestationTier,
    attestingOrganisation,
    evidenceUrl,
    notes,
    disbursedAmountUpdate,
    actor
}) {
    if (!allocationId || !evidenceType || !attestationTier || !attestingOrganisation) {
        throw new ProblemError(
            'INVALID_SCHEMA',
            'allocationId, evidenceType, attestationTier, and attestingOrganisation are required.'
        );
    }

    if (!VALID_EVIDENCE_TYPES.includes(evidenceType)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid evidenceType '${evidenceType}'. Allowed: ${VALID_EVIDENCE_TYPES.join(', ')}`);
    }

    if (!VALID_ATTESTATION_TIERS.includes(attestationTier)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid attestationTier '${attestationTier}'. Allowed: ${VALID_ATTESTATION_TIERS.join(', ')}`);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const allocRes = await client.query(
            'SELECT * FROM aid_allocation WHERE allocation_id::text = $1 OR allocation_reference = $1',
            [allocationId]
        );

        if (allocRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', `Aid allocation '${allocationId}' not found.`);
        }

        const allocation = allocRes.rows[0];

        // Insert evidence record
        const evSql = `
            INSERT INTO aid_delivery_evidence (
                allocation_id,
                evidence_type,
                attestation_tier,
                attesting_actor_id,
                attesting_organisation,
                evidence_url,
                notes,
                is_seed
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
            RETURNING *
        `;

        const evResult = await client.query(evSql, [
            allocation.allocation_id,
            evidenceType,
            attestationTier,
            actor?.actorId || 'FIELD_ATTESTOR',
            attestingOrganisation,
            evidenceUrl || null,
            notes || null
        ]);

        const savedEv = evResult.rows[0];

        // Update disbursed amount if indicated
        if (disbursedAmountUpdate && parseFloat(disbursedAmountUpdate) > 0) {
            const disb = parseFloat(disbursedAmountUpdate);
            await client.query(`
                UPDATE aid_allocation
                SET 
                    disbursed_amount = LEAST(allocated_amount, disbursed_amount + $1),
                    allocation_status = CASE 
                        WHEN disbursed_amount + $1 >= allocated_amount THEN 'RECONCILED' 
                        ELSE 'TRANSFERRED' 
                    END,
                    updated_at = now()
                WHERE allocation_id = $2
            `, [disb, allocationId]);

            await client.query(`
                UPDATE funding_pledge
                SET 
                    amount_disbursed = LEAST(amount_declared, amount_disbursed + $1),
                    status = CASE 
                        WHEN amount_disbursed + $1 >= amount_declared THEN 'RECONCILED' 
                        ELSE status 
                    END,
                    updated_at = now()
                WHERE pledge_id = $2
            `, [disb, allocation.pledge_id]);
        }

        // Check attestation tiers present
        const tiersRes = await client.query(`
            SELECT DISTINCT attestation_tier 
            FROM aid_delivery_evidence 
            WHERE allocation_id = $1
        `, [allocationId]);

        const distinctTiers = tiersRes.rows.map(r => r.attestation_tier);

        await writeAuditEvent(client, {
            actor: actor?.actorId || 'ATTESTOR',
            organisation: attestingOrganisation,
            action: 'AID_DELIVERY_EVIDENCE_RECORDED',
            entityType: 'aid_delivery_evidence',
            entityId: savedEv.evidence_id,
            previousState: null,
            newState: {
                allocationId,
                evidenceType,
                attestationTier,
                distinctTiersCount: distinctTiers.length
            },
            accessReason: 'Multi-party triangulated delivery attestation',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return {
            evidence: savedEv,
            attestationSummary: {
                totalAttestations: tiersRes.rows.length,
                distinctTiers,
                isTriangulated: distinctTiers.length >= 2
            }
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Public Aid Transparency Breakdown (BR-008-013 aligned)
 */
async function getTransparencySummary({ eventId }) {
    const event = eventId || 'EVENT-NP-TIBET-2026';

    const sectorRes = await pool.query(`
        SELECT 
            target_sector,
            COUNT(*) as pledges_count,
            SUM(amount_declared) as total_declared,
            SUM(amount_allocated) as total_allocated,
            SUM(amount_disbursed) as total_disbursed,
            currency
        FROM funding_pledge
        WHERE event_id = $1 AND verification_status = 'OFFICIAL_CONFIRMED'
        GROUP BY target_sector, currency
        ORDER BY total_declared DESC
    `, [event]);

    const totalsRes = await pool.query(`
        SELECT 
            COUNT(*) as total_pledges,
            SUM(CASE WHEN currency = 'USD' THEN amount_declared * 133.5 ELSE amount_declared END) as total_estimated_npr_declared,
            SUM(CASE WHEN currency = 'USD' THEN amount_allocated * 133.5 ELSE amount_allocated END) as total_estimated_npr_allocated,
            SUM(CASE WHEN currency = 'USD' THEN amount_disbursed * 133.5 ELSE amount_disbursed END) as total_estimated_npr_disbursed
        FROM funding_pledge
        WHERE event_id = $1 AND verification_status = 'OFFICIAL_CONFIRMED'
    `, [event]);

    return {
        eventId: event,
        totals: totalsRes.rows[0] || {},
        sectors: sectorRes.rows.map(r => ({
            sector: r.target_sector,
            pledgesCount: parseInt(r.pledges_count, 10),
            totalDeclared: parseFloat(r.total_declared),
            totalAllocated: parseFloat(r.total_allocated),
            totalDisbursed: parseFloat(r.total_disbursed),
            currency: r.currency
        }))
    };
}

function formatPledgeRow(r, isPrivileged) {
    const isAnonymous = r.public_visibility === 'ANONYMOUS_PUBLIC' && !isPrivileged;

    return {
        pledgeId: r.pledge_id,
        pledgeReference: r.pledge_reference,
        eventId: r.event_id,
        donorName: isAnonymous ? 'Anonymous Philanthropic Donor' : r.donor_name,
        donorOrgId: isAnonymous ? null : r.donor_org_id,
        donorOrgName: isAnonymous ? null : r.donor_org_name,
        pledgeType: r.pledge_type,
        currency: r.currency,
        amountDeclared: parseFloat(r.amount_declared),
        amountAllocated: parseFloat(r.amount_allocated),
        amountDisbursed: parseFloat(r.amount_disbursed),
        targetSector: r.target_sector,
        targetLocality: r.target_locality,
        agreementRef: r.agreement_ref,
        ndrrmaTrackingNo: r.ndrrma_tracking_no,
        swcApprovalRef: r.swc_approval_ref,
        verificationStatus: r.verification_status,
        status: r.status,
        publicVisibility: r.public_visibility,
        notes: isAnonymous ? null : r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    };
}

function formatAllocationRow(r) {
    return {
        allocationId: r.allocation_id,
        allocationReference: r.allocation_reference,
        pledgeId: r.pledge_id,
        projectId: r.project_id,
        projectTitle: r.project_title || null,
        projectReference: r.project_reference || null,
        taskId: r.task_id,
        recipientOrgId: r.recipient_org_id,
        recipientOrgName: r.recipient_org_name || null,
        allocatedAmount: parseFloat(r.allocated_amount),
        disbursedAmount: parseFloat(r.disbursed_amount),
        currency: r.currency,
        allocationStatus: r.allocation_status,
        externalWireRef: r.external_wire_ref,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    };
}

module.exports = {
    listPledges,
    getPledgeById,
    createPledge,
    verifyPledge,
    createAllocation,
    recordDeliveryEvidence,
    getTransparencySummary,
    VALID_PLEDGE_TYPES,
    VALID_SECTORS,
    VALID_CURRENCIES,
    VALID_EVIDENCE_TYPES,
    VALID_ATTESTATION_TIERS
};
