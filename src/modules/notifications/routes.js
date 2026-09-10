const express = require('express');
const { pool } = require('../../db');
const { requireActor } = require('../../middleware/actor');

const router = express.Router({ mergeParams: true });

/**
 * GET /api/v1/cases/:caseId/notifications
 * Companion read path so the Family Dashboard (SPEC-006 §4/§7) can show
 * delivery status without ever exposing message bodies that might carry
 * restricted content — only metadata is returned here.
 */
router.get('/:caseId/notifications', requireActor('CASE_WORKER', 'AUTHORITY', 'PARTNER', 'FAMILY'), async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT notification_id, notification_type, channel, priority, sent_at, delivered_at, acknowledged_at, status
             FROM notification WHERE case_id = $1 ORDER BY sent_at DESC NULLS LAST LIMIT 50`,
            [req.params.caseId],
        );
        res.json(result.rows.map((r) => ({
            notificationId: r.notification_id,
            type: r.notification_type,
            channel: r.channel,
            priority: r.priority,
            sentAt: r.sent_at,
            deliveredAt: r.delivered_at,
            acknowledgedAt: r.acknowledged_at,
            status: r.status,
        })));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
