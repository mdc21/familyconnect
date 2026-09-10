/**
 * Builder Agent — Generates complete portal artifacts from deterministic templates.
 * 
 * NO LLM code generation. Every line of output comes from pre-written, pre-tested
 * template fragments with {{variable}} substitution.
 * 
 * Generates: index page, safe declaration, missing report, case tracker,
 * information feed, assistance centres, DNA page, guides page,
 * plus flood/glacier-specific modules.
 */

const { pool, writeAuditEvent } = require('../../db');
const { substitute, generateHead, generateHeader, generateFooter, getEmergencyNumber } = require('./templateEngine');

/**
 * Build the complete portal for a detected event.
 * Reads the module manifest, generates HTML pages, and saves as artifacts.
 */
async function buildEventPortal(detectionId) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Load the planned manifest
        const eventRes = await client.query(
            `SELECT * FROM detected_event WHERE detection_id = $1 AND status = 'PLANNED'`,
            [detectionId]
        );
        if (!eventRes.rows.length) {
            throw new Error(`No planned event found for detection ${detectionId}`);
        }

        const event = eventRes.rows[0];
        const manifest = event.module_manifest;
        const emergency = getEmergencyNumber(manifest.country);

        // Active modules for navigation
        const activeModules = manifest.activatedModules.filter(m => m.hasPublicPage);

        // Template variables available to every page
        const vars = {
            eventId: manifest.eventId,
            eventName: manifest.title,
            eventType: manifest.eventType,
            country: manifest.country,
            countryName: manifest.countryName,
            region: manifest.region,
            primaryColor: manifest.branding.primaryColor,
            emergencyNumber: emergency.general,
            languages: manifest.languages,
            language: manifest.languages[0] || 'en',
            terminology: manifest.terminology,
            estimatedAffected: (manifest.estimatedAffected || 0).toLocaleString()
        };

        const artifacts = [];

        // ── 1. INDEX PAGE ─────────────────────────────────────────
        artifacts.push({
            type: 'FRONTEND_PAGE',
            moduleId: 'INDEX',
            fileName: 'index.html',
            content: buildIndexPage(vars, activeModules)
        });

        // ── 2. SAFE DECLARATION PAGE ──────────────────────────────
        if (hasModule(manifest, 'MOD-SAFE')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-SAFE',
                fileName: 'safe.html',
                content: buildSafePage(vars, activeModules)
            });
        }

        // ── 3. MISSING REPORT PAGE ────────────────────────────────
        if (hasModule(manifest, 'MOD-TRACE')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-TRACE',
                fileName: 'missing.html',
                content: buildMissingPage(vars, activeModules)
            });
        }

        // ── 4. CASE TRACKER PAGE ──────────────────────────────────
        if (hasModule(manifest, 'MOD-TRACK')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-TRACK',
                fileName: 'track.html',
                content: buildTrackPage(vars, activeModules)
            });
        }

        // ── 5. INFORMATION FEED PAGE ──────────────────────────────
        if (hasModule(manifest, 'MOD-INFO')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-INFO',
                fileName: 'information.html',
                content: buildInfoPage(vars, activeModules)
            });
        }

        // ── 6. ASSISTANCE CENTRES PAGE ────────────────────────────
        if (hasModule(manifest, 'MOD-ASSIST')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-ASSIST',
                fileName: 'assistance.html',
                content: buildAssistancePage(vars, activeModules)
            });
        }

        // ── 7. DNA PAGE ──────────────────────────────────────────
        if (hasModule(manifest, 'MOD-DNA')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-DNA',
                fileName: 'dna-request.html',
                content: buildDNAPage(vars, activeModules)
            });
        }

        // ── 8. GUIDES PAGE ───────────────────────────────────────
        if (hasModule(manifest, 'MOD-GUIDES')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-GUIDES',
                fileName: 'guides.html',
                content: buildGuidesPage(vars, activeModules)
            });
        }

        // ── 9. RESCUE SITES PAGE (flood/glacier specific) ────────
        if (hasModule(manifest, 'MOD-TUNNEL')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-TUNNEL',
                fileName: 'rescue-sites.html',
                content: buildRescueSitesPage(vars, activeModules)
            });
        }

        // ── 10. SHELTER REGISTRY PAGE ────────────────────────────
        if (hasModule(manifest, 'MOD-SHELTER')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-SHELTER',
                fileName: 'shelters.html',
                content: buildSheltersPage(vars, activeModules)
            });
        }

        // ── 11. WATER POINTS PAGE ────────────────────────────────
        if (hasModule(manifest, 'MOD-WATER-PT')) {
            artifacts.push({
                type: 'FRONTEND_PAGE',
                moduleId: 'MOD-WATER-PT',
                fileName: 'water-points.html',
                content: buildWaterPointsPage(vars, activeModules)
            });
        }

        // Save all artifacts to database
        for (const artifact of artifacts) {
            await client.query(
                `INSERT INTO generated_artifact (detection_id, artifact_type, file_path, module_id, content_preview, status)
                 VALUES ($1, $2, $3, $4, $5, 'GENERATED')`,
                [
                    detectionId,
                    artifact.type,
                    `/preview/${detectionId}/${artifact.fileName}`,
                    artifact.moduleId,
                    artifact.content.substring(0, 500)
                ]
            );
        }

        // Update detected event status
        await client.query(
            `UPDATE detected_event SET status = 'BUILT', built_at = now() WHERE detection_id = $1`,
            [detectionId]
        );

        // Audit
        await writeAuditEvent(client, {
            actor: 'BUILDER_AI_AGENT',
            action: 'EVENT_PORTAL_BUILT',
            entityType: 'DetectedEvent',
            entityId: detectionId,
            newState: {
                artifactCount: artifacts.length,
                pages: artifacts.map(a => a.fileName)
            },
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');

        return {
            detectionId,
            eventId: manifest.eventId,
            artifactCount: artifacts.length,
            pages: artifacts.map(a => ({ fileName: a.fileName, moduleId: a.moduleId, type: a.type })),
            previewUrl: `/console/event-builder?preview=${detectionId}`
        };

    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

// ═══════════════════════════════════════════════════════════════
// PAGE BUILDERS — Each produces a complete, standalone HTML page.
// These are the "templates" — pre-written, tested HTML with variable substitution.
// ═══════════════════════════════════════════════════════════════

function hasModule(manifest, moduleId) {
    return manifest.activatedModules.some(m => m.moduleId === moduleId);
}

function buildIndexPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: `${vars.eventName}`, pageDescription: `Declare yourself safe, report someone missing, track a case and find verified disaster information and assistance for the ${vars.terminology.eventCategory}.` });
    const header = generateHeader(vars, modules, null);
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="hero-banner" style="background: linear-gradient(135deg, var(--primary) 0%, #003d7a 100%);">
        <div class="hero-content">
            <h1 class="hero-title">${vars.eventName}</h1>
            <p class="hero-subtitle">Family assistance &amp; reconnection service for the ${vars.terminology.eventCategory} in ${vars.region}, ${vars.countryName}.</p>
            <p class="hero-emergency">🚨 Emergency? Call <strong>${vars.emergencyNumber}</strong></p>
        </div>
    </div>

    <section class="triage-grid" aria-label="What do you need?">
        <h2 class="section-title">What do you need?</h2>
        <div class="card-grid">
            <a href="/safe" class="triage-card triage-safe">
                <span class="triage-icon" aria-hidden="true">✅</span>
                <h3>I am safe</h3>
                <p>Let your family know you are ${vars.terminology.safeContext}.</p>
            </a>
            <a href="/report-missing" class="triage-card triage-missing">
                <span class="triage-icon" aria-hidden="true">🔍</span>
                <h3>Report someone missing</h3>
                <p>Report a person ${vars.terminology.missingContext}.</p>
            </a>
            <a href="/track" class="triage-card triage-track">
                <span class="triage-icon" aria-hidden="true">📋</span>
                <h3>Track a case</h3>
                <p>Check the status of a reported case using your reference code.</p>
            </a>
            <a href="/information" class="triage-card triage-info">
                <span class="triage-icon" aria-hidden="true">📰</span>
                <h3>Verified information</h3>
                <p>Official updates, verified news, and rumour checks.</p>
            </a>
            <a href="/assistance" class="triage-card triage-assist">
                <span class="triage-icon" aria-hidden="true">🏥</span>
                <h3>Assistance centres</h3>
                <p>Find physical help: registration desks, medical, food, shelter.</p>
            </a>
            <a href="/family-dna" class="triage-card triage-dna">
                <span class="triage-icon" aria-hidden="true">🧬</span>
                <h3>DNA identification</h3>
                <p>Request a DNA reference kit if a family member is unaccounted for.</p>
            </a>
        </div>
    </section>

    <section class="event-summary" aria-label="Event summary">
        <div class="summary-stats">
            <div class="stat-card">
                <span class="stat-label">Estimated affected</span>
                <span class="stat-value">${vars.estimatedAffected}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Event type</span>
                <span class="stat-value">${vars.terminology.primaryHazard}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Region</span>
                <span class="stat-value">${vars.region}</span>
            </div>
        </div>
    </section>

    <div class="footer-notice">
        <p><strong>FamilyConnect coordinates information and assistance.</strong> It is not a police, medical, forensic or consular authority and does not replace them.</p>
    </div>
</main>
${footer}
<script src="/js/api.js"></script>
</body>
</html>`;
}

function buildSafePage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'I am safe', pageDescription: `Declare yourself safe from the ${vars.terminology.eventCategory}.` });
    const header = generateHeader(vars, modules, 'MOD-SAFE');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>I am safe</h1>
        <p>Let your family, friends and authorities know that you are ${vars.terminology.safeContext}.</p>
    </div>
    <form id="safe-form" class="form-card" novalidate>
        <input type="hidden" name="eventId" value="${vars.eventId}">
        <fieldset>
            <legend>Your details</legend>
            <div class="form-row">
                <div class="form-group"><label for="firstName">First name *</label><input type="text" id="firstName" name="firstName" required></div>
                <div class="form-group"><label for="lastName">Last name *</label><input type="text" id="lastName" name="lastName" required></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label for="phone">Phone number</label><input type="tel" id="phone" name="phone"></div>
                <div class="form-group"><label for="nationality">Nationality</label><input type="text" id="nationality" name="nationality"></div>
            </div>
            <div class="form-group"><label for="currentLocation">Current location *</label><input type="text" id="currentLocation" name="currentLocation" required placeholder="Where are you now?"></div>
            <div class="form-group"><label for="message">Message for your family</label><textarea id="message" name="message" rows="3" placeholder="Optional message"></textarea></div>
        </fieldset>
        <button type="submit" class="btn-primary">Declare myself safe</button>
    </form>
    <div id="safe-result" class="result-card" hidden></div>
</main>
${footer}
<script src="/js/api.js"></script>
<script>
document.getElementById('safe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    try {
        const res = await fetch('/api/v1/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Disaster-Event-ID': '${vars.eventId}' },
            body: JSON.stringify({ type: 'SAFE_AND_WELL', person: { firstName: data.firstName, lastName: data.lastName, phone: data.phone, nationality: data.nationality }, lastKnownContact: { locationDescription: data.currentLocation }, message: data.message })
        });
        const result = await res.json();
        const resultDiv = document.getElementById('safe-result');
        resultDiv.hidden = false;
        resultDiv.innerHTML = '<h3>✅ Declaration received</h3><p>Reference: <strong>' + (result.referenceCode || 'Submitted') + '</strong></p><p>Share this reference with your family so they can check your status.</p>';
        form.reset();
    } catch (err) {
        alert('Submission failed. Please try again.');
    }
});
</script>
</body>
</html>`;
}

function buildMissingPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'Report someone missing', pageDescription: `Report a person ${vars.terminology.missingContext}.` });
    const header = generateHeader(vars, modules, 'MOD-TRACE');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>Report someone missing</h1>
        <p>Report a person ${vars.terminology.missingContext}. FamilyConnect will create a case record for tracing.</p>
    </div>
    <form id="missing-form" class="form-card" novalidate>
        <input type="hidden" name="eventId" value="${vars.eventId}">
        <fieldset>
            <legend>Missing person's details</legend>
            <div class="form-row">
                <div class="form-group"><label for="mpFirstName">First name *</label><input type="text" id="mpFirstName" name="mpFirstName" required></div>
                <div class="form-group"><label for="mpLastName">Last name *</label><input type="text" id="mpLastName" name="mpLastName" required></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label for="mpAge">Age (approximate)</label><input type="number" id="mpAge" name="mpAge" min="0" max="120"></div>
                <div class="form-group"><label for="mpGender">Gender</label><select id="mpGender" name="mpGender"><option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
            </div>
            <div class="form-group"><label for="mpNationality">Nationality</label><input type="text" id="mpNationality" name="mpNationality"></div>
            <div class="form-group"><label for="lastKnownLocation">Last known location *</label><input type="text" id="lastKnownLocation" name="lastKnownLocation" required placeholder="Where were they last seen?"></div>
            <div class="form-group"><label for="physicalDescription">Physical description</label><textarea id="physicalDescription" name="physicalDescription" rows="3" placeholder="Height, build, hair, clothing, distinguishing features"></textarea></div>
        </fieldset>
        <fieldset>
            <legend>Your details (the reporter)</legend>
            <div class="form-row">
                <div class="form-group"><label for="reporterName">Your name *</label><input type="text" id="reporterName" name="reporterName" required></div>
                <div class="form-group"><label for="reporterPhone">Your phone *</label><input type="tel" id="reporterPhone" name="reporterPhone" required></div>
            </div>
            <div class="form-group"><label for="relationship">Relationship to missing person</label><input type="text" id="relationship" name="relationship" placeholder="e.g. mother, friend, employer"></div>
        </fieldset>
        <button type="submit" class="btn-primary">Submit missing person report</button>
    </form>
    <div id="missing-result" class="result-card" hidden></div>
</main>
${footer}
<script src="/js/api.js"></script>
<script>
document.getElementById('missing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = Object.fromEntries(new FormData(form));
    try {
        const res = await fetch('/api/v1/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Disaster-Event-ID': '${vars.eventId}' },
            body: JSON.stringify({ type: 'MISSING_PERSON', person: { firstName: d.mpFirstName, lastName: d.mpLastName, approximateAge: parseInt(d.mpAge) || null, gender: d.mpGender || null, nationality: d.mpNationality || null }, lastKnownContact: { locationDescription: d.lastKnownLocation }, reporter: { name: d.reporterName, phone: d.reporterPhone, relationship: d.relationship }, physicalDescription: d.physicalDescription })
        });
        const result = await res.json();
        const div = document.getElementById('missing-result');
        div.hidden = false;
        div.innerHTML = '<h3>✅ Report submitted</h3><p>Reference: <strong>' + (result.referenceCode || 'Submitted') + '</strong></p><p>Save this reference to track your case at <a href="/track">/track</a>.</p>';
        form.reset();
    } catch (err) { alert('Submission failed. Please try again.'); }
});
</script>
</body>
</html>`;
}

function buildTrackPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'Track a case', pageDescription: 'Check the status of a reported case.' });
    const header = generateHeader(vars, modules, 'MOD-TRACK');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>Track a case</h1>
        <p>Enter the reference code you received when you submitted a report.</p>
    </div>
    <form id="track-form" class="form-card">
        <div class="form-group">
            <label for="refCode">Reference code</label>
            <input type="text" id="refCode" name="refCode" required placeholder="e.g. FC-XXXX-XXXX" class="input-large">
        </div>
        <button type="submit" class="btn-primary">Look up case</button>
    </form>
    <div id="track-result" class="result-card" hidden></div>
</main>
${footer}
<script src="/js/api.js"></script>
<script>
document.getElementById('track-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ref = document.getElementById('refCode').value.trim();
    if (!ref) return;
    try {
        const res = await fetch('/api/v1/cases/track?ref=' + encodeURIComponent(ref));
        const data = await res.json();
        const div = document.getElementById('track-result');
        div.hidden = false;
        if (data.found) {
            div.innerHTML = '<h3>Case found</h3><p><strong>Status:</strong> ' + (data.status || 'OPEN') + '</p><p><strong>Type:</strong> ' + (data.caseType || '—') + '</p>' + (data.latestUpdate ? '<p><strong>Latest update:</strong> ' + data.latestUpdate + '</p>' : '<p class="info-notice">No update does not mean bad news. Rescue and tracing teams are still active. Updates are published as soon as they are verified.</p>');
        } else {
            div.innerHTML = '<h3>No case found</h3><p>No case matches this reference code. Please check and try again, or <a href="/report-missing">submit a new report</a>.</p>';
        }
    } catch (err) { alert('Lookup failed. Please try again.'); }
});
</script>
</body>
</html>`;
}

function buildInfoPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'Verified information', pageDescription: `Official updates and verified news about the ${vars.terminology.eventCategory}.` });
    const header = generateHeader(vars, modules, 'MOD-INFO');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>Verified information</h1>
        <p>Official updates, verified news, and rumour checks for the ${vars.terminology.eventCategory} in ${vars.region}.</p>
    </div>
    <div class="filter-bar">
        <select id="category-filter"><option value="ALL">All categories</option><option value="RESCUE">Rescue</option><option value="INFRASTRUCTURE">Infrastructure</option><option value="CASUALTIES">Casualties</option><option value="AID">Aid &amp; Relief</option><option value="CONSULAR">Consular</option><option value="RUMOUR_CHECK">Rumour checks</option></select>
    </div>
    <div id="info-feed" class="info-feed"><p class="loading">Loading verified information…</p></div>
</main>
${footer}
<script src="/js/api.js"></script>
<script>
async function loadInfo() {
    const category = document.getElementById('category-filter').value;
    try {
        const res = await fetch('/api/v1/news/public?category=' + category, { headers: { 'X-Disaster-Event-ID': '${vars.eventId}' } });
        const items = await res.json();
        const feed = document.getElementById('info-feed');
        if (!items.length) { feed.innerHTML = '<p>No verified information available yet.</p>'; return; }
        feed.innerHTML = items.map(item => '<article class="info-card"><div class="info-meta"><span class="badge badge-' + (item.verificationStatus || 'UNVERIFIED').toLowerCase() + '">' + (item.verificationStatus || 'UNVERIFIED') + '</span><span class="info-source">' + (item.sourceName || 'Official') + '</span></div><h3>' + (item.title || 'Update') + '</h3><p>' + (item.summary || '') + '</p></article>').join('');
    } catch (err) { document.getElementById('info-feed').innerHTML = '<p>Unable to load. Please try again.</p>'; }
}
document.getElementById('category-filter').addEventListener('change', loadInfo);
loadInfo();
</script>
</body>
</html>`;
}

function buildAssistancePage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'Assistance centres', pageDescription: `Find physical help near ${vars.region}.` });
    const header = generateHeader(vars, modules, 'MOD-ASSIST');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>Assistance centres</h1>
        <p>Physical locations where you can get help: registration, medical, food, shelter, and information.</p>
    </div>
    <div id="centres-list" class="centres-grid"><p class="loading">Loading assistance centres…</p></div>
</main>
${footer}
<script src="/js/api.js"></script>
<script>
async function loadCentres() {
    try {
        const res = await fetch('/api/v1/assistance-centres', { headers: { 'X-Disaster-Event-ID': '${vars.eventId}' } });
        const centres = await res.json();
        const grid = document.getElementById('centres-list');
        if (!centres.length) { grid.innerHTML = '<p>No assistance centres registered yet. Centres are added as they become operational.</p>'; return; }
        grid.innerHTML = centres.map(c => '<div class="centre-card"><h3>' + c.centreName + '</h3><p class="centre-location">' + (c.address || c.district || '') + '</p><p>' + (c.servicesOffered || []).join(', ') + '</p><p class="centre-hours">' + (c.operatingHours || '24/7') + '</p></div>').join('');
    } catch (err) { document.getElementById('centres-list').innerHTML = '<p>Unable to load. Please try again.</p>'; }
}
loadCentres();
</script>
</body>
</html>`;
}

function buildDNAPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'DNA identification', pageDescription: 'Request a DNA reference kit for identification.' });
    const header = generateHeader(vars, modules, 'MOD-DNA');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>DNA identification</h1>
        <p>If a family member is unaccounted for, you can request a DNA reference kit. A cheek swab from a close relative helps forensic teams match recovered remains.</p>
    </div>
    <div class="info-notice">
        <p><strong>Important:</strong> DNA identification is coordinated by forensic authorities, not by FamilyConnect. We facilitate the request; the authorities perform the science.</p>
    </div>
    <form id="dna-form" class="form-card" novalidate>
        <fieldset>
            <legend>DNA reference kit request</legend>
            <div class="form-group"><label for="dnaRequesterName">Your name *</label><input type="text" id="dnaRequesterName" required></div>
            <div class="form-group"><label for="dnaRequesterPhone">Your phone *</label><input type="tel" id="dnaRequesterPhone" required></div>
            <div class="form-group"><label for="dnaMissingName">Missing person's name *</label><input type="text" id="dnaMissingName" required></div>
            <div class="form-group"><label for="dnaRelationship">Your relationship *</label><input type="text" id="dnaRelationship" required placeholder="e.g. parent, sibling, child"></div>
            <div class="form-group"><label for="dnaCaseRef">Case reference (if known)</label><input type="text" id="dnaCaseRef" placeholder="FC-XXXX-XXXX"></div>
        </fieldset>
        <button type="submit" class="btn-primary">Request DNA kit</button>
    </form>
    <div id="dna-result" class="result-card" hidden></div>
</main>
${footer}
<script src="/js/api.js"></script>
<script>
document.getElementById('dna-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const res = await fetch('/api/v1/dna/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requesterName: document.getElementById('dnaRequesterName').value, requesterPhone: document.getElementById('dnaRequesterPhone').value, missingPersonName: document.getElementById('dnaMissingName').value, relationship: document.getElementById('dnaRelationship').value, caseReference: document.getElementById('dnaCaseRef').value || null })
        });
        const data = await res.json();
        const div = document.getElementById('dna-result');
        div.hidden = false;
        div.innerHTML = '<h3>✅ Request submitted</h3><p>Your DNA kit request has been logged. A forensic coordinator will contact you at the phone number provided.</p>';
        e.target.reset();
    } catch (err) { alert('Request failed. Please try again.'); }
});
</script>
</body>
</html>`;
}

function buildGuidesPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'Guides for families', pageDescription: `Practical guides for families affected by the ${vars.terminology.eventCategory}.` });
    const header = generateHeader(vars, modules, 'MOD-GUIDES');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>Guides for families</h1>
        <p>Plain-language guidance for people trying to reach relatives, report someone missing, or judge whether information is reliable.</p>
    </div>
    <div class="card-grid guides-grid">
        <div class="guide-card">
            <h2>How to report a missing person</h2>
            <p>What information to gather, how to register a case, what happens next and how long each step usually takes.</p>
        </div>
        <div class="guide-card">
            <h2>How to find a family member after ${vars.terminology.primaryHazard.toLowerCase()}</h2>
            <p>Where to search first, which authorities hold which records, and how to use assistance centres and case tracking.</p>
        </div>
        <div class="guide-card">
            <h2>How to check whether disaster information is verified</h2>
            <p>How to read source and verification labels, how rumours are assessed, and what an unverified update does not mean.</p>
        </div>
        <div class="guide-card">
            <h2>The first 24 hours when someone is missing</h2>
            <p>An hour-by-hour checklist: who to call, what to write down, when to register the case and how to set up tracking.</p>
        </div>
        <div class="guide-card">
            <h2>Foreign national missing: embassy and consular help</h2>
            <p>What embassies and consulates can and cannot do, and the details to have ready before contacting them.</p>
        </div>
        <div class="guide-card">
            <h2>DNA identification: a guide for families</h2>
            <p>Requesting a DNA kit, giving a reference sample, how comparisons are reviewed, and who can confirm an identification.</p>
        </div>
    </div>
</main>
${footer}
</body>
</html>`;
}

function buildRescueSitesPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: `${vars.terminology.siteNamePlural}`, pageDescription: `Live rescue operation status for the ${vars.terminology.eventCategory}.` });
    const header = generateHeader(vars, modules, 'MOD-TUNNEL');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>${vars.terminology.siteNamePlural}</h1>
        <p>Live status of ${vars.terminology.rescueUnit.toLowerCase()} operations at ${vars.terminology.primaryHazard.toLowerCase()} impact sites.</p>
    </div>
    <div id="rescue-sites" class="sites-grid"><p class="loading">Loading rescue site data…</p></div>
</main>
${footer}
<script src="/js/api.js"></script>
<script>
async function loadSites() {
    try {
        const res = await fetch('/api/v1/tunnels');
        const sites = await res.json();
        const grid = document.getElementById('rescue-sites');
        if (!sites.length) { grid.innerHTML = '<p>No active rescue sites registered.</p>'; return; }
        grid.innerHTML = sites.map(s => '<div class="site-card"><h3>' + s.siteName + '</h3><p class="site-district">' + s.district + '</p><div class="site-stats"><span>Trapped: ' + s.estimatedTrapped + '</span><span>Rescued: ' + s.rescuedCount + '</span><span>Status: ' + s.operationalStatus.replace(/_/g,' ') + '</span></div><p class="site-update">' + (s.lastStatusUpdate || '') + '</p></div>').join('');
    } catch (err) { document.getElementById('rescue-sites').innerHTML = '<p>Unable to load. Please try again.</p>'; }
}
loadSites();
</script>
</body>
</html>`;
}

function buildSheltersPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'Temporary shelters', pageDescription: `Find temporary shelters near ${vars.region}.` });
    const header = generateHeader(vars, modules, 'MOD-SHELTER');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>Temporary shelters</h1>
        <p>Temporary ${vars.terminology.shelterTerm} locations with capacity, services, and operating status.</p>
    </div>
    <div class="info-notice">
        <p>Shelter information is updated by relief agencies as conditions change. Contact your local emergency services for the most current availability.</p>
    </div>
    <div id="shelters-list" class="centres-grid"><p>Shelter registry will be populated as relief operations establish locations.</p></div>
</main>
${footer}
</body>
</html>`;
}

function buildWaterPointsPage(vars, modules) {
    const head = generateHead({ ...vars, pageTitle: 'Safe water points', pageDescription: `Find safe drinking water near ${vars.region}.` });
    const header = generateHeader(vars, modules, 'MOD-WATER-PT');
    const footer = generateFooter();

    return `${head}
<body>
${header}
<main id="main" class="main-content">
    <div class="page-header">
        <h1>Safe water points</h1>
        <p>Verified safe drinking water sources, distribution points, and purification stations.</p>
    </div>
    <div class="info-notice">
        <p><strong>Never drink untreated water after a flood.</strong> Floodwater carries bacteria, viruses, and chemical contaminants. Use only verified water points or purify water by boiling for at least 1 minute.</p>
    </div>
    <div id="water-points" class="centres-grid"><p>Water point locations will be published as WASH agencies establish distribution.</p></div>
</main>
${footer}
</body>
</html>`;
}

module.exports = { buildEventPortal };
