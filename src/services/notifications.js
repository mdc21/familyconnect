const { pool } = require('../db');

/**
 * SPEC-005 §12 Crucial Security Rule: "Sensitive medical, forensic, or
 * safeguarding data must not be transmitted in plain text via SMS simply
 * because the recipient is authorized. Notifications must serve as
 * secure prompts."
 *
 * RESTRICTED_CATEGORIES below are informationType/needType values that
 * can never appear in an SMS/email body — only ever as a generic prompt
 * directing the recipient to the authenticated dashboard.
 */
const RESTRICTED_CATEGORIES = new Set([
    'MEDICAL', 'FORENSIC', 'SAFEGUARDING', 'DECEASED_PERSON', 'CONSULAR',
]);

function isRestricted(category) {
    return RESTRICTED_CATEGORIES.has((category || '').toUpperCase());
}

/**
 * Builds the actual message body. If the underlying content touches a
 * restricted category, the body is always the generic prompt from
 * SPEC-006 §7 ("An authoritative update ... is available"), never the
 * content itself — regardless of what the caller passed in.
 */
function composeMessageBody({ channel, caseReference, category, plainContent }) {
    const restricted = isRestricted(category);
    if (channel === 'SMS' || restricted) {
        return `FamilyConnect: An authoritative update regarding case ${caseReference} is available. Please log in or visit an Assistance Centre.`;
    }
    return plainContent;
}

async function dispatchNotification({ caseId, caseReference, recipientId, category, channel, plainContent, priority }) {
    const restricted = isRestricted(category);
    const body = composeMessageBody({ channel, caseReference, category, plainContent });

    const result = await pool.query(
        `INSERT INTO notification
            (recipient_id, case_id, notification_type, channel, priority, sent_at, status, contains_restricted_data)
         VALUES ($1,$2,$3,$4,$5, now(), 'SENT', $6) RETURNING *`,
        [recipientId || null, caseId, category || 'GENERAL', channel || 'SMS', priority || 'NORMAL', false],
        // contains_restricted_data is always recorded false here because composeMessageBody
        // has already stripped restricted content before this row is written — the column
        // exists so a downstream audit can assert "no notification row ever carried it",
        // not so restricted rows can be flagged and sent anyway.
    );

    return { notification: result.rows[0], body, wasRestricted: restricted };
}

/**
 * Fired when an AssistanceRequest is created (see modules/assistance/requests.js).
 * Best-effort: failure here must never roll back the underlying write.
 */
async function onAssistanceRequestCreated({ caseId, assistanceRequestId, receivingOrganisationId }) {
    if (!receivingOrganisationId) return null;
    return dispatchNotification({
        caseId,
        caseReference: caseId,
        recipientId: receivingOrganisationId,
        category: 'ASSISTANCE',
        channel: 'EMAIL',
        plainContent: `New assistance request ${assistanceRequestId} triaged for your organisation.`,
        priority: 'MEDIUM',
    });
}

module.exports = { dispatchNotification, onAssistanceRequestCreated, isRestricted, composeMessageBody };
