const express = require('express');
const { pool } = require('../../db');

const router = express.Router();

/**
 * GET /api/v1/events/active
 * Returns a list of all active disaster events.
 */
router.get('/active', async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT event_id, name, country, region, event_type, status, modules
            FROM disaster_event
            WHERE status = 'ACTIVE'
            ORDER BY created_at DESC
        `);
        res.json({ events: result.rows });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
