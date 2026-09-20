/**
 * SPEC-008 §11 Gate G6 — Operational Monitoring & SLO Health
 *
 * Phase 1 SLOs (agreed 2026-09-20):
 *   - Availability:           99.5%  (≤ 3.6h downtime/month)
 *   - Read latency p95:       ≤ 2000ms
 *   - Write latency p95:      ≤ 5000ms
 *   - Need-to-notification:   ≤ 4h from submission to caseworker alert
 *   - Verification SLO:       ≤ 24h ASSESSED → VERIFIED for HIGH/CRITICAL severity
 *   - Dispute resolution:     ≤ 72h from dispute filed to resolution
 *   - Phase 1 "full cycle":   30 days + ≥ 50 real recovery needs through VERIFIED state
 *
 * AI Safety SLO thresholds (SPEC-009):
 *   - Agent proposal rate:    Alert if > 20 proposals/hour from any single agent
 *   - L4/L5 unreviewed:       Alert if any L4/L5 proposal has no reviewer action within 48h
 */

const { pool } = require('../../db');

// Phase 1 SLO definitions — single source of truth
const SLO_TARGETS = {
    availabilityPct: 99.5,
    readLatencyP95Ms: 2000,
    writeLatencyP95Ms: 5000,
    needToNotificationHours: 4,
    verificationSloHours: 24,
    disputeResolutionHours: 72,
    fullCycleDays: 30,
    fullCycleMinVerifiedNeeds: 50,
};

// In-memory ring buffer for request latency (last 10,000 requests)
// Resets on restart — intentional; p95 is a rolling production metric
const LATENCY_RING = { reads: [], writes: [] };
const RING_SIZE = 10000;

function recordLatency(type, ms) {
    const ring = LATENCY_RING[type];
    if (ring.length >= RING_SIZE) ring.shift();
    ring.push(ms);
}

function computeP95(ring) {
    if (ring.length === 0) return null;
    const sorted = [...ring].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, idx)];
}

/**
 * Express middleware — records response latency per request type.
 * Attach to app before route handlers.
 */
function sloLatencyMiddleware(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        recordLatency(isWrite ? 'writes' : 'reads', ms);
    });
    next();
}

/**
 * Query live SLO compliance metrics from the database.
 */
async function querySloMetrics() {
    const client = await pool.connect();
    try {
        // 1. Need-to-notification SLO: recovery needs submitted > 4h ago that are still REPORTED
        const breachedNotificationRes = await client.query(`
            SELECT COUNT(*) AS count
            FROM recovery_need
            WHERE status = 'REPORTED'
              AND created_at < now() - interval '${SLO_TARGETS.needToNotificationHours} hours'
        `);

        // 2. Verification SLO: HIGH/CRITICAL needs in ASSESSED state > 24h
        const breachedVerificationRes = await client.query(`
            SELECT COUNT(*) AS count
            FROM recovery_need
            WHERE status = 'ASSESSED'
              AND severity IN ('HIGH', 'CRITICAL')
              AND updated_at < now() - interval '${SLO_TARGETS.verificationSloHours} hours'
        `);

        // 3. Dispute resolution SLO: needs in RESTRICTED_PENDING_REVIEW > 72h
        const breachedDisputeRes = await client.query(`
            SELECT COUNT(*) AS count
            FROM recovery_need
            WHERE data_sharing_status = 'RESTRICTED_PENDING_REVIEW'
              AND updated_at < now() - interval '${SLO_TARGETS.disputeResolutionHours} hours'
        `);

        // 4. Phase 1 "full cycle" progress: needs that have reached VERIFIED
        const fullCycleRes = await client.query(`
            SELECT
                COUNT(*) AS total_submitted,
                COUNT(CASE WHEN status IN ('VERIFIED','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED') THEN 1 END) AS verified_count,
                MIN(created_at) AS earliest_submission,
                EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 86400 AS days_elapsed
            FROM recovery_need
        `);

        // 5. AI Safety: agents with > 20 proposals in the last hour
        const hotAgentsRes = await client.query(`
            SELECT agent_id, COUNT(*) AS proposal_count
            FROM ai_proposal
            WHERE created_at > now() - interval '1 hour'
            GROUP BY agent_id
            HAVING COUNT(*) > 20
        `);

        // 6. L4/L5 proposals unreviewed > 48h
        const staleCriticalRes = await client.query(`
            SELECT COUNT(*) AS count
            FROM ai_proposal
            WHERE impact_class IN ('L4', 'L5')
              AND decision = 'PENDING'
              AND created_at < now() - interval '48 hours'
        `);

        const fc = fullCycleRes.rows[0];
        const verifiedCount = parseInt(fc.verified_count, 10);
        const daysElapsed = parseFloat(fc.days_elapsed) || 0;
        const fullCycleComplete =
            daysElapsed >= SLO_TARGETS.fullCycleDays &&
            verifiedCount >= SLO_TARGETS.fullCycleMinVerifiedNeeds;

        return {
            needs: {
                breachedNotificationSlo: parseInt(breachedNotificationRes.rows[0].count, 10),
                breachedVerificationSlo: parseInt(breachedVerificationRes.rows[0].count, 10),
                breachedDisputeResolutionSlo: parseInt(breachedDisputeRes.rows[0].count, 10),
            },
            phase1FullCycle: {
                complete: fullCycleComplete,
                daysElapsed: Math.floor(daysElapsed),
                daysRequired: SLO_TARGETS.fullCycleDays,
                verifiedNeedsCount: verifiedCount,
                verifiedNeedsRequired: SLO_TARGETS.fullCycleMinVerifiedNeeds,
                phase2UnlockReady: fullCycleComplete,
            },
            aiSafety: {
                hotAgents: hotAgentsRes.rows,           // agents exceeding 20 proposals/hour
                staleCriticalProposals: parseInt(staleCriticalRes.rows[0].count, 10),
            },
        };
    } finally {
        client.release();
    }
}

/**
 * GET /api/v1/ops/health — Full SLO health report
 * Public-safe subset; detailed AI safety fields restricted to ADMIN.
 */
async function healthHandler(req, res, next) {
    try {
        const readP95 = computeP95(LATENCY_RING.reads);
        const writeP95 = computeP95(LATENCY_RING.writes);
        const dbMetrics = await querySloMetrics();

        const readSloOk  = readP95  === null || readP95  <= SLO_TARGETS.readLatencyP95Ms;
        const writeSloOk = writeP95 === null || writeP95 <= SLO_TARGETS.writeLatencyP95Ms;
        const needsOk    = dbMetrics.needs.breachedNotificationSlo === 0;
        const verifyOk   = dbMetrics.needs.breachedVerificationSlo === 0;
        const disputeOk  = dbMetrics.needs.breachedDisputeResolutionSlo === 0;
        const aiOk       = dbMetrics.aiSafety.hotAgents.length === 0 &&
                           dbMetrics.aiSafety.staleCriticalProposals === 0;

        const overallStatus = readSloOk && writeSloOk && needsOk && verifyOk && disputeOk && aiOk
            ? 'HEALTHY' : 'DEGRADED';

        const isAdmin = req.actor?.actorClass === 'ADMIN';

        res.json({
            status: overallStatus,
            timestamp: new Date().toISOString(),
            sloTargets: SLO_TARGETS,
            latency: {
                readP95Ms: readP95,
                writeP95Ms: writeP95,
                readSloOk,
                writeSloOk,
                sampleSize: { reads: LATENCY_RING.reads.length, writes: LATENCY_RING.writes.length },
            },
            operationalSlos: {
                needToNotificationSloOk: needsOk,
                breachedNotificationCount: dbMetrics.needs.breachedNotificationSlo,
                verificationSloOk: verifyOk,
                breachedVerificationCount: dbMetrics.needs.breachedVerificationSlo,
                disputeResolutionSloOk: disputeOk,
                breachedDisputeCount: dbMetrics.needs.breachedDisputeResolutionSlo,
            },
            phase1Progress: dbMetrics.phase1FullCycle,
            // AI safety fields restricted to ADMIN to prevent gaming
            ...(isAdmin ? { aiSafety: dbMetrics.aiSafety } : {}),
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { sloLatencyMiddleware, healthHandler, SLO_TARGETS, recordLatency };
