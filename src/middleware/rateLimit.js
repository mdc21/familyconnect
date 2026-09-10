/**
 * SPEC-007 §2.C: "Ensure automated enumeration attempts against case IDs
 * return generic 404 Not Found or 429 Rate Limited errors to prevent
 * hostile data scraping" and "Simulate traffic spikes ... to validate
 * edge caching and CDN resilience."
 *
 * This is an in-process token-bucket limiter, keyed by actor identity
 * where available and falling back to remote IP for anonymous PUBLIC
 * traffic. It is a last line of defence, not a substitute for the CDN/
 * edge-cache/WAF layer SPEC-005 assumes sits in front of this service —
 * see the README follow-up on what still needs to live there instead.
 */
const buckets = new Map();

function makeLimiter({ windowMs, max, keyPrefix }) {
    return function rateLimit(req, res, next) {
        const identity = req.actor && req.actor.actorId ? req.actor.actorId : req.ip;
        const key = `${keyPrefix}:${identity}`;
        const now = Date.now();

        let bucket = buckets.get(key);
        if (!bucket || now - bucket.windowStart >= windowMs) {
            bucket = { windowStart: now, count: 0 };
            buckets.set(key, bucket);
        }
        bucket.count += 1;

        if (bucket.count > max) {
            res.set('Retry-After', String(Math.ceil((bucket.windowStart + windowMs - now) / 1000)));
            return res.status(429).type('application/problem+json').json({
                type: 'https://api.familyconnect.org/v1/problems/rate-limited',
                title: 'Too many requests',
                status: 429,
                code: 'FC_ERR_429_RATE_LIMIT',
                instance: req.originalUrl,
            });
        }
        next();
    };
}

// Public read endpoints (rumour feed, assistance-centre directory) see
// disaster-driven traffic spikes from legitimate anonymous users, so the
// window is generous — this guards against scraping/DoS, not normal load.
const publicReadLimiter = makeLimiter({ windowMs: 60_000, max: 120, keyPrefix: 'public-read' });

// Submission/write endpoints are tighter: a genuine person files a
// handful of reports, not hundreds per minute.
const writeLimiter = makeLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'write' });

// Resets state between test runs / long-running process memory hygiene.
function _resetForTests() { buckets.clear(); }

module.exports = { publicReadLimiter, writeLimiter, makeLimiter, _resetForTests };
