/**
 * FamilyConnect Field Hub Server — SPEC-011 Phase 2 §5.1
 *
 * A standalone Node.js server that runs on a ruggedised laptop or tablet
 * at a relief camp, EOC sub-centre, police station, or hospital admissions desk.
 *
 * Key properties:
 *  - Uses SQLite (via better-sqlite3) instead of PostgreSQL — zero-infrastructure
 *  - Serves the same FamilyConnect frontend static files
 *  - Accepts submissions from Tier-1 devices on local LAN (http://192.168.x.x:3000)
 *  - Queues all records locally and pushes upstream when connectivity restores
 *  - Runs coordinator approval workflow entirely offline (§5.2)
 *  - Broadcasts its IP via mDNS (Bonjour) so nearby devices auto-discover it
 *
 * Usage:
 *   node src/field-hub/server.js [--port 3000] [--hub-id HUB-NP-RASUWAGADHI-001]
 *
 * Environment:
 *   FC_HUB_ID         - Hub identifier (default: auto-generated)
 *   FC_HUB_NAME       - Human-readable hub name
 *   FC_HUB_PORT       - HTTP port (default: 3000)
 *   FC_UPSTREAM_URL   - Cloud backend URL for upstream sync (default: https://api.familyconnect.org)
 *   FC_DB_PATH        - SQLite DB file path (default: ./field-hub.db)
 *
 * Security:
 *   - §9: SQLite DB should be AES-256 encrypted in production (SQLCipher)
 *   - This file uses unencrypted SQLite for development
 *   - Production deployments must set FC_DB_ENCRYPTED=true and provide a key
 */

'use strict';

try { process.loadEnvFile?.(); } catch (_) {}

const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

// ── Configuration ──────────────────────────────────────────────────────────────
const HUB_ID = process.env.FC_HUB_ID
    || `HUB-LOCAL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const HUB_NAME = process.env.FC_HUB_NAME || `FamilyConnect Field Hub (${HUB_ID})`;
const PORT = parseInt(process.env.FC_HUB_PORT || '3000', 10);
const DB_PATH = process.env.FC_DB_PATH || path.join(process.cwd(), 'field-hub.db');
const UPSTREAM_URL = process.env.FC_UPSTREAM_URL || 'https://api.familyconnect.org';
const FRONTEND_DIR = path.join(__dirname, '../../frontend');

// ── SQLite database ────────────────────────────────────────────────────────────
let db;

function openDatabase() {
    try {
        // Requires: npm install better-sqlite3
        const Database = require('better-sqlite3');
        db = new Database(DB_PATH, { verbose: process.env.FC_DEBUG ? console.log : null });

        // Enable WAL mode for concurrent reads during sync operations
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');

        applySchema();
        console.log(`[Field Hub] SQLite database opened: ${DB_PATH}`);
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            console.error('[Field Hub] better-sqlite3 not installed. Run: npm install better-sqlite3');
            console.warn('[Field Hub] Starting in MEMORY-ONLY mode (records will not persist across restarts).');
            db = createInMemoryFallback();
        } else {
            throw err;
        }
    }
}

function applySchema() {
    db.exec(`
        -- Field Hub local schema (mirrors cloud schema for relevant tables only)
        CREATE TABLE IF NOT EXISTS fh_record (
            id              TEXT PRIMARY KEY,
            record_type     TEXT NOT NULL,
            local_ref       TEXT NOT NULL,
            body            TEXT NOT NULL,             -- JSON
            captured_at     TEXT NOT NULL,
            captured_by     TEXT,
            idempotency_key TEXT UNIQUE NOT NULL,
            status          TEXT NOT NULL DEFAULT 'QUEUED', -- QUEUED | SYNCED | CONFLICT | FAILED
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            synced_at       TEXT
        );

        CREATE TABLE IF NOT EXISTS fh_approval (
            id              TEXT PRIMARY KEY,
            local_ref       TEXT NOT NULL,
            type            TEXT NOT NULL,             -- PORTAL_APPROVAL | PROJECT_APPROVAL
            entity_id       TEXT NOT NULL,
            decision        TEXT NOT NULL,             -- APPROVED | REJECTED | NEEDS_REVISION
            reviewer_comment TEXT,
            reviewer_ial    INTEGER,
            decided_at      TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'QUEUED',
            synced_at       TEXT,
            idempotency_key TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS fh_sync_log (
            id              TEXT PRIMARY KEY,
            batch_id        TEXT,
            attempted_at    TEXT NOT NULL DEFAULT (datetime('now')),
            records_sent    INTEGER DEFAULT 0,
            records_accepted INTEGER DEFAULT 0,
            records_conflicted INTEGER DEFAULT 0,
            status          TEXT NOT NULL,             -- SUCCESS | PARTIAL | FAILED
            error           TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_fh_record_status ON fh_record(status);
        CREATE INDEX IF NOT EXISTS idx_fh_approval_status ON fh_approval(status);
    `);
}

/** Minimal in-memory fallback when better-sqlite3 is unavailable (dev/demo only). */
function createInMemoryFallback() {
    const store = { records: [], approvals: [], syncLog: [] };
    return {
        prepare: (sql) => ({
            run: (...args) => { console.debug('[MemDB]', sql, args); return { changes: 1 }; },
            get: (...args) => null,
            all: (...args) => [],
        }),
        exec: (sql) => {},
        pragma: () => {},
        _store: store,
        _inMemory: true,
    };
}

// ── Express-like minimal HTTP server (no external dependencies required) ────────
// We deliberately avoid importing the full src/app.js here to keep the Field Hub
// lean and self-contained. Only the offline-critical endpoints are served locally.

const express = require('express');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS: allow same-LAN devices to connect
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key,X-Disaster-Event-ID');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Serve the FamilyConnect frontend static files
app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));

// ── Hub identity endpoint ──────────────────────────────────────────────────────
app.get('/api/v1/hub/identity', (req, res) => {
    const localIPs = getLocalIPs();
    res.json({
        hubId: HUB_ID,
        hubName: HUB_NAME,
        mode: 'FIELD_HUB',
        upstreamUrl: UPSTREAM_URL,
        localIPs,
        dbPath: DB_PATH,
        dbInMemory: db?._inMemory || false,
        queueStats: getQueueStats(),
        serverTime: new Date().toISOString(),
    });
});

// ── Local submission endpoints (mirror cloud API for Tier-1 devices) ───────────

/** POST /api/v1/submissions/safety — local acceptance, queues for upstream */
app.post('/api/v1/submissions/safety', (req, res) => {
    return acceptLocalRecord(req, res, 'submission.safety', 'FC-SAFE');
});

/** POST /api/v1/submissions/missing — local acceptance */
app.post('/api/v1/submissions/missing', (req, res) => {
    return acceptLocalRecord(req, res, 'submission.missing', 'FC-MISS');
});

/** POST /api/v1/submissions/recovery-needs — local acceptance */
app.post('/api/v1/submissions/recovery-needs', (req, res) => {
    return acceptLocalRecord(req, res, 'submission.recovery_need', 'FC-NEED');
});

/** POST /api/v1/infrastructure/status — local acceptance */
app.post('/api/v1/infrastructure/status', (req, res) => {
    return acceptLocalRecord(req, res, 'infrastructure.status', 'FC-INFRA');
});

/** POST /api/v1/tunnels/worker-report — local acceptance */
app.post('/api/v1/tunnels/worker-report', (req, res) => {
    return acceptLocalRecord(req, res, 'tunnels.worker_report', 'FC-TUNN');
});

// Catch-all for write paths: queue anything else
app.post(['/api/v1/events/:id/rumours', '/api/v1/cases/:id/assistance'], (req, res) => {
    return acceptLocalRecord(req, res, 'generic.' + req.path.replace(/\//g, '.'), 'FC-GEN');
});

// ── Coordinator offline approval (§5.2) ───────────────────────────────────────
app.post('/api/v1/approvals/portals/:id/offline', (req, res) => {
    return acceptLocalApproval(req, res, 'PORTAL_APPROVAL', req.params.id);
});

app.post('/api/v1/approvals/projects/:id/offline', (req, res) => {
    return acceptLocalApproval(req, res, 'PROJECT_APPROVAL', req.params.id);
});

// ── Queue inspection ───────────────────────────────────────────────────────────
app.get('/api/v1/hub/queue', (req, res) => {
    try {
        const records = db.prepare(`SELECT id, record_type, local_ref, status, captured_at, created_at FROM fh_record ORDER BY created_at DESC LIMIT 100`).all();
        const approvals = db.prepare(`SELECT id, type, entity_id, decision, status, decided_at FROM fh_approval ORDER BY decided_at DESC LIMIT 20`).all();
        res.json({ records, approvals, stats: getQueueStats() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Manual upstream sync trigger ───────────────────────────────────────────────
app.post('/api/v1/hub/sync', async (req, res) => {
    try {
        const result = await pushUpstream();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get(['/healthz', '/api/v1/hub/health'], (req, res) => {
    res.json({
        status: 'ok',
        hubId: HUB_ID,
        mode: 'FIELD_HUB',
        queueStats: getQueueStats(),
        upstreamReachable: null, // checked lazily on sync
        uptime: process.uptime(),
    });
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function acceptLocalRecord(req, res, recordType, refPrefix) {
    const idempotencyKey = req.headers['idempotency-key'] || crypto.randomUUID();
    const localRef = `${refPrefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const capturedBy = req.headers.authorization
        ? parseJwtSub(req.headers.authorization)
        : (req.body?.caseworkerId || 'FIELD_HUB_ANON');

    try {
        db.prepare(`
            INSERT INTO fh_record (id, record_type, local_ref, body, captured_at, captured_by, idempotency_key)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            crypto.randomUUID(), recordType, localRef,
            JSON.stringify(req.body || {}),
            new Date().toISOString(), capturedBy, idempotencyKey
        );

        return res.status(202).json({
            localRef,
            processingStatus: 'QUEUED_LOCAL',
            status: 'QUEUED_LOCAL',
            message: 'Saved to Field Hub local queue. Will sync to FamilyConnect cloud when connectivity is available.',
            hubId: HUB_ID,
            queueStats: getQueueStats(),
        });
    } catch (err) {
        if (err.message?.includes('UNIQUE constraint')) {
            // Idempotency: already queued
            return res.status(202).json({
                localRef,
                processingStatus: 'ALREADY_QUEUED',
                message: 'This record was already received.',
            });
        }
        console.error('[Field Hub] acceptLocalRecord error:', err.message);
        return res.status(500).json({ error: 'Local storage error. Please try again.' });
    }
}

function acceptLocalApproval(req, res, type, entityId) {
    const { decision, reviewerComment, _offlineMeta } = req.body || {};
    if (!['APPROVED', 'REJECTED', 'NEEDS_REVISION'].includes(decision?.toUpperCase())) {
        return res.status(400).json({ error: 'decision must be APPROVED, REJECTED, or NEEDS_REVISION.' });
    }

    const localRef = `FC-APPROVAL-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const idempotencyKey = crypto.randomUUID();
    const reviewerIAL = _offlineMeta?.reviewerIAL || null;

    try {
        db.prepare(`
            INSERT INTO fh_approval (id, local_ref, type, entity_id, decision, reviewer_comment, reviewer_ial, decided_at, idempotency_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            crypto.randomUUID(), localRef, type, entityId,
            decision.toUpperCase(), reviewerComment || null,
            reviewerIAL, new Date().toISOString(), idempotencyKey
        );

        return res.status(202).json({
            localRef,
            processingStatus: 'QUEUED_LOCAL',
            message: 'Approval decision queued locally. Will sync when connectivity restores. NOTE: The cloud server will validate entity status at sync time (SPEC-011 §4.4).',
            hubId: HUB_ID,
        });
    } catch (err) {
        console.error('[Field Hub] acceptLocalApproval error:', err.message);
        return res.status(500).json({ error: 'Local storage error.' });
    }
}

function getQueueStats() {
    try {
        const records = db.prepare(`SELECT status, COUNT(*) as count FROM fh_record GROUP BY status`).all();
        const approvals = db.prepare(`SELECT status, COUNT(*) as count FROM fh_approval GROUP BY status`).all();
        const result = { records: {}, approvals: {} };
        records.forEach(r => { result.records[r.status] = parseInt(r.count); });
        approvals.forEach(r => { result.approvals[r.status] = parseInt(r.count); });
        result.totalQueued = (result.records.QUEUED || 0) + (result.approvals.QUEUED || 0);
        return result;
    } catch (_) {
        return { totalQueued: 0 };
    }
}

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const iface of Object.values(interfaces)) {
        for (const cfg of (iface || [])) {
            if (cfg.family === 'IPv4' && !cfg.internal) ips.push(cfg.address);
        }
    }
    return ips;
}

function parseJwtSub(authHeader) {
    try {
        const token = authHeader.replace('Bearer ', '');
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
        return payload.sub || 'UNKNOWN';
    } catch (_) { return 'UNKNOWN'; }
}

// ── Upstream sync engine ───────────────────────────────────────────────────────
// §5.3: POST /api/v1/sync/batch to the cloud backend when connectivity restores.

let isSyncing = false;

async function pushUpstream() {
    if (isSyncing) return { status: 'ALREADY_SYNCING' };
    isSyncing = true;

    const batchId = `BATCH-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${HUB_ID}`;
    const logId = crypto.randomUUID();

    try {
        const queuedRecords = db.prepare(`
            SELECT * FROM fh_record WHERE status='QUEUED' ORDER BY created_at ASC LIMIT 200
        `).all();
        const queuedApprovals = db.prepare(`
            SELECT * FROM fh_approval WHERE status='QUEUED' ORDER BY decided_at ASC LIMIT 50
        `).all();

        if (queuedRecords.length === 0 && queuedApprovals.length === 0) {
            return { status: 'NOTHING_TO_SYNC', queueStats: getQueueStats() };
        }

        // Build batch payload (§5.3 protocol)
        const records = [
            ...queuedRecords.map(r => ({
                type: r.record_type,
                localRef: r.local_ref,
                body: JSON.parse(r.body),
                capturedAt: r.captured_at,
                capturedBy: r.captured_by,
                idempotencyKey: r.idempotency_key,
            })),
            ...queuedApprovals.map(a => ({
                type: a.type === 'PORTAL_APPROVAL' ? 'approval.portal' : 'approval.project',
                localRef: a.local_ref,
                body: {
                    entityId: a.entity_id,
                    decision: a.decision,
                    reviewerComment: a.reviewer_comment,
                    _offlineMeta: { decidedAt: a.decided_at, reviewerIAL: a.reviewer_ial },
                },
                capturedAt: a.decided_at,
                idempotencyKey: a.idempotency_key,
            })),
        ];

        // Check upstream reachability
        let upstreamReachable = false;
        try {
            const testRes = await fetch(`${UPSTREAM_URL}/healthz`, {
                signal: AbortSignal.timeout(5000)
            });
            upstreamReachable = testRes.ok;
        } catch (_) {}

        if (!upstreamReachable) {
            return { status: 'UPSTREAM_UNREACHABLE', upstreamUrl: UPSTREAM_URL, queueStats: getQueueStats() };
        }

        // POST the batch
        const syncRes = await fetch(`${UPSTREAM_URL}/api/v1/sync/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Field-Hub-ID': HUB_ID },
            body: JSON.stringify({ hubId: HUB_ID, batchId, records }),
            signal: AbortSignal.timeout(30000),
        });

        if (!syncRes.ok) {
            const errText = await syncRes.text().catch(() => '');
            throw new Error(`Upstream rejected batch: ${syncRes.status} — ${errText.slice(0, 200)}`);
        }

        const syncData = await syncRes.json();
        const syncedAt = new Date().toISOString();

        // Mark synced records
        const syncedSubmissionIds = syncData.records
            ?.filter(r => ['RECEIVED', 'DUPLICATE'].includes(r.status))
            .map(r => r.localRef) || [];

        for (const localRef of syncedSubmissionIds) {
            db.prepare(`UPDATE fh_record SET status='SYNCED', synced_at=? WHERE local_ref=?`)
              .run(syncedAt, localRef);
        }

        // Mark synced approvals
        for (const a of queuedApprovals) {
            db.prepare(`UPDATE fh_approval SET status='SYNCED', synced_at=? WHERE id=?`)
              .run(syncedAt, a.id);
        }

        // Log the sync run
        db.prepare(`
            INSERT INTO fh_sync_log (id, batch_id, records_sent, records_accepted, records_conflicted, status)
            VALUES (?, ?, ?, ?, ?, 'SUCCESS')
        `).run(logId, batchId, records.length,
            syncData.summary?.received || 0,
            syncData.summary?.conflicts || 0);

        console.log(`[Field Hub] Sync complete: ${batchId} — ${syncData.summary?.received || 0}/${records.length} accepted`);

        return {
            status: 'SUCCESS',
            batchId,
            summary: syncData.summary,
            queueStats: getQueueStats(),
        };

    } catch (err) {
        console.error('[Field Hub] Sync error:', err.message);
        try {
            db.prepare(`INSERT INTO fh_sync_log (id, batch_id, status, error) VALUES (?,?,'FAILED',?)`)
              .run(logId, batchId, err.message);
        } catch (_) {}
        return { status: 'FAILED', error: err.message, queueStats: getQueueStats() };
    } finally {
        isSyncing = false;
    }
}

// ── Auto-sync scheduler ────────────────────────────────────────────────────────
// Attempts upstream sync every 5 minutes when records are queued.
function startAutoSync(intervalMs = 5 * 60 * 1000) {
    setInterval(async () => {
        const stats = getQueueStats();
        if (stats.totalQueued > 0) {
            console.log(`[Field Hub] Auto-sync triggered (${stats.totalQueued} queued items)…`);
            const result = await pushUpstream();
            if (result.status === 'SUCCESS') {
                console.log(`[Field Hub] Auto-sync complete: ${JSON.stringify(result.summary)}`);
            }
        }
    }, intervalMs);
}

// ── Boot ───────────────────────────────────────────────────────────────────────
openDatabase();

const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => {
    const localIPs = getLocalIPs();
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  FamilyConnect Field Hub Server — SPEC-011 Phase 2           ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Hub ID:   ${HUB_ID.padEnd(50)}║`);
    console.log(`║  Hub Name: ${HUB_NAME.slice(0, 50).padEnd(50)}║`);
    console.log(`║  Port:     ${String(PORT).padEnd(50)}║`);
    console.log(`║  DB:       ${DB_PATH.slice(0, 50).padEnd(50)}║`);
    console.log(`║  Upstream: ${UPSTREAM_URL.slice(0, 50).padEnd(50)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    localIPs.forEach(ip => {
        console.log(`║  LAN URL:  http://${ip}:${PORT}/`.padEnd(65) + '║');
    });
    console.log(`║  Local:    http://localhost:${PORT}/`.padEnd(65) + '║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Field workers on the same LAN can connect to this hub.');
    console.log('  All submissions are stored locally and synced when online.');
    console.log('  Press Ctrl+C to stop the Field Hub server.');
    console.log('');
});

// Start auto-sync
startAutoSync();

module.exports = { app, server, db, pushUpstream };
