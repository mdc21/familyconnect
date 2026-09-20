const crypto = require('crypto');
const { pool } = require('../../db');

// Ensure tables exist on first load (self-healing / zero configuration)
let tablesInitialized = false;
async function ensureTables() {
    if (tablesInitialized) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS portal_visitor_metric (
                id SERIAL PRIMARY KEY,
                metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
                event_id TEXT NOT NULL,
                page_path TEXT NOT NULL,
                page_views INT NOT NULL DEFAULT 1,
                unique_visitors INT NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_portal_visitor_metric UNIQUE (metric_date, event_id, page_path)
            );
            CREATE TABLE IF NOT EXISTS portal_daily_visitor_hash (
                metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
                event_id TEXT NOT NULL,
                visitor_hash TEXT NOT NULL,
                PRIMARY KEY (metric_date, event_id, visitor_hash)
            );
            CREATE INDEX IF NOT EXISTS idx_visitor_metric_date_event ON portal_visitor_metric(metric_date, event_id);
            CREATE INDEX IF NOT EXISTS idx_visitor_hash_date_event ON portal_daily_visitor_hash(metric_date, event_id);
        `);
        tablesInitialized = true;
    } catch (err) {
        console.error('Failed to initialize visitor metrics tables:', err.message);
    }
}

/**
 * Normalizes page path for clean aggregated statistics.
 */
function normalizePath(rawPath) {
    if (!rawPath || rawPath === '/' || rawPath === '/index') return '/index.html';
    let clean = rawPath.split('?')[0].toLowerCase();
    if (!clean.includes('.')) clean += '.html';
    return clean;
}

/**
 * Anonymously records a page visit in compliance with ICRC / SPEC-004 guidelines.
 * IP is salted with daily date and server secret and SHA-256 hashed. Zero PII stored.
 */
async function recordVisit({ eventId = 'EVENT-NP-TIBET-2026', pagePath = '/index.html', clientIp = '127.0.0.1' }) {
    await ensureTables();
    const today = new Date().toISOString().slice(0, 10);
    const normalizedPath = normalizePath(pagePath);
    const salt = process.env.JWT_SECRET || 'familyconnect_privacy_salt_2026';
    const visitorHash = crypto.createHash('sha256').update(`${today}:${salt}:${clientIp}`).digest('hex');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if visitor hash is new for today and this event
        const hashRes = await client.query(
            `INSERT INTO portal_daily_visitor_hash (metric_date, event_id, visitor_hash)
             VALUES ($1, $2, $3)
             ON CONFLICT (metric_date, event_id, visitor_hash) DO NOTHING
             RETURNING visitor_hash`,
            [today, eventId, visitorHash]
        );
        const isNewUnique = (hashRes.rowCount > 0) ? 1 : 0;

        // Upsert page view metric
        await client.query(
            `INSERT INTO portal_visitor_metric (metric_date, event_id, page_path, page_views, unique_visitors, updated_at)
             VALUES ($1, $2, $3, 1, $4, NOW())
             ON CONFLICT (metric_date, event_id, page_path)
             DO UPDATE SET
                 page_views = portal_visitor_metric.page_views + 1,
                 unique_visitors = portal_visitor_metric.unique_visitors + EXCLUDED.unique_visitors,
                 updated_at = NOW()`,
            [today, eventId, normalizedPath, isNewUnique]
        );

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error recording portal visit:', err.message);
    } finally {
        client.release();
    }
}

/**
 * Returns aggregated visitor reach and metrics for the coordinator dashboard.
 */
async function getVisitorOverview(eventId) {
    await ensureTables();

    // 1. Today's stats
    const todayViewsRes = await pool.query(
        `SELECT COALESCE(SUM(page_views), 0)::int AS page_views
         FROM portal_visitor_metric
         WHERE metric_date = CURRENT_DATE AND ($1::text IS NULL OR event_id = $1)`,
        [eventId || null]
    );

    const todayVisitorsRes = await pool.query(
        `SELECT COUNT(DISTINCT visitor_hash)::int AS unique_visitors
         FROM portal_daily_visitor_hash
         WHERE metric_date = CURRENT_DATE AND ($1::text IS NULL OR event_id = $1)`,
        [eventId || null]
    );

    // 2. Last 7 Days totals
    const weekViewsRes = await pool.query(
        `SELECT COALESCE(SUM(page_views), 0)::int AS page_views
         FROM portal_visitor_metric
         WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days' AND ($1::text IS NULL OR event_id = $1)`,
        [eventId || null]
    );

    const weekVisitorsRes = await pool.query(
        `SELECT COUNT(DISTINCT visitor_hash)::int AS unique_visitors
         FROM portal_daily_visitor_hash
         WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days' AND ($1::text IS NULL OR event_id = $1)`,
        [eventId || null]
    );

    // 3. Top visited pages (last 7 days)
    const topPagesRes = await pool.query(
        `SELECT page_path, SUM(page_views)::int AS views, SUM(unique_visitors)::int AS uniques
         FROM portal_visitor_metric
         WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days' AND ($1::text IS NULL OR event_id = $1)
         GROUP BY page_path
         ORDER BY views DESC
         LIMIT 6`,
        [eventId || null]
    );

    // 4. Daily trend (last 7 days)
    const trendRes = await pool.query(
        `SELECT m.metric_date::text AS date,
                SUM(m.page_views)::int AS views,
                SUM(m.unique_visitors)::int AS uniques
         FROM portal_visitor_metric m
         WHERE m.metric_date >= CURRENT_DATE - INTERVAL '6 days' AND ($1::text IS NULL OR m.event_id = $1)
         GROUP BY m.metric_date
         ORDER BY m.metric_date ASC`,
        [eventId || null]
    );

    return {
        today: {
            pageViews: todayViewsRes.rows[0]?.page_views || 0,
            views: todayViewsRes.rows[0]?.page_views || 0,
            uniqueVisitors: todayVisitorsRes.rows[0]?.unique_visitors || 0
        },
        last7Days: {
            pageViews: weekViewsRes.rows[0]?.page_views || 0,
            views: weekViewsRes.rows[0]?.page_views || 0,
            uniqueVisitors: weekVisitorsRes.rows[0]?.unique_visitors || 0
        },
        topPages: topPagesRes.rows || [],
        dailyTrend: trendRes.rows || []
    };
}

module.exports = {
    recordVisit,
    getVisitorOverview,
    normalizePath
};
