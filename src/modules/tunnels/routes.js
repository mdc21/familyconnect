const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireActor } = require('../../middleware/actor');
const { runTunnelRescueAgent } = require('./agent');

const router = express.Router();

/**
 * POST /api/v1/tunnels/agent/run
 * Triggers immediate run of the Tunnel Rescue Intelligence Agent.
 */
router.post('/agent/run', requireActor('AUTHORITY', 'ADMIN', 'CASE_WORKER'), async (req, res, next) => {
    try {
        const result = await runTunnelRescueAgent();
        if (!result.success) {
            throw new ProblemError('INTERNAL_ERROR', result.error || 'Tunnel Rescue Agent cycle failed', req.originalUrl);
        }
        res.json(result);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/tunnels
 * Returns list of all hydropower tunnel rescue sites, trapped counts, drilling progress & updates.
 */
router.get('/', async (req, res, next) => {

    try {
        const result = await pool.query(
            `SELECT t.*,
                    (SELECT COUNT(*) FROM tunnel_worker_roster r WHERE r.site_id = t.site_id) as roster_count
             FROM tunnel_site t
             ORDER BY t.estimated_trapped DESC, t.updated_at DESC`
        );

        res.json(result.rows.map(r => ({
            siteId: r.site_id,
            siteName: r.site_name,
            district: r.district,
            operatorCompany: r.operator_company,
            estimatedTrapped: r.estimated_trapped,
            rescuedCount: r.rescued_count,
            confirmedFatalities: r.confirmed_fatalities,
            operationalStatus: r.operational_status,
            drillingProgressMeters: parseFloat(r.drilling_progress_m) || 0,
            targetDepthMeters: parseFloat(r.target_depth_m) || 0,
            lastStatusUpdate: r.last_status_update,
            updatedAt: r.updated_at,
            rosterCount: parseInt(r.roster_count, 10) || 0
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/tunnels/:siteId/roster
 * Returns shift worker roster for a specific tunnel site.
 */
router.get('/:siteId/roster', async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const result = await pool.query(
            `SELECT r.*, t.site_name
             FROM tunnel_worker_roster r
             JOIN tunnel_site t ON r.site_id = t.site_id
             WHERE r.site_id = $1
             ORDER BY r.created_at DESC`,
            [siteId]
        );

        res.json(result.rows.map(r => ({
            rosterId: r.roster_id,
            siteId: r.site_id,
            siteName: r.site_name,
            workerName: r.worker_name,
            designation: r.designation,
            contractorCompany: r.contractor_company,
            shiftDate: r.shift_date,
            status: r.status,
            reportedByFamily: r.reported_by_family,
            familyContactPhone: r.family_contact_phone,
            notes: r.notes,
            createdAt: r.created_at
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/tunnels/worker-report
 * Allows family or contractor to register a missing worker on a tunnel site roster.
 */
router.post('/worker-report', async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const { siteId, workerName, designation, contractorCompany, familyContactPhone, notes } = req.body;

        if (!siteId || !workerName) {
            throw new ProblemError('INVALID_SCHEMA', 'siteId and workerName are required', req.originalUrl);
        }

        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO tunnel_worker_roster
                (site_id, worker_name, designation, contractor_company, status, reported_by_family, family_contact_phone, notes)
             VALUES ($1, $2, $3, $4, 'UNACCOUNTED', true, $5, $6)
             RETURNING *`,
            [siteId, workerName, designation || null, contractorCompany || null, familyContactPhone || null, notes || null]
        );

        const row = result.rows[0];

        await writeAuditEvent(client, {
            actor: 'PUBLIC_FAMILY_REPORTER',
            action: 'TUNNEL_WORKER_ROSTER_REPORTED',
            entityType: 'TunnelWorkerRoster',
            entityId: row.roster_id,
            newState: { siteId, workerName, designation },
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.status(201).json({
            rosterId: row.roster_id,
            workerName: row.worker_name,
            status: row.status,
            message: 'Worker details successfully logged for tunnel rescue operations.'
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * PUT /api/v1/tunnels/:siteId/status
 * Updates operational rescue status, drilling meters, trapped count for a site.
 */
router.put('/:siteId/status', requireActor('AUTHORITY', 'ADMIN', 'CASE_WORKER'), async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const { siteId } = req.params;
        const { operationalStatus, drillingProgressMeters, estimatedTrapped, rescuedCount, confirmedFatalities, lastStatusUpdate } = req.body;

        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE tunnel_site
             SET operational_status = COALESCE($1, operational_status),
                 drilling_progress_m = COALESCE($2, drilling_progress_m),
                 estimated_trapped = COALESCE($3, estimated_trapped),
                 rescued_count = COALESCE($4, rescued_count),
                 confirmed_fatalities = COALESCE($5, confirmed_fatalities),
                 last_status_update = COALESCE($6, last_status_update),
                 updated_at = now()
             WHERE site_id = $7
             RETURNING *`,
            [operationalStatus, drillingProgressMeters, estimatedTrapped, rescuedCount, confirmedFatalities, lastStatusUpdate, siteId]
        );

        if (!result.rows.length) {
            throw new ProblemError('NOT_FOUND', 'Tunnel site not found', req.originalUrl);
        }

        const site = result.rows[0];

        await writeAuditEvent(client, {
            actor: req.actor ? req.actor.actorClass : 'AUTHORITY',
            action: 'TUNNEL_SITE_STATUS_UPDATED',
            entityType: 'TunnelSite',
            entityId: site.site_id,
            newState: { operationalStatus, drillingProgressMeters, lastStatusUpdate },
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.json({
            siteId: site.site_id,
            siteName: site.site_name,
            operationalStatus: site.operational_status,
            drillingProgressMeters: parseFloat(site.drilling_progress_m),
            lastStatusUpdate: site.last_status_update,
            message: 'Tunnel rescue operation status updated.'
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * PUT /api/v1/tunnels/roster/:rosterId/status
 * Authority / Coordinator: update the rescue status of an individual trapped worker.
 * VALID statuses: UNACCOUNTED | TRAPPED_CONFIRMED | TRAPPED_SAFE_CHAMBER | SURFACE_EVACUATED | HOSPITALISED | DECEASED | RESCUED
 */
router.put('/roster/:rosterId/status', requireActor('AUTHORITY', 'ADMIN', 'CASE_WORKER'), async (req, res, next) => {
    const VALID_STATUSES = ['UNACCOUNTED','TRAPPED_CONFIRMED','TRAPPED_SAFE_CHAMBER','SURFACE_EVACUATED','HOSPITALISED','DECEASED','RESCUED'];
    const { status, notes } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
        return next(new ProblemError('INVALID_SCHEMA', `status must be one of: ${VALID_STATUSES.join(', ')}`, req.originalUrl));
    }

    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE tunnel_worker_roster
             SET status = $1, notes = COALESCE($2, notes), updated_at = now()
             WHERE roster_id = $3
             RETURNING *`,
            [status, notes || null, req.params.rosterId],
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return next(new ProblemError('NOT_FOUND', 'Roster entry not found.', req.originalUrl));
        }

        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'COORD_ANON',
            action: 'TUNNEL_WORKER_STATUS_UPDATED',
            entityType: 'TunnelWorkerRoster',
            entityId: req.params.rosterId,
            newState: { status, notes },
            outcome: 'SUCCESS',
        });

        await client.query('COMMIT');
        res.json({
            rosterId: req.params.rosterId,
            workerName: result.rows[0].worker_name,
            newStatus: status,
            message: 'Worker rescue status updated.',
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
