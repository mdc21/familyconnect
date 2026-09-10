/**
 * Agentic AI Event Orchestrator — Express Routes
 * 
 * Endpoints:
 * - GET  /api/v1/orchestrator/modules          List module registry catalog
 * - GET  /api/v1/orchestrator/events           List detected disaster events
 * - POST /api/v1/orchestrator/scan             Trigger Sentinel Agent feed scan
 * - POST /api/v1/orchestrator/plan             Trigger Planner Agent (module selection)
 * - POST /api/v1/orchestrator/build            Trigger Builder Agent (artifact generation)
 * - GET  /api/v1/orchestrator/preview/:id      Get staging preview details & artifacts
 * - POST /api/v1/orchestrator/review/:id       Human approval / rejection of event portal
 * - POST /api/v1/orchestrator/deploy/:id       Deploy approved portal to production
 */

const express = require('express');
const router = express.Router();
const moduleRegistry = require('../../services/orchestrator/moduleRegistry');
const sentinelAgent = require('../../services/orchestrator/sentinelAgent');
const plannerAgent = require('../../services/orchestrator/plannerAgent');
const builderAgent = require('../../services/orchestrator/builderAgent');
const deployerAgent = require('../../services/orchestrator/deployerAgent');
const { requireActor } = require('../../middleware/actor');
const { requireAssuranceLevel } = require('../../middleware/assurance');
const { ProblemError } = require('../../middleware/problems');

// 1. GET /api/v1/orchestrator/modules — List catalog (public read-only reference)
router.get('/modules', async (req, res, next) => {
  try {
    const modules = await moduleRegistry.getAllModules();
    res.json({ modules });
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/v1/orchestrator/events — List detected events
router.get('/events', requireActor('ADMIN', 'AUTHORITY', 'CASE_WORKER'), async (req, res, next) => {
  try {
    const events = await sentinelAgent.listDetectedEvents(req.query.status);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/v1/orchestrator/scan — Trigger Sentinel Agent scan
router.post('/scan', requireActor('ADMIN', 'AUTHORITY'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
  try {
    const detectedEvents = await sentinelAgent.scanFeeds();
    res.json({
      message: `Sentinel Agent scan complete. Detected ${detectedEvents.length} new event(s).`,
      events: detectedEvents
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/v1/orchestrator/plan — Trigger Planner Agent
router.post('/plan', requireActor('ADMIN', 'AUTHORITY'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
  try {
    const { detectedEventId, customModuleKeys } = req.body || {};
    if (!detectedEventId) {
      return next(new ProblemError('INVALID_SCHEMA', 'detectedEventId is required', req.originalUrl));
    }
    const result = await plannerAgent.planEventPortal(detectedEventId, customModuleKeys);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/v1/orchestrator/build — Trigger Builder Agent
router.post('/build', requireActor('ADMIN', 'AUTHORITY'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
  try {
    const { detectedEventId } = req.body || {};
    if (!detectedEventId) {
      return next(new ProblemError('INVALID_SCHEMA', 'detectedEventId is required', req.originalUrl));
    }
    const result = await builderAgent.buildEventPortal(detectedEventId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 6. GET /api/v1/orchestrator/preview/:id — Fetch staging preview
router.get('/preview/:id', requireActor('ADMIN', 'AUTHORITY', 'CASE_WORKER'), async (req, res, next) => {
  try {
    const preview = await deployerAgent.getEventPreview(req.params.id);
    res.json(preview);
  } catch (err) {
    next(err);
  }
});

// 7. POST /api/v1/orchestrator/review/:id — Submit human review
router.post('/review/:id', requireActor('ADMIN', 'AUTHORITY'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
  try {
    const { action, comments, customModifications } = req.body || {};
    const reviewerId = req.actor?.actorId || 'admin-user';
    const reviewerName = req.actor?.actorId ? `Coordinator ${req.actor.actorId}` : 'Portal Administrator';

    const review = await deployerAgent.submitEventReview({
      detectedEventId: req.params.id,
      reviewerId,
      reviewerName,
      action,
      comments,
      customModifications
    });

    res.json({ message: `Review registered successfully with action ${action}`, review });
  } catch (err) {
    next(err);
  }
});

// 8. POST /api/v1/orchestrator/deploy/:id — Deploy to production (requires IAL-2)
router.post('/deploy/:id', requireActor('ADMIN', 'AUTHORITY'), requireAssuranceLevel('IAL-2'), async (req, res, next) => {
  try {
    const activatedByUserId = req.actor?.actorId || 'admin-user';
    const result = await deployerAgent.deployEventToProduction(req.params.id, activatedByUserId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
