/**
 * SPEC-008 Module M5: Critical Infrastructure Tracking Service
 * Governed read/aggregate view over authoritative government sources (DoR, DoLI, Army Engineering).
 * The platform coordinates and exposes verified status; it never originates independent status.
 */

const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');

const VALID_INFRA_TYPES = [
    'NATIONAL_HIGHWAY',
    'FEEDER_ROAD',
    'PERMANENT_BRIDGE',
    'BAILEY_BRIDGE',
    'DEBRIS_CLEARANCE_ZONE',
    'RIVER_EMBANKMENT',
    'HYDROPOWER_ACCESS_ROAD'
];

const VALID_STATUSES = [
    'PASSABLE_ALL_VEHICLES',
    'PASSABLE_LIGHT_4X4_ONLY',
    'EMERGENCY_SERVICES_ONLY',
    'RESTRICTED_TIMED_CONVOY',
    'BLOCKED_LANDSLIDE',
    'BAILEY_BRIDGE_UNDER_CONSTRUCTION',
    'WASHED_OUT_CLOSED'
];

/**
 * List critical infrastructure assets with multi-parameter filtering
 */
async function listInfrastructure({ district, infraType, operationalStatus, routeCode, vehicleType }) {
    let query = `
        SELECT 
            inf.infra_id,
            inf.infra_reference,
            inf.infra_type,
            inf.asset_name,
            inf.route_code,
            inf.district,
            inf.locality_name,
            inf.chainage_km,
            inf.operational_status,
            inf.passable_vehicle_types,
            inf.hazard_type,
            inf.lead_authority_name,
            inf.agreement_ref,
            dsa.authority_type,
            dsa.status as agreement_status,
            inf.verification_status,
            inf.verification_reference,
            inf.contractor_org_id,
            org.name as contractor_name,
            inf.gps_coordinates,
            inf.estimated_clearance_time,
            inf.public_advisory,
            inf.last_reported_at,
            inf.last_verified_at,
            inf.created_at,
            inf.updated_at
        FROM infrastructure_status inf
        LEFT JOIN data_sharing_agreement dsa ON inf.agreement_ref = dsa.agreement_ref
        LEFT JOIN organisation org ON inf.contractor_org_id = org.organisation_id
        WHERE 1=1
    `;
    const params = [];

    if (district) {
        params.push(district);
        query += ` AND LOWER(inf.district) = LOWER($${params.length})`;
    }
    if (infraType && infraType !== 'ALL') {
        params.push(infraType);
        query += ` AND inf.infra_type = $${params.length}`;
    }
    if (operationalStatus && operationalStatus !== 'ALL') {
        params.push(operationalStatus);
        query += ` AND inf.operational_status = $${params.length}`;
    }
    if (routeCode) {
        params.push(routeCode);
        query += ` AND LOWER(inf.route_code) = LOWER($${params.length})`;
    }
    if (vehicleType) {
        params.push(vehicleType);
        query += ` AND $${params.length} = ANY(inf.passable_vehicle_types)`;
    }

    query += ' ORDER BY inf.district ASC, inf.route_code ASC, inf.asset_name ASC';

    const result = await pool.query(query, params);
    return result.rows.map(formatInfraRow);
}

/**
 * Get a single infrastructure asset by UUID or Reference
 */
async function getInfrastructureById(id) {
    const query = `
        SELECT 
            inf.*,
            dsa.authority_type,
            dsa.status as agreement_status,
            org.name as contractor_name
        FROM infrastructure_status inf
        LEFT JOIN data_sharing_agreement dsa ON inf.agreement_ref = dsa.agreement_ref
        LEFT JOIN organisation org ON inf.contractor_org_id = org.organisation_id
        WHERE inf.infra_id::text = $1 OR inf.infra_reference = $1
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
        throw new ProblemError('NOT_FOUND', `Infrastructure asset '${id}' not found.`);
    }
    return formatInfraRow(result.rows[0]);
}

/**
 * Ingest authoritative feed for infrastructure status (FR-008-007)
 * Gated on verified authority identity and active data-sharing agreement (§13)
 */
async function ingestAuthoritativeFeed({
    infraReference,
    infraType,
    assetName,
    routeCode,
    district,
    localityName,
    chainageKm,
    operationalStatus,
    passableVehicleTypes,
    hazardType,
    leadAuthorityName,
    agreementRef,
    verificationReference,
    contractorOrgId,
    gpsCoordinates,
    estimatedClearanceTime,
    publicAdvisory,
    actor
}) {
    if (!infraReference || !infraType || !assetName || !district || !localityName || !agreementRef || !leadAuthorityName) {
        throw new ProblemError(
            'INVALID_SCHEMA',
            'infraReference, infraType, assetName, district, localityName, leadAuthorityName, and agreementRef are required.'
        );
    }

    if (!VALID_INFRA_TYPES.includes(infraType)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid infraType '${infraType}'. Allowed: ${VALID_INFRA_TYPES.join(', ')}`);
    }

    const statusToSet = operationalStatus || 'PASSABLE_ALL_VEHICLES';
    if (!VALID_STATUSES.includes(statusToSet)) {
        throw new ProblemError('INVALID_SCHEMA', `Invalid operationalStatus '${statusToSet}'. Allowed: ${VALID_STATUSES.join(', ')}`);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check active data-sharing agreement
        const agreeRes = await client.query(
            'SELECT agreement_ref, authority_name, service_domain, status FROM data_sharing_agreement WHERE agreement_ref = $1',
            [agreementRef]
        );

        if (agreeRes.rows.length === 0) {
            throw new ProblemError(
                'DISPUTED_ACCESS',
                `No data-sharing agreement found matching reference '${agreementRef}'. Under SPEC-008 §13, infrastructure updates require a registered data-sharing agreement.`
            );
        }

        const agreement = agreeRes.rows[0];
        if (agreement.status !== 'ACTIVE') {
            throw new ProblemError(
                'DISPUTED_ACCESS',
                `Data-sharing agreement '${agreementRef}' is ${agreement.status}. Ingestion rejected.`
            );
        }

        if (agreement.service_domain !== 'ROAD_ACCESS' && agreement.service_domain !== 'CROSS_SECTOR') {
            throw new ProblemError(
                'INVALID_SCHEMA',
                `Data-sharing agreement '${agreementRef}' covers '${agreement.service_domain}', not infrastructure / ROAD_ACCESS.`
            );
        }

        const upsertSql = `
            INSERT INTO infrastructure_status (
                infra_reference,
                infra_type,
                asset_name,
                route_code,
                district,
                locality_name,
                chainage_km,
                operational_status,
                passable_vehicle_types,
                hazard_type,
                lead_authority_name,
                agreement_ref,
                verification_reference,
                verification_status,
                contractor_org_id,
                gps_coordinates,
                estimated_clearance_time,
                public_advisory,
                last_reported_at,
                last_verified_at,
                is_seed,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'OFFICIAL_CONFIRMED', $14, $15, $16, $17, now(), now(), FALSE, now()
            )
            ON CONFLICT (infra_reference) DO UPDATE SET
                infra_type = EXCLUDED.infra_type,
                asset_name = EXCLUDED.asset_name,
                route_code = EXCLUDED.route_code,
                district = EXCLUDED.district,
                locality_name = EXCLUDED.locality_name,
                chainage_km = EXCLUDED.chainage_km,
                operational_status = EXCLUDED.operational_status,
                passable_vehicle_types = EXCLUDED.passable_vehicle_types,
                hazard_type = EXCLUDED.hazard_type,
                lead_authority_name = EXCLUDED.lead_authority_name,
                agreement_ref = EXCLUDED.agreement_ref,
                verification_reference = EXCLUDED.verification_reference,
                verification_status = 'OFFICIAL_CONFIRMED',
                contractor_org_id = COALESCE(EXCLUDED.contractor_org_id, infrastructure_status.contractor_org_id),
                gps_coordinates = COALESCE(EXCLUDED.gps_coordinates, infrastructure_status.gps_coordinates),
                estimated_clearance_time = EXCLUDED.estimated_clearance_time,
                public_advisory = EXCLUDED.public_advisory,
                last_reported_at = now(),
                last_verified_at = now(),
                updated_at = now()
            RETURNING *
        `;

        const result = await client.query(upsertSql, [
            infraReference,
            infraType,
            assetName,
            routeCode || null,
            district,
            localityName,
            chainageKm || null,
            statusToSet,
            passableVehicleTypes || ['HEAVY_TRUCK', 'LIGHT_4X4', 'MOTORCYCLE', 'PEDESTRIAN'],
            hazardType || 'NONE',
            leadAuthorityName,
            agreementRef,
            verificationReference || null,
            contractorOrgId || null,
            gpsCoordinates ? JSON.stringify(gpsCoordinates) : '{}',
            estimatedClearanceTime || null,
            publicAdvisory || null
        ]);

        const saved = result.rows[0];

        // Audit trail
        await writeAuditEvent(client, {
            actor: actor?.actorId || 'INFRA_AUTHORITY_FEED',
            organisation: actor?.organisation || leadAuthorityName,
            action: 'INFRASTRUCTURE_STATUS_INGESTED',
            entityType: 'infrastructure_status',
            entityId: saved.infra_id,
            previousState: null,
            newState: {
                infraReference,
                infraType,
                operationalStatus: statusToSet,
                agreementRef
            },
            accessReason: 'Authoritative infrastructure status feed ingestion per data sharing agreement',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return formatInfraRow(saved);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Authority verification of infrastructure status (IAL-2 gated)
 */
async function verifyInfrastructureStatus({
    infraId,
    operationalStatus,
    passableVehicleTypes,
    publicAdvisory,
    estimatedClearanceTime,
    verificationReference,
    actor
}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existingRes = await client.query(
            'SELECT * FROM infrastructure_status WHERE infra_id = $1',
            [infraId]
        );

        if (existingRes.rows.length === 0) {
            throw new ProblemError('NOT_FOUND', `Infrastructure record '${infraId}' not found.`);
        }

        const existing = existingRes.rows[0];
        const newStatus = operationalStatus || existing.operational_status;
        if (!VALID_STATUSES.includes(newStatus)) {
            throw new ProblemError('INVALID_SCHEMA', `Invalid operationalStatus '${newStatus}'. Allowed: ${VALID_STATUSES.join(', ')}`);
        }

        const updateRes = await client.query(`
            UPDATE infrastructure_status
            SET 
                operational_status = $1,
                passable_vehicle_types = COALESCE($2, passable_vehicle_types),
                public_advisory = COALESCE($3, public_advisory),
                estimated_clearance_time = COALESCE($4, estimated_clearance_time),
                verification_reference = COALESCE($5, verification_reference),
                verification_status = 'OFFICIAL_CONFIRMED',
                last_verified_at = now(),
                updated_at = now()
            WHERE infra_id = $6
            RETURNING *
        `, [
            newStatus,
            passableVehicleTypes || null,
            publicAdvisory || null,
            estimatedClearanceTime || null,
            verificationReference || null,
            infraId
        ]);

        const updated = updateRes.rows[0];

        await writeAuditEvent(client, {
            actor: actor?.actorId || 'AUTHORITY_ENGINEER',
            organisation: actor?.organisation || 'AUTHORITY',
            action: 'INFRASTRUCTURE_STATUS_VERIFIED',
            entityType: 'infrastructure_status',
            entityId: infraId,
            previousState: {
                operationalStatus: existing.operational_status,
                verificationStatus: existing.verification_status
            },
            newState: {
                operationalStatus: newStatus,
                verificationStatus: 'OFFICIAL_CONFIRMED',
                verificationReference: updated.verification_reference
            },
            accessReason: 'Official government engineer on-site inspection and clearance signoff',
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return formatInfraRow(updated);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

function formatInfraRow(r) {
    return {
        infraId: r.infra_id,
        infraReference: r.infra_reference,
        infraType: r.infra_type,
        assetName: r.asset_name,
        routeCode: r.route_code,
        district: r.district,
        localityName: r.locality_name,
        chainageKm: r.chainage_km,
        operationalStatus: r.operational_status,
        passableVehicleTypes: r.passable_vehicle_types,
        hazardType: r.hazard_type,
        leadAuthorityName: r.lead_authority_name,
        agreementRef: r.agreement_ref,
        authorityType: r.authority_type || null,
        verificationStatus: r.verification_status,
        verificationReference: r.verification_reference,
        contractorOrgId: r.contractor_org_id,
        contractorName: r.contractor_name || null,
        gpsCoordinates: r.gps_coordinates,
        estimatedClearanceTime: r.estimated_clearance_time,
        publicAdvisory: r.public_advisory,
        lastReportedAt: r.last_reported_at,
        lastVerifiedAt: r.last_verified_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    };
}

module.exports = {
    listInfrastructure,
    getInfrastructureById,
    ingestAuthoritativeFeed,
    verifyInfrastructureStatus,
    VALID_INFRA_TYPES,
    VALID_STATUSES
};
