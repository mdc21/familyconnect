/**
 * Deployer Agent — Handles staging preview and production deployment of generated event portals.
 * 
 * Workflow:
 * 1. Builder Agent generates artifacts in 'draft' status.
 * 2. Deployer Agent provides staging preview URL and artifact list for human review.
 * 3. Human admin reviews preview, approves or rejects via console.
 * 4. Upon approval, Deployer Agent activates the event into `disaster_event` table.
 */

const { pool, writeAuditEvent } = require('../../db');

/**
 * Get preview context and status for a detected event
 */
async function getEventPreview(detectionId) {
  const eventRes = await pool.query(
    `SELECT de.*, de.detection_id as id,
            json_agg(ga.*) FILTER (WHERE ga.artifact_id IS NOT NULL) as artifacts,
            json_agg(ema.*) FILTER (WHERE ema.module_id IS NOT NULL) as module_activations
     FROM detected_event de
     LEFT JOIN generated_artifact ga ON ga.detection_id = de.detection_id
     LEFT JOIN event_module_activation ema ON ema.detection_id = de.detection_id
     WHERE de.detection_id = $1
     GROUP BY de.detection_id`,
    [detectionId]
  );

  if (eventRes.rows.length === 0) {
    throw new Error(`Detected event ${detectionId} not found`);
  }

  const event = eventRes.rows[0];

  // Fetch human review logs
  const reviewRes = await pool.query(
    `SELECT * FROM event_review WHERE detection_id = $1 ORDER BY created_at DESC`,
    [detectionId]
  );

  return {
    event,
    artifacts: event.artifacts || [],
    moduleActivations: event.module_activations || [],
    reviews: reviewRes.rows
  };
}

/**
 * Submit human review (Approve or Reject) for a generated event portal
 */
async function submitEventReview({ detectedEventId, reviewerId, reviewerName, action, comments, customModifications = {} }) {
  if (!['APPROVED', 'REJECTED', 'NEEDS_REVISION'].includes(action)) {
    throw new Error(`Invalid action: ${action}. Must be APPROVED, REJECTED, or NEEDS_REVISION`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Record review entry
    const reviewRes = await client.query(
      `INSERT INTO event_review (detection_id, reviewer, action, notes, changes_made)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [detectedEventId, `${reviewerName} (${reviewerId})`, action, comments || '', JSON.stringify(customModifications)]
    );

    let newStatus = 'REVIEW_REQUIRED';
    if (action === 'APPROVED') {
      newStatus = 'APPROVED';
    } else if (action === 'REJECTED') {
      newStatus = 'REJECTED';
    } else if (action === 'NEEDS_REVISION') {
      newStatus = 'PLANNED'; // trigger re-planning / rebuilding
    }

    await client.query(
      `UPDATE detected_event SET status = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE detection_id = $3`,
      [newStatus, reviewerName, detectedEventId]
    );

    // Audit log
    await writeAuditEvent(client, {
      actor: reviewerName,
      action: `EVENT_ORCHESTRATOR_REVIEW_${action}`,
      entityType: 'DetectedEvent',
      entityId: detectedEventId,
      newState: { action, comments },
      outcome: 'SUCCESS'
    });

    await client.query('COMMIT');
    return reviewRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deploy an approved event portal to production
 */
async function deployEventToProduction(detectedEventId, activatedByUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify detected event status
    const eventRes = await client.query(
      `SELECT * FROM detected_event WHERE detection_id = $1`,
      [detectedEventId]
    );

    if (eventRes.rows.length === 0) {
      throw new Error(`Detected event ${detectedEventId} not found`);
    }

    const event = eventRes.rows[0];
    if (event.status !== 'APPROVED') {
      throw new Error(`Cannot deploy event ${detectedEventId} with status ${event.status}. Must be APPROVED.`);
    }

    const manifest = event.module_manifest || {};
    const eventCode = manifest.eventId || event.event_id || `EVENT-${event.country}-${Date.now()}`;

    // 2. Insert or update disaster_event table
    const disasterRes = await client.query(
      `INSERT INTO disaster_event 
       (event_id, name, country, region, event_type, status, modules, languages)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)
       ON CONFLICT (event_id) DO UPDATE
       SET name = EXCLUDED.name,
           status = 'ACTIVE',
           modules = EXCLUDED.modules,
           languages = EXCLUDED.languages
       RETURNING *`,
      [
        eventCode,
        event.title,
        event.country,
        event.region,
        event.event_type,
        JSON.stringify(manifest.activatedModules || []),
        manifest.languages || ['en']
      ]
    );

    // 3. Mark detected event as DEPLOYED
    await client.query(
      `UPDATE detected_event SET status = 'DEPLOYED', event_id = $1 WHERE detection_id = $2`,
      [eventCode, detectedEventId]
    );

    // Audit log
    await writeAuditEvent(client, {
      actor: activatedByUserId || 'ADMIN',
      action: 'EVENT_ORCHESTRATOR_DEPLOYED',
      entityType: 'DisasterEvent',
      entityId: eventCode,
      newState: { detectedEventId, eventCode },
      outcome: 'SUCCESS'
    });

    await client.query('COMMIT');

    return {
      success: true,
      disasterEvent: disasterRes.rows[0],
      message: `Event ${eventCode} successfully deployed to production.`
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getEventPreview,
  submitEventReview,
  deployEventToProduction
};
