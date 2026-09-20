try {
    process.loadEnvFile?.();
} catch (e) {
    // .env is optional
}

const express = require('express');
const { correlationAndEventContext } = require('./middleware/context');
const { resolveActor } = require('./middleware/actor');
const { requireIdempotencyKey } = require('./middleware/idempotency');
const { problemJsonErrorHandler } = require('./middleware/problems');

const submissionsRoutes = require('./modules/submissions/routes');
const casesRoutes = require('./modules/cases/routes');
const assignmentsRoutes = require('./modules/assignments/routes');
const updatesRoutes = require('./modules/updates/routes');       // gap fix #1
const rumoursRoutes = require('./modules/rumours/routes');       // gap fix #2
const assistanceRoutes = require('./modules/assistance/routes'); // gap fix #6
const assistanceRequestsRoutes = require('./modules/assistance/requests'); // Phase 2
const { familyRouter, proxyRouter } = require('./modules/families/routes');  // Phase 2
const documentationRoutes = require('./modules/documentation/routes');        // SPEC-008 M10
const familyRecoveryRoutes = require('./modules/family-recovery/routes');     // SPEC-008 M2
const communicationsRoutes = require('./modules/communications/routes');     // Phase 2
const notificationsRoutes = require('./modules/notifications/routes');      // Phase 2
const safeguardingRoutes = require('./modules/safeguarding/routes');
const handoverRoutes = require('./modules/handover/routes');
const auditRoutes = require('./modules/audit/routes');
const evidenceRoutes = require('./modules/evidence/routes');           // Phase 3
const carePreferencesRoutes = require('./modules/care-preferences/routes'); // Phase 3
const tourGroupsRoutes = require('./modules/tour-groups/routes');      // Phase 3
const dnaRoutes = require('./modules/dna/routes');                     // DNA sample requests
const newsRoutes = require('./modules/news/routes');                    // AI News Agent & Verification Hub
const organisationsRoutes = require('./modules/organisations/routes');  // Agency registration & directory
const tunnelsRoutes = require('./modules/tunnels/routes');              // Hydropower tunnel rescue & roster tracking
const authRoutes = require('./modules/auth/routes');                    // JWT coordinator authentication
const orchestratorRoutes = require('./modules/orchestrator/routes');        // Agentic AI Event Orchestrator
const eventsRoutes = require('./modules/events/routes');
const aiRoutes = require('./modules/ai/routes');
const aiGovernanceRoutes = require('./modules/ai-governance/routes');  // SPEC-009 Agent Governance & Proposals
const recoveryNeedsRoutes = require('./modules/recovery-needs/routes'); // SPEC-008 Community Recovery & Reconstruction
const resourcesRoutes = require('./modules/resources/routes');              // SPEC-008 M6 Resource Exchange
const recoveryProjectsRoutes = require('./modules/recovery-projects/routes'); // SPEC-008 M8 Recovery Projects
const learningRoutes = require('./modules/learning/routes');          // SPEC-010 Humanitarian Learning & Precedents
const gatewayRoutes = require('./modules/gateways/routes');    // Two-way SMS & WhatsApp Gateway
const tilesRoutes = require('./modules/tiles/routes');          // Geospatial basemap tile proxy & cache
const analyticsRoutes = require('./modules/analytics/routes');  // Privacy-preserving visitor metrics
const { visitorAnalytics } = require('./middleware/visitorAnalytics');
const { sloLatencyMiddleware, healthHandler } = require('./services/analytics/sloMonitor'); // SPEC-008 §11 G6 SLO monitoring

const path = require('path');

const app = express();

// Trust reverse proxy (Azure Container Apps / Envoy ingress)
app.set('trust proxy', 1);

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));

// ── Security headers ───────────────────────────────────────────────────────
// SPEC-004 §15 / ICRC humanitarian tech security baseline.
// CSP is permissive for fonts/external resources needed in the public portal
// but blocks inline eval and restricts framing.
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('X-XSS-Protection', '1; mode=block');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Allow fonts from Google, map tiles from OpenStreetMap, block everything else not from self
    res.set('Content-Security-Policy',
        "default-src 'self'; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline'; " +  // unsafe-inline required for inline <script> tags in HTML pages
        "connect-src 'self' https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com; " +
        "img-src 'self' data: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com; " +
        "frame-ancestors 'self';"
    );
    next();
});

// Route aliases for module paths and alternate page references (prevents 404s)
app.get(['/dna', '/dna.html', '/family-dna', '/family-dna.html'], (req, res) => res.redirect(301, '/dna-request.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
app.get(['/report-missing', '/report-missing.html'], (req, res) => res.redirect(301, '/missing.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
app.get(['/rescue-sites', '/rescue-sites.html'], (req, res) => res.redirect(301, '/tunnels.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));

// Privacy-preserving visitor analytics (ICRC/SPEC-004 compliant)
app.use(visitorAnalytics);
app.use(sloLatencyMiddleware); // Phase 1 SLO latency instrumentation (SPEC-008 §11 G6)

// Serve frontend static files (HTML, CSS, JS, etc.) before API rate limiting
// extensions: ['html'] allows accessing clean URLs like /partner-updates as well as /partner-updates.html
app.use(express.static(path.join(__dirname, '../frontend'), { extensions: ['html'] }));

// API rate limiting — strictly protects API routes from abuse without breaking frontend navigation
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes per IP
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res, next) => {
        next(new (require('./middleware/problems').ProblemError)('RATE_LIMIT'));
    }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// SPEC-003 §1: standard header contracts on every request
app.use(correlationAndEventContext);

// SPEC-003 §2: actor resolved server-side from validated bearer token — never from payload
app.use(resolveActor);

app.use('/api/v1/events', eventsRoutes);
app.use('/api/v1/auth', authRoutes);                 // /auth/login, /auth/me
app.use('/api/v1/submissions', submissionsRoutes);
app.use('/api/v1/cases', casesRoutes);               // includes GET /cases/track?ref= public lookup
app.use('/api/v1/cases', assignmentsRoutes);         // /cases/:caseId/assignments
app.use('/api/v1/cases', updatesRoutes);             // /cases/:caseId/updates
app.use('/api/v1/events', rumoursRoutes);            // /events/:eventId/rumours[...]
app.use('/api/v1/assistance-centres', assistanceRoutes);
app.use('/api/v1/cases', assistanceRequestsRoutes);  // /cases/:caseId/assistance
app.use('/api/v1/families', familyRouter);           // /families/:familyId/locations
app.use('/api/v1/families', documentationRoutes);    // /families/:familyId/documentation
app.use('/api/v1/families', familyRecoveryRoutes);   // /families/:familyId/recovery-case
app.use('/api/v1/cases', proxyRouter);               // /cases/:caseId/proxies
app.use('/api/v1/cases', communicationsRoutes);      // /cases/:caseId/communications[/batch]
app.use('/api/v1/cases', notificationsRoutes);       // /cases/:caseId/notifications
app.use('/api/v1/safeguarding', safeguardingRoutes);
app.use('/api/v1/cases', handoverRoutes);            // /cases/:caseId/handovers
app.use('/api/v1/audit', auditRoutes);               // AUTHORITY/ADMIN read-only query (gap fix)
app.use('/api/v1/cases', evidenceRoutes);            // /cases/:caseId/evidence
app.use('/api/v1/cases', carePreferencesRoutes);     // /cases/:caseId/care-preferences
app.use('/api/v1/tour-groups', tourGroupsRoutes);
app.use('/api/v1/dna', dnaRoutes);                  // /dna/requests
app.use('/api/v1/news', newsRoutes);                // /news/agent, /news/queue, /news/public, /news/partner-updates, /news/schedule
app.use('/api/v1/organisations', organisationsRoutes); // /organisations/register, /organisations/active
app.use('/api/v1/tunnels', tunnelsRoutes);            // /tunnels, /tunnels/:siteId/roster, /tunnels/worker-report
app.use('/api/v1/orchestrator', orchestratorRoutes);  // Autonomous event portal generator & review workflow
app.use('/api/v1/ai', aiRoutes);                      // AI translation endpoint
app.use('/api/v1/ai', aiGovernanceRoutes);            // SPEC-009 Agent governance, proposals & kill switch
app.use('/api/v1', recoveryNeedsRoutes);               // SPEC-008 Recovery needs & community summary
app.use('/api/v1/resources', resourcesRoutes);         // SPEC-008 M6 Resource Exchange & Match Proposals
app.use('/api/v1/recovery-projects', recoveryProjectsRoutes); // SPEC-008 M8 Recovery Projects & Tasks
app.use('/api/v1/learning', learningRoutes);          // SPEC-010 Humanitarian intelligence & precedents
app.use('/api/v1/gateways', gatewayRoutes);            // Two-way SMS & WhatsApp Gateway (Twilio / Meta)
app.use('/api/v1/tiles', tilesRoutes);                // High-performance geospatial basemap tile cache
app.use('/api/v1/analytics', analyticsRoutes);        // In-app privacy-preserving visitor analytics (SPEC-004)

// Serve static assets under /console only if request is for CSS, JS, images, or fonts
app.use('/console', (req, res, next) => {
    if (/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(req.path)) {
        return express.static(path.join(__dirname, '../frontend'))(req, res, next);
    }
    next();
});

app.get('/console*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/console.html')));
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));  // Shallow liveness probe (load balancer / container health check)
app.get('/api/v1/ops/health', healthHandler);                   // Full SLO compliance report (SPEC-008 §11 Gate G6)

// RFC 9457 problem+json for every error, per SPEC-003 §6
app.use(problemJsonErrorHandler);

const port = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(port, () => console.log(`FamilyConnect MVP listening on :${port}`));
}

module.exports = { app, requireIdempotencyKey };
