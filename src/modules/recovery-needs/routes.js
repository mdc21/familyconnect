/**
 * SPEC-008 — Community Recovery Express Routes
 */

const express = require('express');
const router = express.Router();
const needsService = require('./needsService');
const { requireActor } = require('../../middleware/actor');
const { requireAssuranceLevel } = require('../../middleware/assurance');
const { ProblemError } = require('../../middleware/problems');
const { pool } = require('../../db');

// 1. POST /api/v1/submissions/recovery-needs — Public / Family need submission
router.post('/submissions/recovery-needs', async (req, res, next) => {
    try {
        const {
            eventId,
            originatingRequestId,
            category,
            location,
            affectedPopulation,
            severity,
            narrative,
            evidence
        } = req.body || {};

        if (!category || !narrative) {
            return next(new ProblemError(
                'INVALID_SCHEMA',
                'category and narrative are required fields for recovery needs.',
                req.originalUrl
            ));
        }

        const need = await needsService.submitNeed({
            eventId: eventId || 'EVENT-NP-TIBET-2026',
            originatingRequestId,
            category,
            location,
            affectedPopulation,
            severity,
            narrative,
            evidence,
            actor: req.actor || {}
        });

        res.status(201).json({
            message: 'Recovery need reported successfully.',
            need
        });
    } catch (err) {
        next(err);
    }
});

// 2a. GET /api/v1/recovery-needs — Query recovery needs with status & locality filters
router.get('/recovery-needs', async (req, res, next) => {
    try {
        const { status, category, community_id, eventId } = req.query;
        const isPrivileged = req.actor && ['CASE_WORKER', 'AUTHORITY', 'ADMIN'].includes(req.actor.actorClass);
        
        let query = 'SELECT * FROM recovery_need WHERE 1=1';
        const params = [];

        // Shield disputed/restricted needs from general public (SPEC-004 & SPEC-008)
        if (!isPrivileged) {
            query += " AND (data_sharing_status IS NULL OR data_sharing_status != 'RESTRICTED_PENDING_REVIEW')";
        }

        if (status && status !== 'ALL') {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }
        if (category) {
            params.push(category);
            query += ` AND category = $${params.length}`;
        }
        if (community_id) {
            params.push(community_id);
            query += ` AND (location->>'communityId' = $${params.length} OR location->>'district' = $${params.length})`;
        }
        if (eventId) {
            params.push(eventId);
            query += ` AND event_id = $${params.length}`;
        }

        query += ' ORDER BY created_at DESC LIMIT 100';

        const result = await pool.query(query, params);
        res.json({
            needs: result.rows.map(r => ({
                needId: r.need_id,
                needReference: r.need_id.substring(0, 8).toUpperCase(),
                eventId: r.event_id,
                category: r.category,
                status: r.status,
                verificationState: r.verification_state,
                dataSharingStatus: r.data_sharing_status,
                urgency: r.severity || 'MEDIUM',
                title: r.category ? r.category.replace(/_/g, ' ') : 'Community Recovery Need',
                description: r.narrative,
                location: r.location,
                locality: r.location?.district || r.location?.address || 'Affected Zone',
                affectedPopulation: r.affected_population,
                createdAt: r.created_at,
                updatedAt: r.updated_at
            }))
        });
    } catch (err) {
        next(err);
    }
});

// 2b. GET /api/v1/recovery-needs/:id — Retrieve permitted need details
router.get('/recovery-needs/:id', async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT * FROM recovery_need WHERE need_id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                type: 'https://api.familyconnect.org/v1/problems/resource-not-found',
                title: 'Recovery Need Not Found',
                status: 404,
                code: 'FC_ERR_404_NOT_FOUND'
            });
        }

        const need = result.rows[0];

        // ABAC / Safeguarding check: If RESTRICTED_PENDING_REVIEW, shield from general public
        if (need.data_sharing_status === 'RESTRICTED_PENDING_REVIEW') {
            const allowed = ['CASE_WORKER', 'AUTHORITY', 'ADMIN'];
            if (!req.actor || !allowed.includes(req.actor.actorClass)) {
                return res.status(404).json({
                    type: 'https://api.familyconnect.org/v1/problems/resource-not-found',
                    title: 'Not Found',
                    status: 404,
                    code: 'FC_ERR_404_NOT_FOUND'
                });
            }
        }

        res.json({ need });
    } catch (err) {
        next(err);
    }
});

// 3. POST /api/v1/recovery-needs/:id/assess — Case Worker assessment
router.post('/recovery-needs/:id/assess', requireActor('CASE_WORKER', 'AUTHORITY', 'ADMIN'), async (req, res, next) => {
    try {
        const { note } = req.body || {};
        const updated = await needsService.transitionStatus({
            needId: req.params.id,
            targetStatus: 'ASSESSED',
            actor: req.actor,
            note: note || 'Need assessed by caseworker.'
        });
        res.json({ message: 'Need successfully assessed.', need: updated });
    } catch (err) {
        next(err);
    }
});

// 4. POST /api/v1/recovery-needs/:id/verify — Authority verification
router.post('/recovery-needs/:id/verify', requireActor('AUTHORITY', 'ADMIN'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
    try {
        const { note } = req.body || {};
        const updated = await needsService.transitionStatus({
            needId: req.params.id,
            targetStatus: 'VERIFIED',
            actor: req.actor,
            note: note || 'Need verified by competent authority.'
        });
        res.json({ message: 'Need successfully verified.', need: updated });
    } catch (err) {
        next(err);
    }
});

// 5. POST /api/v1/recovery-needs/:id/assign — Coordinator assignment
router.post('/recovery-needs/:id/assign', requireActor('AUTHORITY', 'CASE_WORKER', 'ADMIN'), async (req, res, next) => {
    try {
        const { assignedTo, targetDate, note } = req.body || {};
        if (!assignedTo) {
            return next(new ProblemError('INVALID_SCHEMA', 'assignedTo is required.', req.originalUrl));
        }

        await pool.query(
            'UPDATE recovery_need SET assigned_to = $1, target_completion_date = $2 WHERE need_id = $3',
            [assignedTo, targetDate || null, req.params.id]
        );

        const updated = await needsService.transitionStatus({
            needId: req.params.id,
            targetStatus: 'ASSIGNED',
            actor: req.actor,
            note: note || `Assigned to ${assignedTo}`
        });

        res.json({ message: 'Need assigned successfully.', need: updated });
    } catch (err) {
        next(err);
    }
});

// 6. POST /api/v1/recovery-needs/:id/disputes — File dispute / correction
router.post('/recovery-needs/:id/disputes', async (req, res, next) => {
    try {
        const { reason, evidence } = req.body || {};
        if (!reason) {
            return next(new ProblemError('INVALID_SCHEMA', 'reason is required to dispute information.', req.originalUrl));
        }

        const updated = await needsService.fileDispute({
            needId: req.params.id,
            actor: req.actor || { actorClass: 'PUBLIC' },
            reason,
            evidence
        });

        res.status(200).json({
            message: 'Dispute recorded. Information shifted to RESTRICTED_PENDING_REVIEW.',
            need: updated
        });
    } catch (err) {
        next(err);
    }
});

// 7. GET /api/v1/communities — List active disaster communities
router.get('/communities', async (req, res, next) => {
    try {
        const { eventId } = req.query;
        let query = 'SELECT community_id, name, event_id, admin_hierarchy, population_estimate, min_aggregation_threshold, min_aggregation_threshold_met FROM community_profile';
        const params = [];
        if (eventId) {
            query += ' WHERE event_id = $1';
            params.push(eventId);
        }
        query += ' ORDER BY name ASC';
        const result = await pool.query(query, params);
        res.json({
            communities: result.rows.map(r => ({
                communityId: r.community_id,
                name: r.name,
                eventId: r.event_id,
                adminHierarchy: r.admin_hierarchy,
                populationEstimate: r.population_estimate,
                thresholdMet: r.min_aggregation_threshold_met
            }))
        });
    } catch (err) {
        next(err);
    }
});

// 8. GET /api/v1/communities/:id/recovery-summary — Public community summary (enforces BR-008-013)
router.get('/communities/:id/recovery-summary', async (req, res, next) => {
    try {
        const summary = await needsService.getCommunitySummary(req.params.id);
        res.json(summary);
    } catch (err) {
        if (err.code === 'NOT_FOUND') {
            return res.status(404).json({
                type: 'https://api.familyconnect.org/v1/problems/resource-not-found',
                title: 'Community Not Found',
                status: 404,
                code: 'FC_ERR_404_NOT_FOUND'
            });
        }
        next(err);
    }
});

module.exports = router;
