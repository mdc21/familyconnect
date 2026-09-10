const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { writeLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'fc-dev-secret-change-in-production';
const JWT_EXPIRY = '12h';

/**
 * POST /api/v1/auth/login
 * Exchange email + password for a signed JWT.
 * Rate-limited hard (writeLimiter) — brute force protection is critical
 * on a humanitarian portal where adversarial actors may attempt to impersonate
 * coordinators or suppress case updates.
 */
router.post('/login', writeLimiter, async (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return next(new ProblemError('INVALID_SCHEMA', 'email and password are required.', req.originalUrl));
    }

    let client;
    try {
        client = await pool.connect();
    } catch (e) {
        return next(new ProblemError('DEGRADED_MODE', 'Database temporarily unavailable.', req.originalUrl));
    }

    try {
        const result = await client.query(
            'SELECT * FROM coordinator_account WHERE email = $1 AND is_active = TRUE',
            [email.toLowerCase().trim()],
        );

        const account = result.rows[0];
        if (!account) {
            // Constant-time fake compare to prevent timing attacks revealing valid emails
            await bcrypt.compare(password, '$2b$10$invalidhashplaceholderXXXXXXXXXXXXXXXXXX');
            await writeAuditEvent(client, {
                actor: 'UNREGISTERED_EMAIL',
                action: 'LOGIN_FAILED',
                entityType: 'CoordinatorAccount',
                entityId: 'UNKNOWN',
                outcome: 'FAILURE',
            });
            return next(new ProblemError('AUTH_REQUIRED', 'Invalid email or password.', req.originalUrl));
        }

        const valid = await bcrypt.compare(password, account.password_hash);
        if (!valid) {
            await writeAuditEvent(client, {
                actor: account.account_id, action: 'LOGIN_FAILED',
                entityType: 'CoordinatorAccount', entityId: account.account_id,
                outcome: 'FAILURE',
            });
            return next(new ProblemError('AUTH_REQUIRED', 'Invalid email or password.', req.originalUrl));
        }

        // Update last_login_at
        await client.query(
            'UPDATE coordinator_account SET last_login_at = now() WHERE account_id = $1',
            [account.account_id],
        );

        await writeAuditEvent(client, {
            actor: account.account_id, organisation: account.organisation_id,
            action: 'LOGIN_SUCCESS', entityType: 'CoordinatorAccount',
            entityId: account.account_id, outcome: 'SUCCESS',
        });

        const token = jwt.sign(
            {
                sub: account.account_id,
                email: account.email,
                displayName: account.display_name,
                role: account.role,
                organisationId: account.organisation_id,
                eventId: account.event_id,
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY },
        );

        res.json({
            token,
            expiresIn: JWT_EXPIRY,
            account: {
                accountId: account.account_id,
                displayName: account.display_name,
                email: account.email,
                role: account.role,
                organisationId: account.organisation_id,
            },
        });
    } catch (err) {
        next(err);
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/auth/me
 * Validate token and return current account details.
 * Frontend uses this on page load to check whether the stored token is still valid.
 */
router.get('/me', (req, res, next) => {
    const auth = req.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
        return next(new ProblemError('AUTH_REQUIRED', 'Authorization header with Bearer token required.', req.originalUrl));
    }
    const token = auth.slice(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({
            accountId: decoded.sub,
            displayName: decoded.displayName,
            email: decoded.email,
            role: decoded.role,
            organisationId: decoded.organisationId,
            eventId: decoded.eventId,
        });
    } catch (err) {
        return next(new ProblemError('AUTH_INVALID', 'Token is invalid or expired. Please sign in again.', req.originalUrl));
    }
});

module.exports = router;
