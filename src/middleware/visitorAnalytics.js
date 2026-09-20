const { recordVisit, normalizePath } = require('../services/analytics/visitorService');

// Static asset extensions to ignore
const IGNORED_EXTENSIONS = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot', '.map', '.json', '.xml', '.txt'
];

/**
 * Privacy-preserving visitor analytics middleware.
 * Automatically tracks page visits for humanitarian response portals without tracking cookies or PII.
 */
function visitorAnalytics(req, res, next) {
    // Only track GET requests
    if (req.method !== 'GET') {
        return next();
    }

    const path = req.path || '/';

    // Ignore API routes, health checks, metrics, and static assets
    if (path.startsWith('/api/') || path === '/healthz' || path === '/metrics') {
        return next();
    }

    const lowerPath = path.toLowerCase();
    for (const ext of IGNORED_EXTENSIONS) {
        if (lowerPath.endsWith(ext)) {
            return next();
        }
    }

    // Determine event ID
    const eventId = req.query.event || req.get('X-Disaster-Event-ID') || 'EVENT-NP-TIBET-2026';

    // Determine client IP safely behind reverse proxy (Azure Container Apps ingress)
    let clientIp = req.get('x-forwarded-for') || req.ip || req.socket.remoteAddress || '127.0.0.1';
    if (clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
    }

    // Fire-and-forget record in background so response latency is completely unaffected
    setImmediate(() => {
        recordVisit({
            eventId,
            pagePath: path,
            clientIp
        }).catch((err) => {
            // Silently swallow background analytics error
        });
    });

    next();
}

module.exports = { visitorAnalytics };
