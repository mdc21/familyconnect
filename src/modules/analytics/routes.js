const express = require('express');
const { getVisitorOverview, recordVisit } = require('../../services/analytics/visitorService');
const { publicReadLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

/**
 * GET /api/v1/analytics/overview
 * Returns visitor reach and page view statistics for the active disaster event.
 * Accessible to coordinator consoles and administrative dashboards.
 */
router.get('/overview', publicReadLimiter, async (req, res, next) => {
    try {
        const eventId = req.query.eventId || req.disasterEventId || 'EVENT-NP-TIBET-2026';
        const metrics = await getVisitorOverview(eventId);
        res.json({
            eventId,
            ...metrics
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/v1/analytics/beacon
 * Optional beacon endpoint for single-page applications or explicit page visit pings.
 */
router.post('/beacon', async (req, res, next) => {
    try {
        const { eventId = 'EVENT-NP-TIBET-2026', pagePath = '/index.html' } = req.body || {};
        let clientIp = req.get('x-forwarded-for') || req.ip || req.socket.remoteAddress || '127.0.0.1';
        if (clientIp.includes(',')) {
            clientIp = clientIp.split(',')[0].trim();
        }

        await recordVisit({ eventId, pagePath, clientIp });
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

module.exports = router;
