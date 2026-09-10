const express = require('express');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { requireActor } = require('../../middleware/actor');
const { runNewsCollectorAgent, getAgentIdForEvent } = require('../../services/newsAgent');

const router = express.Router();

/**
 * POST /api/v1/news/agent/run
 * Triggers the AI News Agent crawler/ingestion cycle.
 */
router.post('/agent/run', requireActor('AUTHORITY', 'ADMIN', 'CASE_WORKER'), async (req, res, next) => {
    try {
        const eventId = req.headers['x-disaster-event-id'] || 'EVENT-NP-TIBET-2026';
        const result = await runNewsCollectorAgent(eventId);
        res.status(200).json({
            status: 'SUCCESS',
            message: `AI News Agent completed crawl. Ingested ${result.insertedCount} new items into pending queue.`,
            insertedCount: result.insertedCount,
            schedulePhase: result.phase,
            intervalHours: result.intervalHours,
            nextRunAt: result.nextRunAt,
            items: result.items
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/news/queue
 * Admin & Relief Ops verification hub queue — list pending AI news items.
 */
router.get('/queue', requireActor('AUTHORITY', 'ADMIN', 'CASE_WORKER'), async (req, res, next) => {
    try {
        const eventId = req.headers['x-disaster-event-id'] || 'EVENT-NP-TIBET-2026';
        const statusFilter = req.query.status || 'PENDING_REVIEW';
        
        const result = await pool.query(
            `SELECT news_id, event_id, title, summary, source_name, source_type, source_url,
                    category, credibility_score, proposed_status, status, fetched_at, reviewed_at
             FROM ai_news_item
             WHERE event_id = $1 ${statusFilter === 'ALL' ? '' : 'AND status = $2'}
             ORDER BY fetched_at DESC`,
            statusFilter === 'ALL' ? [eventId] : [eventId, statusFilter]
        );

        res.json(result.rows.map(r => ({
            newsId: r.news_id,
            eventId: r.event_id,
            title: r.title,
            summary: r.summary,
            sourceName: r.source_name,
            sourceType: r.source_type,
            sourceUrl: r.source_url,
            category: r.category,
            credibilityScore: parseFloat(r.credibility_score),
            proposedStatus: r.proposed_status,
            status: r.status,
            fetchedAt: r.fetched_at,
            reviewedAt: r.reviewed_at
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/news/queue/:newsId/review
 * Human-in-the-loop validation endpoint for Admins and Caseworkers.
 * Actions:
 * - PUBLISH_VERIFIED / PUBLISH_UNVERIFIED -> publishes to information_update table.
 * - PUBLISH_RUMOUR -> publishes to disaster_rumour table as rumor correction.
 * - REJECT -> marks as REJECTED.
 */
router.post('/queue/:newsId/review', requireActor('AUTHORITY', 'ADMIN', 'CASE_WORKER'), async (req, res, next) => {
    let client;
    try {
        client = await pool.connect();
    } catch {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const { action, customTitle, customSummary, verificationStatus, responseMessage } = req.body;
        if (!action || !['PUBLISH_VERIFIED', 'PUBLISH_UNVERIFIED', 'PUBLISH_RUMOUR', 'REJECT'].includes(action)) {
            throw new ProblemError('INVALID_SCHEMA', 'valid action is required (PUBLISH_VERIFIED, PUBLISH_UNVERIFIED, PUBLISH_RUMOUR, REJECT)', req.originalUrl);
        }

        const newsRes = await client.query(`SELECT * FROM ai_news_item WHERE news_id = $1`, [req.params.newsId]);
        if (!newsRes.rows.length) {
            throw new ProblemError('NOT_FOUND', 'AI news item not found', req.originalUrl);
        }

        const item = newsRes.rows[0];
        const titleToUse = customTitle || item.title;
        const summaryToUse = customSummary || item.summary;

        await client.query('BEGIN');

        let createdUpdateId = null;
        let createdRumourId = null;

        if (action === 'PUBLISH_VERIFIED' || action === 'PUBLISH_UNVERIFIED') {
            const statusToSet = action === 'PUBLISH_VERIFIED' ? 'VERIFIED' : 'UNVERIFIED';
            
            const updateRes = await client.query(
                `INSERT INTO information_update
                    (event_id, information_type, content, translations, verification_status, audience, visibility_level, created_by)
                 VALUES ($1, $2, $3, $4, $5, 'EVENT', 'PUBLIC', $6) RETURNING information_id`,
                [
                    item.event_id,
                    item.category || 'STATUS_UPDATE',
                    `${titleToUse}\n\n${summaryToUse}\n\nReported by ${item.source_name}. Source: ${item.source_url || 'Verified Channel'}`,
                    JSON.stringify(item.translations || {}),
                    statusToSet,
                    req.actor.actorId || null
                ]
            );
            createdUpdateId = updateRes.rows[0].information_id;

            await client.query(
                `UPDATE ai_news_item
                 SET status = 'PUBLISHED', published_as_update_id = $1, reviewed_at = now()
                 WHERE news_id = $2`,
                [createdUpdateId, req.params.newsId]
            );
        } else if (action === 'PUBLISH_RUMOUR') {
            const statusToSet = verificationStatus || 'FALSE';
            const rumourRes = await client.query(
                `INSERT INTO disaster_rumour
                    (event_id, claim, source, verification_status, response_message, publication_status, created_by, resolved_at)
                 VALUES ($1, $2, $3, $4, $5, 'BROADCASTED', $6, now()) RETURNING rumour_id`,
                [
                    item.event_id,
                    titleToUse,
                    item.source_name,
                    statusToSet,
                    responseMessage || summaryToUse,
                    req.actor.actorId || null
                ]
            );
            createdRumourId = rumourRes.rows[0].rumour_id;

            await client.query(
                `UPDATE ai_news_item
                 SET status = 'CONVERTED_TO_RUMOUR', published_as_rumour_id = $1, reviewed_at = now()
                 WHERE news_id = $2`,
                [createdRumourId, req.params.newsId]
            );
        } else if (action === 'REJECT') {
            await client.query(
                `UPDATE ai_news_item SET status = 'REJECTED', reviewed_at = now() WHERE news_id = $1`,
                [req.params.newsId]
            );
        }

        await writeAuditEvent(client, {
            actor: req.actor.actorId || 'HUMAN_ADMIN',
            action: 'NEWS_ITEM_REVIEWED',
            entityType: 'AiNewsItem',
            entityId: req.params.newsId,
            newState: { action, createdUpdateId, createdRumourId },
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        res.json({
            newsId: req.params.newsId,
            action,
            publishedAsUpdateId: createdUpdateId,
            publishedAsRumourId: createdRumourId,
            message: `News item successfully reviewed and processed via ${action}.`
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/news/public
 * Public feed for verified news & event updates (`information.html`, `index.html`).
 */
router.get('/public', async (req, res, next) => {
    try {
        const eventId = req.headers['x-disaster-event-id'] || 'EVENT-NP-TIBET-2026';
        const categoryFilter = req.query.category;
        const sourceTypeFilter = req.query.sourceType;

        let query = `
            SELECT i.information_id, i.content, i.translations, i.verification_status, i.created_at, i.verified_at,
                   n.title, n.summary, n.source_name, n.source_type, n.source_url, n.category, n.translations AS news_translations
            FROM information_update i
            LEFT JOIN ai_news_item n ON i.information_id = n.published_as_update_id
            WHERE i.event_id = $1 AND i.audience = 'EVENT'
        `;
        const params = [eventId];

        if (categoryFilter && categoryFilter !== 'ALL') {
            params.push(categoryFilter);
            query += ` AND n.category = $${params.length}`;
        }

        if (sourceTypeFilter && sourceTypeFilter !== 'ALL') {
            params.push(sourceTypeFilter);
            query += ` AND n.source_type = $${params.length}`;
        }

        query += ` ORDER BY i.created_at DESC LIMIT 50`;

        const result = await pool.query(query, params);

        res.json(result.rows.map(r => ({
            informationId: r.information_id,
            title: r.title || r.content.split('\n\n')[0] || 'Event Update',
            summary: r.summary || r.content.split('\n\n')[1] || r.content,
            content: r.content,
            translations: r.translations || r.news_translations || {},
            sourceName: r.source_name || 'Official Authority',
            sourceType: r.source_type || 'OFFICIAL_AUTHORITY',
            sourceUrl: r.source_url || '#',
            category: r.category || 'RESCUE',
            verificationStatus: r.verification_status,
            createdAt: r.created_at,
            verifiedAt: r.verified_at
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/news/partner-updates
 * Public feed for Partner & Relief Agency Updates (`partner-updates.html`).
 */
router.get('/partner-updates', async (req, res, next) => {
    try {
        const eventId = req.headers['x-disaster-event-id'] || 'EVENT-NP-TIBET-2026';
        
        const result = await pool.query(
            `SELECT n.news_id, n.title, n.summary, n.source_name, n.source_type, n.source_url, n.category, n.fetched_at,
                    i.verification_status, i.created_at
             FROM ai_news_item n
             LEFT JOIN information_update i ON n.published_as_update_id = i.information_id
             WHERE n.event_id = $1 AND n.source_type IN ('OFFICIAL_AUTHORITY', 'POLICE', 'CONSULAR', 'AID_AGENCY', 'HOSPITAL')
               AND n.status = 'PUBLISHED'
             ORDER BY n.fetched_at DESC LIMIT 50`,
            [eventId]
        );

        res.json(result.rows.map(r => ({
            newsId: r.news_id,
            title: r.title,
            summary: r.summary,
            sourceName: r.source_name,
            sourceType: r.source_type,
            sourceUrl: r.source_url,
            category: r.category,
            verificationStatus: r.verification_status || 'VERIFIED',
            publishedAt: r.created_at || r.fetched_at
        })));
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/v1/news/schedule
 * Get current AI agent schedule settings for the active event.
 */
router.get('/schedule', async (req, res, next) => {
    try {
        const eventId = req.headers['x-disaster-event-id'] || 'EVENT-NP-TIBET-2026';
        const agentId = getAgentIdForEvent(eventId);
        const result = await pool.query(
            `SELECT agent_id, event_id, current_phase, interval_hours, last_run_at, next_run_at, items_ingested_count
             FROM ai_agent_schedule WHERE agent_id = $1`,
            [agentId]
        );
        if (!result.rows.length) {
            return res.json({
                agentId,
                eventId,
                currentPhase: 'WEEK_1',
                intervalHours: 6,
                lastRunAt: null,
                nextRunAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
                itemsIngestedCount: 0
            });
        }
        const r = result.rows[0];
        res.json({
            agentId: r.agent_id,
            eventId: r.event_id,
            currentPhase: r.current_phase,
            intervalHours: r.interval_hours,
            lastRunAt: r.last_run_at,
            nextRunAt: r.next_run_at,
            itemsIngestedCount: r.items_ingested_count
        });
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/v1/news/schedule
 * Update AI agent schedule settings (e.g. switch between Week 1 [6h] and Weeks 2-5 [24h] mode).
 */
router.put('/schedule', requireActor('AUTHORITY', 'ADMIN'), async (req, res, next) => {
    try {
        const eventId = req.headers['x-disaster-event-id'] || 'EVENT-NP-TIBET-2026';
        const agentId = getAgentIdForEvent(eventId);
        const { currentPhase, intervalHours } = req.body;
        const phaseToSet = currentPhase || 'WEEK_1';
        const hoursToSet = intervalHours || (phaseToSet === 'WEEK_1' ? 6 : 24);
        const nextRun = new Date(Date.now() + hoursToSet * 60 * 60 * 1000).toISOString();

        await pool.query(
            `INSERT INTO ai_agent_schedule
                (agent_id, event_id, current_phase, interval_hours, next_run_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (agent_id) DO UPDATE SET
                event_id = EXCLUDED.event_id,
                current_phase = EXCLUDED.current_phase,
                interval_hours = EXCLUDED.interval_hours,
                next_run_at = EXCLUDED.next_run_at`,
            [agentId, eventId, phaseToSet, hoursToSet, nextRun]
        );

        res.json({
            agentId,
            eventId,
            currentPhase: phaseToSet,
            intervalHours: hoursToSet,
            nextRunAt: nextRun,
            message: `AI Agent schedule successfully updated to ${phaseToSet} (${hoursToSet}-hour cycle).`
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
