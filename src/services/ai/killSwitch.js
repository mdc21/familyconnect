/**
 * SPEC-009 §7.4 — Agent Suspension (The Kill Switch)
 * 
 * Provides immediate revocation and emergency containment:
 * - Revokes agent active status (`status = 'SUSPENDED'`)
 * - Halts in-flight `ai_execution_run` tasks safely at the checkpoint boundary
 * - Immutably logs suspension in `audit_event`
 */

const { pool, writeAuditEvent } = require('../../db');

class KillSwitchService {
    /**
     * Suspend an individual agent immediately (FR-008-019 / SPEC-009 §7.4)
     */
    async suspendAgent({ agentId, suspendedBy, reason }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const agentRes = await client.query(
                'SELECT * FROM agent_identity WHERE agent_id = $1 FOR UPDATE',
                [agentId]
            );

            if (agentRes.rows.length === 0) {
                const err = new Error(`Agent '${agentId}' not found.`);
                err.code = 'NOT_FOUND';
                err.status = 404;
                throw err;
            }

            const agent = agentRes.rows[0];

            // Update agent status to SUSPENDED
            await client.query(
                `UPDATE agent_identity 
                 SET status = 'SUSPENDED',
                     suspended_by = $1,
                     suspended_at = now()
                 WHERE agent_id = $2`,
                [suspendedBy, agentId]
            );

            // Halt all active runs for this agent
            const haltRes = await client.query(
                `UPDATE ai_execution_run
                 SET status = 'HALTED',
                     halt_reason = $1,
                     completed_at = now()
                 WHERE agent_id = $2 AND status = 'RUNNING'
                 RETURNING run_id`,
                [`AGENT_SUSPENDED: ${reason || 'Emergency administrative halt'}`, agentId]
            );

            const haltedRunIds = haltRes.rows.map(r => r.run_id);

            // Record immutable audit event
            await writeAuditEvent(client, {
                actor: suspendedBy,
                organisation: 'SECURITY',
                action: 'AI_AGENT_SUSPENDED',
                entityType: 'AGENT_IDENTITY',
                entityId: agentId,
                previousState: { status: agent.status },
                newState: { status: 'SUSPENDED', reason, haltedRuns: haltedRunIds },
                accessReason: 'Emergency Kill Switch Invocation under SPEC-009 §7.4',
                outcome: 'SUCCESS'
            });

            await client.query('COMMIT');

            return {
                agentId,
                status: 'SUSPENDED',
                suspendedBy,
                suspendedAt: new Date().toISOString(),
                haltedRuns: haltedRunIds,
                message: `Agent '${agentId}' successfully suspended. ${haltedRunIds.length} active run(s) halted.`
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Reinstate a suspended agent following review
     */
    async reinstateAgent({ agentId, reinstatedBy, reason }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const updateRes = await client.query(
                `UPDATE agent_identity 
                 SET status = 'ACTIVE',
                     suspended_by = NULL,
                     suspended_at = NULL
                 WHERE agent_id = $1
                 RETURNING *`,
                [agentId]
            );

            if (updateRes.rows.length === 0) {
                const err = new Error(`Agent '${agentId}' not found.`);
                err.code = 'NOT_FOUND';
                err.status = 404;
                throw err;
            }

            await writeAuditEvent(client, {
                actor: reinstatedBy,
                organisation: 'SECURITY',
                action: 'AI_AGENT_REINSTATED',
                entityType: 'AGENT_IDENTITY',
                entityId: agentId,
                previousState: { status: 'SUSPENDED' },
                newState: { status: 'ACTIVE', reason },
                accessReason: 'Administrative agent reactivation',
                outcome: 'SUCCESS'
            });

            await client.query('COMMIT');

            return {
                agentId,
                status: 'ACTIVE',
                message: `Agent '${agentId}' successfully reactivated.`
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}

module.exports = new KillSwitchService();
