const { Pool } = require('pg');

const isLocal = !process.env.DATABASE_URL || 
                process.env.DATABASE_URL.includes('localhost') || 
                process.env.DATABASE_URL.includes('127.0.0.1') ||
                process.env.DATABASE_URL.includes('familyconnect-db');

const sslConfig = isLocal ? false : { rejectUnauthorized: false };

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://familyconnect:familyconnect@localhost:5432/familyconnect',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : (process.env.DATABASE_SSL === 'false' ? false : sslConfig)
});

/**
 * Postgres unique-violation error code. Used to recognise the specific
 * "two concurrent requests with the same Idempotency-Key both passed the
 * SELECT-for-existing check before either committed" race that SPEC-007
 * §2.A's chaos test fires directly at — found by running that gate
 * against a real database, not by reasoning about the code in isolation.
 */
const PG_UNIQUE_VIOLATION = '23505';

function isIdempotencyKeyRaceConflict(err, constraintName) {
    return err && err.code === PG_UNIQUE_VIOLATION && err.constraint === constraintName;
}

/**
 * Every sensitive operation should generate an audit event (SPEC-002 §47,
 * SPEC-004 §22). Writes go through this single helper so nothing bypasses
 * it, and the audit_event table itself rejects UPDATE/DELETE at the DB
 * layer (see schema.sql trigger) so this is genuinely append-only even if
 * application code is compromised.
 *
 * `actor` is coalesced to a sentinel rather than left null: audit_event.
 * actor is NOT NULL by design (every entry must identify who acted), but
 * a caller failing to resolve an identity — found live when a Phase 4
 * integration test omitted X-Debug-Actor-Id and the whole business
 * transaction 500'd on the audit insert's constraint violation — should
 * never be able to silently block the underlying write. Production auth
 * always populates actorId from a verified token per SPEC-003 §2, so
 * 'UNVERIFIED_ACTOR' showing up here in a real deployment is itself a
 * signal worth alerting on, not a normal path.
 */
async function writeAuditEvent(client, {
    actor, organisation, action, entityType, entityId,
    previousState, newState, accessReason, outcome,
}) {
    await client.query(
        `INSERT INTO audit_event
            (actor, organisation, action, entity_type, entity_id, previous_state, new_state, access_reason, outcome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [actor || 'UNVERIFIED_ACTOR', organisation, action, entityType, entityId,
            previousState ? JSON.stringify(previousState) : null,
            newState ? JSON.stringify(newState) : null,
            accessReason, outcome],
    );
}

module.exports = { pool, writeAuditEvent, isIdempotencyKeyRaceConflict, PG_UNIQUE_VIOLATION };
