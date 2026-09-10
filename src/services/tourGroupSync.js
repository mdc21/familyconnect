/**
 * Maps a Case status transition onto TourGroupMember.manifestStatus.
 * Only fires for terminal/near-terminal case outcomes — an ACTIVE case
 * (still being worked) maps to MISSING because that's the honest
 * manifest state for "not yet accounted for", not because ACTIVE always
 * means missing in general.
 */
const CASE_STATUS_TO_MANIFEST_STATUS = {
    ACTIVE: 'MISSING',
    SAFE_CONFIRMED: 'SAFE',
    HOSPITALISED: 'SAFE',
    DECEASED: 'DECEASED',
};

/**
 * Call within the same transaction as the case status UPDATE so the
 * manifest rollup never observes an intermediate, inconsistent state.
 * Fixes the Phase 3 follow-up: previously a tour-group member's
 * manifest_status only changed via an explicit
 * POST .../members/{id}/status call, even after the linked case's own
 * status moved on independently.
 */
async function syncTourGroupManifestFromCase(client, caseId, newCaseStatus) {
    const manifestStatus = CASE_STATUS_TO_MANIFEST_STATUS[newCaseStatus];
    if (!manifestStatus) return { updated: 0 };
    const result = await client.query(
        `UPDATE tour_group_member SET manifest_status = $1
         WHERE linked_case_id = $2 AND manifest_status IS DISTINCT FROM $1`,
        [manifestStatus, caseId],
    );
    return { updated: result.rowCount };
}

module.exports = { syncTourGroupManifestFromCase, CASE_STATUS_TO_MANIFEST_STATUS };
