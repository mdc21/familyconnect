/**
 * Test Suite: SPEC-008 Gate G7 — Frontend Internationalization & Field Validation
 *
 * Verifies:
 * 1. Multi-language dictionary files exist (frontend/locales/en.json, ne.json, np.json).
 * 2. Key parity between English and Nepali dictionaries for community recovery.
 * 3. Frontend community-recovery.html contains required data-i18n and accessibility hooks.
 * 4. Service Worker precaches community-recovery.html and locales for offline / low-bandwidth resilience.
 * 5. Server statically serves locale files correctly with application/json.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/app');

let server;
let baseUrl;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

after(async () => {
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
});

describe('Gate G7 — Frontend Internationalization & Field Validation', () => {
    const localesDir = path.join(__dirname, '../frontend/locales');
    const enPath = path.join(localesDir, 'en.json');
    const nePath = path.join(localesDir, 'ne.json');
    const npPath = path.join(localesDir, 'np.json');
    const recoveryHtmlPath = path.join(__dirname, '../frontend/community-recovery.html');
    const swPath = path.join(__dirname, '../frontend/sw.js');

    it('en.json and ne.json exist and are valid JSON', () => {
        assert.ok(fs.existsSync(enPath), 'en.json should exist');
        assert.ok(fs.existsSync(nePath), 'ne.json should exist');
        assert.ok(fs.existsSync(npPath), 'np.json should exist');

        const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
        const ne = JSON.parse(fs.readFileSync(nePath, 'utf8'));

        assert.equal(typeof en, 'object');
        assert.equal(typeof ne, 'object');
        assert.ok(en.recoveryTitle, 'en.json must have recoveryTitle');
        assert.ok(ne.recoveryTitle, 'ne.json must have recoveryTitle');
    });

    it('Nepali dictionary has parity with English for all core community recovery keys', () => {
        const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
        const ne = JSON.parse(fs.readFileSync(nePath, 'utf8'));

        const requiredKeys = [
            'recoveryTitle',
            'recoverySubtitle',
            'selectLocalityLabel',
            'loadingLocalities',
            'privacyActiveTitle',
            'privacyActiveDesc',
            'badgeSuppressed',
            'badgeProtected',
            'textSuppressed',
            'metricTotalNeeds',
            'metricVerifiedNeeds',
            'metricUnmetNeeds',
            'servicesHeading',
            'resourceBannerTitle',
            'modalOfferTitle',
            'projectsHeading',
            'legalHeading',
            'btnSubmitOffer'
        ];

        for (const key of requiredKeys) {
            assert.ok(en[key], `en.json missing key: ${key}`);
            assert.ok(ne[key], `ne.json missing key: ${key}`);
            assert.equal(typeof ne[key], 'string');
            assert.ok(ne[key].length > 0, `ne.json key ${key} should not be empty`);
        }
    });

    it('community-recovery.html contains data-i18n bindings for headers, metrics, and modals', () => {
        const html = fs.readFileSync(recoveryHtmlPath, 'utf8');

        assert.ok(html.includes('data-i18n="recoveryTitle"'));
        assert.ok(html.includes('data-i18n="recoverySubtitle"'));
        assert.ok(html.includes('data-i18n="selectLocalityLabel"'));
        assert.ok(html.includes('data-i18n="metricTotalNeeds"'));
        assert.ok(html.includes('data-i18n="metricVerifiedNeeds"'));
        assert.ok(html.includes('data-i18n="metricUnmetNeeds"'));
        assert.ok(html.includes('data-i18n="servicesHeading"'));
        assert.ok(html.includes('data-i18n="resourceBannerTitle"'));
        assert.ok(html.includes('data-i18n="modalOfferTitle"'));
        assert.ok(html.includes('data-i18n="projectsHeading"'));
        assert.ok(html.includes('data-i18n="legalHeading"'));
        assert.ok(html.includes('data-i18n-placeholder="phProviderName"'));
    });

    it('sw.js precaches community-recovery.html and locale dictionaries for offline field degradation', () => {
        const sw = fs.readFileSync(swPath, 'utf8');

        assert.ok(sw.includes("'/community-recovery.html'"));
        assert.ok(sw.includes("'/locales/en.json'"));
        assert.ok(sw.includes("'/locales/ne.json'"));
        assert.ok(sw.includes('CACHE_NAME = "familyconnect-v20"'));
    });

    it('Express serves /locales/en.json and /locales/ne.json over HTTP', async () => {
        const resEn = await fetch(`${baseUrl}/locales/en.json`);
        assert.equal(resEn.status, 200);
        const dataEn = await resEn.json();
        assert.equal(dataEn.brand, 'FamilyConnect');

        const resNe = await fetch(`${baseUrl}/locales/ne.json`);
        assert.equal(resNe.status, 200);
        const dataNe = await resNe.json();
        assert.equal(dataNe.brand, 'फ्यामिलीकनेक्ट');
    });
});
