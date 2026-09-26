/**
 * SPEC-008 Module M4: Essential Services Coordination Service
 * Authoritative read/aggregate view of Water, Power, Health, Schools,
 * Sanitation, and Telecoms under named data-sharing agreements.
 */

const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');

const VALID_SERVICE_TYPES = [
    'DRINKING_WATER',
    'ELECTRICITY',
    'HEALTHCARE',
    'EDUCATION',
    'SANITATION',
    'TELECOMMUNICATIONS',
    'ROAD_ACCESS'
];

const VALID_STATUSES = [
    'OPERATIONAL',
    'PARTIALLY_OPERATIONAL',
    'DISRUPTED',
    'CRITICAL_OUTAGE',
    'RESTORATION_IN_PROGRESS',
    'UNKNOWN'
];

/**
 * Query essential services with optional filters
 */
async function listServices({ communityId, district, serviceType, status }) {
    let query = `
        SELECT 
            ess.service_id,
            ess.service_reference,
            ess.service_type,
            ess.community_id,
            cp.name as community_name,
            ess.district,
            ess.locality_name,
            ess.operational_status,
            ess.affected_population_estimate,
            ess.source_authority_id,
            ess.source_authority_name,
            ess.agreement_ref,
            dsa.authority_type,
            dsa.status as agreement_status,
            ess.verification_status,
            ess.verification_reference,
            ess.public_advisory,
            ess.restoration_task_id,
            ess.restoration_estimate,
            ess.last_reported_at,
            ess.last_verified_at,
            ess.created_at,
            ess.updated_at
        FROM essential_service_status ess
        LEFT JOIN community_profile cp ON ess.community_id = cp.community_id
        LEFT JOIN data_sharing_agreement dsa ON ess.agreement_ref = dsa.agreement_ref
        WHERE 1=1
    `;
    const params = [];

    if (communityId) {
        params.push(communityId);
        query += ` AND ess.community_id = $${params.length}`;
    }
    if (district) {
        params.push(district);
        query += ` AND LOWER(ess.district) = LOWER($${params.length})`;
    }
    if (serviceType && serviceType !== 'ALL') {
        params.push(serviceType);
        query += ` AND ess.service_type = $${params.length}`;
    }
    if (status && status !== 'ALL') {
        params.push(status);
        query += ` AND ess.operational_status = $${params.length}`;
    }

    query += ' ORDER BY ess.district ASC, ess.locality_name ASC, ess.service_type ASC';

    const result = await pool.query(query, params);
    return result.rows.map(formatServiceRow);
}

/**
 * Get services for a specific community locality
 */
async function getCommunityServices(communityId) {
    // Check if community exists
    const commRes = await pool.query(
        'SELECT community_id, name, admin_hierarchy, population_estimate, min_aggregation_threshold_met FROM community_profile WHERE community_id = $1',
        [communityId]
    );

    if (commRes.rows.length === 0) {
        throw new ProblemError('NOT_FOUND', `Community profile '${communityId}' not found.`);
    }

    const community = commRes.rows[0];
    const services = await listServices({ communityId });

    return {
        communityId: community.community_id,
        communityName: community.name,
        adminHierarchy: community.admin_hierarchy,
        populationEstimate: community.population_estimate,
        servicesCount: services.length,
        services
    };
}

/**
 * Ingest authoritative service status feed (FR-008-006)
 * Enforces data-sharing agreement validation (SPEC-008 §3 & §13)
 */
async function ingestAuthoritativeFeed({
    serviceReference,
    serviceType,
    communityId,
    district,
    localityName,
    operationalStatus,
    affectedPopulationEstimate,
    sourceAuthorityId,
    sourceAuthorityName,
    agreementRef,
    verificationReference,
    publicAdvisory,
    restorationEstimate,
    restorationTaskId,
    actor
}) {
    if (!serviceReference || !serviceType || !district || !localityName || !agreementRef || !sourceAuthorityName) {
        throw new ProblemError(
            'INVALID_SCHEMA',
            'serviceReference, serviceType, district, localityName, sourceAuthorityName, and agreementRef are required.'
        );
    }

    if (!VALID_SERVICE_TYPES.includes(serviceType)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid serviceType '${serviceType}'. Allowed: ${VALID_SERVICE_TYPES.join(', ')}`);
    }

    const statusToSet = operationalStatus || 'OPERATIONAL';
    if (!VALID_STATUSES.includes(statusToSet)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid operationalStatus '${statusToSet}'. Allowed: ${VALID_STATUSES.join(', ')}`);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify that named data-sharing agreement exists and is ACTIVE
        const agreeRes = await client.query(
            'SELECT agreement_ref, authority_name, service_domain, status FROM data_sharing_agreement WHERE agreement_ref = $1',
            [agreementRef]
        );

        if (agreeRes.rows.length === 0) {
            throw new ProblemError(
                'DISPUTED_ACCESS',
                `No data-sharing agreement found matching reference '${agreementRef}'. Under SPEC-008 §13, essential service status updates require a registered data-sharing agreement.`
            );
        }

        const agreement = agreeRes.rows[0];
        if (agreement.status !== 'ACTIVE') {
            throw new ProblemError(
                'DISPUTED_ACCESS',
                `Data-sharing agreement '${agreementRef}' is ${agreement.status}. Ingestion rejected.`
            );
        }

        // Domain compatibility check
        if (agreement.service_domain !== 'CROSS_SECTOR' && agreement.service_domain !== serviceType) {
            throw new ProblemError(
                'INVALID_SCHEMA',
                `Data-sharing agreement '${agreementRef}' covers '${agreement.service_domain}', but update is for '${serviceType}'.`
            );
        }

        // Upsert essential_service_status
        const upsertSql = `
            INSERT INTO essential_service_status (
                service_reference,
                service_type,
                community_id,
                district,
                locality_name,
                operational_status,
                affected_population_estimate,
                source_authority_id,
                source_authority_name,
                agreement_ref,
                verification_status,
                verification_reference,
                public_advisory,
                restoration_task_id,
                restoration_estimate,
                last_reported_at,
                last_verified_at,
                is_seed,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OFFICIAL_CONFIRMED', $11, $12, $13, $14, now(), now(), FALSE, now()
            )
            ON CONFLICT (service_reference) DO UPDATE SET
                service_type = EXCLUDED.service_type,
                community_id = COALESCE(EXCLUDED.community_id, essential_service_status.community_id),
                district = EXCLUDED.district,
                locality_name = EXCLUDED.locality_name,
                operational_status = EXCLUDED.operational_status,
                affected_population_estimate = EXCLUDED.affected_population_estimate,
                source_authority_id = COALESCE(EXCLUDED.source_authority_id, essential_service_status.source_authority_id),
                source_authority_name = EXCLUDED.source_authority_name,
                agreement_ref = EXCLUDED.agreement_ref,
                verification_status = 'OFFICIAL_CONFIRMED',
                verification_reference = EXCLUDED.verification_reference,
                public_advisory = EXCLUDED.public_advisory,
                restoration_task_id = COALESCE(EXCLUDED.restoration_task_id, essential_service_status.restoration_task_id),
                restoration_estimate = EXCLUDED.restoration_estimate,
                last_reported_at = now(),
                last_verified_at = now(),
                updated_at = now()
            RETURNING *
        `;

        const result = await client.query(upsertSql, [
            serviceReference,
            serviceType,
            communityId || null,
            district,
            localityName,
            statusToSet,
            affectedPopulationEstimate || 0,
            sourceAuthorityId || null,
            sourceAuthorityName,
            agreementRef,
            verificationReference || null,
            publicAdvisory || null,
            restorationTaskId || null,
            restorationEstimate || null
        ]);

        const savedService = result.rows[0];

        // Record in outage/update provenance log
        await client.query(`
            INSERT INTO service_outage_report (
                service_id,
                service_type,
                community_id,
                district,
                operational_status,
                reported_by_authority,
                reported_by_actor_id,
                agreement_ref,
                outage_description,
                affected_population,
                estimated_restoration,
                is_seed
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE)
        `, [
            savedService.service_id,
            serviceType,
            communityId || null,
            district,
            statusToSet,
            sourceAuthorityName,
            actor?.actorId || 'SYSTEM_FEED',
            agreementRef,
            publicAdvisory || `Status update: ${statusToSet}`,
            affectedPopulationEstimate || 0,
            restorationEstimate || null
        ]);

        // Audit log
        await writeAuditEvent(client, {
            actor: actor?.actorId || 'AUTHORITY_FEED',
            organisation: actor?.organisation || sourceAuthorityName,
            action: 'ESSENTIAL_SERVICE_STATUS_INGESTED',
            entityType: 'essential_service_status',
            entityId: savedService.service_id,
            previousState: null,
            newState: {
                serviceReference,
                serviceType,
                operationalStatus: statusToSet,
                agreementRef
            },
            accessReason: 'Authoritative feed ingestion per data sharing agreement',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return formatServiceRow(savedService);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Authority verification of an existing service status (IAL-2 gated)
 */
async function verifyServiceStatus({
    serviceId,
    operationalStatus,
    publicAdvisory,
    restorationEstimate,
    verificationReference,
    actor
}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existingRes = await client.query(
            'SELECT * FROM essential_service_status WHERE service_id = $1',
            [serviceId]
        );

        if (existingRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', `Essential service record '${serviceId}' not found.`);
        }

        const existing = existingRes.rows[0];
        const newStatus = operationalStatus || existing.operational_status;
        if (!VALID_STATUSES.includes(newStatus)) {
            throw new ProblemError('INVALID_SCHEMA', `Invalid operationalStatus '${newStatus}'. Allowed: ${VALID_STATUSES.join(', ')}`);
        }

        const updateRes = await client.query(`
            UPDATE essential_service_status
            SET 
                operational_status = $1,
                public_advisory = COALESCE($2, public_advisory),
                restoration_estimate = COALESCE($3, restoration_estimate),
                verification_reference = COALESCE($4, verification_reference),
                verification_status = 'OFFICIAL_CONFIRMED',
                last_verified_at = now(),
                updated_at = now()
            WHERE service_id = $5
            RETURNING *
        `, [
            newStatus,
            publicAdvisory || null,
            restorationEstimate || null,
            verificationReference || null,
            serviceId
        ]);

        const updated = updateRes.rows[0];

        await writeAuditEvent(client, {
            actor: actor?.actorId || 'AUTHORITY_VERIFIER',
            organisation: actor?.organisation || 'AUTHORITY',
            action: 'ESSENTIAL_SERVICE_STATUS_VERIFIED',
            entityType: 'essential_service_status',
            entityId: serviceId,
            previousState: {
                operationalStatus: existing.operational_status,
                verificationStatus: existing.verification_status
            },
            newState: {
                operationalStatus: newStatus,
                verificationStatus: 'OFFICIAL_CONFIRMED',
                verificationReference: updated.verification_reference
            },
            accessReason: 'Official authority verification',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return formatServiceRow(updated);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * List registered data-sharing agreements
 */
async function listDataSharingAgreements({ status, serviceDomain }) {
    let query = 'SELECT * FROM data_sharing_agreement WHERE 1=1';
    const params = [];

    if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
    }
    if (serviceDomain) {
        params.push(serviceDomain);
        query += ` AND (service_domain = $${params.length} OR service_domain = 'CROSS_SECTOR')`;
    }

    query += ' ORDER BY legal_signoff_date DESC';
    const result = await pool.query(query, params);
    return result.rows.map(r => ({
        agreementId: r.agreement_id,
        agreementRef: r.agreement_ref,
        authorityName: r.authority_name,
        authorityType: r.authority_type,
        serviceDomain: r.service_domain,
        jurisdiction: r.jurisdiction,
        status: r.status,
        scopeDescription: r.scope_description,
        signatoryTitle: r.signatory_title,
        legalSignoffDate: r.legal_signoff_date,
        expiresAt: r.expires_at,
        createdAt: r.created_at
    }));
}

function formatServiceRow(r) {
    return {
        serviceId: r.service_id,
        serviceReference: r.service_reference,
        serviceType: r.service_type,
        communityId: r.community_id,
        communityName: r.community_name || null,
        district: r.district,
        localityName: r.locality_name,
        operationalStatus: r.operational_status,
        affectedPopulationEstimate: r.affected_population_estimate,
        sourceAuthorityId: r.source_authority_id,
        sourceAuthorityName: r.source_authority_name,
        agreementRef: r.agreement_ref,
        authorityType: r.authority_type,
        verificationStatus: r.verification_status,
        verificationReference: r.verification_reference,
        publicAdvisory: r.public_advisory,
        restorationTaskId: r.restoration_task_id,
        restorationEstimate: r.restoration_estimate,
        lastReportedAt: r.last_reported_at,
        lastVerifiedAt: r.last_verified_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    };
}

module.exports = {
    listServices,
    getCommunityServices,
    ingestAuthoritativeFeed,
    verifyServiceStatus,
    listDataSharingAgreements,
    VALID_SERVICE_TYPES,
    VALID_STATUSES
};
