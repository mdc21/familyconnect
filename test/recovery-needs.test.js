/**
 * Test Suite: SPEC-008 Community Recovery & Reconstruction Coordination
 * Quality Gates Tested:
 * - RecoveryNeed lifecycle state transitions (§5.1)
 * - Anti-silent-merge duplicate detection queue (FR-008-020 / BR-008-004)
 * - Information integrity dispute workflow (FR-008-011)
 * - Locality privacy disclosure threshold (BR-008-013)
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/db');
const needsService = require('../src/modules/recovery-needs/needsService');

describe('SPEC-008 Community Recovery & Need Lifecycle', () => {
    let testEventId = 'EVENT-NP-TIBET-2026';
    let testNeedId = null;

    before(async () => {
        // Setup two test communities: one small (below threshold 25), one large (above threshold)
        await pool.query(`
            INSERT INTO community_profile (community_id, name, event_id, population_estimate, min_aggregation_threshold)
            VALUES 
                ('COMM-TINY-VILLAGE', 'High Pass Hamlet', '${testEventId}', 12, 25),
                ('COMM-VALLEY-CENTRE', 'Valley District Hub', '${testEventId}', 150, 25)
            ON CONFLICT (community_id) DO UPDATE 
            SET population_estimate = EXCLUDED.population_estimate
        `);
    });

    it('FR-008-001 / FR-008-002: Public need submission with provenance', async () => {
        const need = await needsService.submitNeed({
            eventId: testEventId,
            category: 'TEMPORARY_SHELTER',
            location: { communityId: 'COMM-VALLEY-CENTRE', gps: [27.7, 85.3] },
            affectedPopulation: 6,
            severity: 'HIGH',
            narrative: 'Roof collapsed from flooding; family of 6 seeking waterproof tarpaulins.',
            evidence: [{ type: 'PHOTO', ref: 'https://cdn.familyconnect.org/evidence/roof1.jpg' }],
            actor: { actorClass: 'PUBLIC', actorId: 'public-reporter-101' }
        });

        assert.ok(need.need_id);
        assert.equal(need.status, 'REPORTED');
        assert.equal(need.verification_state, 'UNVERIFIED');
        assert.equal(need.data_sharing_status, 'NORMAL');
        assert.equal(need.provenance.actorClass, 'PUBLIC');
        testNeedId = need.need_id;
    });

    it('FR-008-020 / BR-008-004: Potential duplicate is queued for review without silent merge', async () => {
        // Submit another need with same category in same event
        const dupNeed = await needsService.submitNeed({
            eventId: testEventId,
            category: 'TEMPORARY_SHELTER',
            location: { communityId: 'COMM-VALLEY-CENTRE' },
            affectedPopulation: 4,
            severity: 'HIGH',
            narrative: 'Need emergency tarpaulin shelter for family.',
            actor: { actorClass: 'PUBLIC', actorId: 'neighbor-reporting' }
        });

        // Check candidate duplicate queue
        const candidates = await pool.query(
            'SELECT * FROM need_duplicate_candidate WHERE need_id_a = $1 OR need_id_b = $1',
            [dupNeed.need_id]
        );

        assert.ok(candidates.rows.length >= 1, 'Duplicate candidate must be recorded in review queue');
        assert.equal(candidates.rows[0].status, 'PENDING_REVIEW');
        assert.notEqual(dupNeed.need_id, testNeedId, 'Must not overwrite original need record');
    });

    it('Lifecycle State Machine: REPORTED -> ASSESSED -> VERIFIED -> ASSIGNED', async () => {
        // Case worker assesses
        const assessed = await needsService.transitionStatus({
            needId: testNeedId,
            targetStatus: 'ASSESSED',
            actor: { actorClass: 'CASE_WORKER', actorId: 'cw-ramesh' }
        });
        assert.equal(assessed.status, 'ASSESSED');

        // Authority verifies
        const verified = await needsService.transitionStatus({
            needId: testNeedId,
            targetStatus: 'VERIFIED',
            actor: { actorClass: 'AUTHORITY', actorId: 'gov-coordinator-sita' }
        });
        assert.equal(verified.status, 'VERIFIED');

        // Coordinator assigns
        const assigned = await needsService.transitionStatus({
            needId: testNeedId,
            targetStatus: 'ASSIGNED',
            actor: { actorClass: 'CASE_WORKER', actorId: 'cw-ramesh' },
            note: 'Assigned to Red Cross Shelter Team'
        });
        assert.equal(assigned.status, 'ASSIGNED');
    });

    it('FR-008-011: Dispute shifts need to RESTRICTED_PENDING_REVIEW and triggers escalation', async () => {
        const disputed = await needsService.fileDispute({
            needId: testNeedId,
            actor: { actorClass: 'FAMILY', actorId: 'family-member-02' },
            reason: 'Assistance request duplicate claimed by non-resident contractor.',
            evidence: [{ type: 'LAND_DOC', id: 'DOC-123' }]
        });

        assert.equal(disputed.data_sharing_status, 'RESTRICTED_PENDING_REVIEW');

        // Verify escalation logged
        const esc = await pool.query(
            `SELECT * FROM escalation WHERE trigger = $1`,
            [`DISPUTE_FILED_NEED_${testNeedId}`]
        );
        assert.equal(esc.rows.length, 1);
        assert.equal(esc.rows[0].impact_class, 'L3');
    });

    it('BR-008-013: Locality threshold enforcement suppresses counts for low-population communities', async () => {
        // Community with population 12 (< 25)
        const tinySummary = await needsService.getCommunitySummary('COMM-TINY-VILLAGE');
        assert.equal(tinySummary.thresholdMet, false);
        assert.equal(tinySummary.metrics.totalReportedNeeds, 'SUPPRESSED');
        assert.ok(tinySummary.disclosureWarning.includes('BR-008-013'));

        // Community with population 150 (>= 25)
        const normalSummary = await needsService.getCommunitySummary('COMM-VALLEY-CENTRE');
        assert.equal(normalSummary.thresholdMet, true);
        assert.equal(typeof normalSummary.metrics.totalReportedNeeds, 'number');
    });
});
