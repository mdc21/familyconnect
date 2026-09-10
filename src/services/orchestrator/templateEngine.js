/**
 * Template Engine — Deterministic variable substitution for portal generation.
 * 
 * No LLM code generation. Every output is assembled from pre-written, pre-tested
 * template fragments with simple {{variable}} substitution. This ensures
 * reliability and auditability for a humanitarian system.
 */

/**
 * Replace all {{variable}} placeholders in a template string.
 * Supports nested dot notation: {{terminology.siteName}}
 */
function substitute(template, variables) {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const keys = key.trim().split('.');
        let value = variables;
        for (const k of keys) {
            if (value == null) return match; // leave unresolved
            value = value[k];
        }
        return value != null ? String(value) : match;
    });
}

/**
 * Generate a navigation bar HTML snippet from activated modules.
 * Only includes modules that have public-facing pages.
 */
function generateNavigation(modules, activeModuleId) {
    const navItems = modules
        .filter(m => m.has_public_page && m.nav_label && m.nav_path)
        .map(m => {
            const isActive = m.module_id === activeModuleId;
            const activeClass = isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground';
            const ariaCurrent = isActive ? ' data-status="active" aria-current="page"' : '';
            return `<li><a class="inline-block border-b-2 px-3 py-2.5 text-sm font-semibold hover:text-foreground ${activeClass}" href="${m.nav_path}"${ariaCurrent}>${m.nav_label}</a></li>`;
        });
    return navItems.join('\n');
}

/**
 * Generate the complete HTML head section for a page.
 */
function generateHead(vars) {
    return `<!DOCTYPE html>
<html lang="${vars.language || 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${vars.pageTitle} | FamilyConnect</title>
    <meta name="description" content="${vars.pageDescription || ''}">
    <meta property="og:title" content="${vars.pageTitle}">
    <meta property="og:description" content="${vars.pageDescription || ''}">
    <meta property="og:type" content="website">
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="manifest" href="/manifest.json">
    <style>
        :root {
            --primary: ${vars.primaryColor || '#005eb8'};
            --primary-foreground: #ffffff;
        }
    </style>
</head>`;
}

/**
 * Generate the standard header with language selector and nav.
 */
function generateHeader(vars, modules, activeModuleId) {
    const langOptions = (vars.languages || ['en']).map(lang => {
        const labels = { en: 'English', ne: 'नेपाली · Nepali', hi: 'हिन्दी · Hindi', es: 'Español · Spanish', fr: 'Français · French', pt: 'Português · Portuguese', zh: '中文 · Chinese', ja: '日本語 · Japanese', bn: 'বাংলা · Bengali', ar: 'العربية · Arabic', sw: 'Kiswahili · Swahili' };
        const selected = lang === (vars.language || 'en') ? ' selected' : '';
        return `<option value="${lang}" lang="${lang}"${selected}>${labels[lang] || lang}</option>`;
    }).join('\n');

    const nav = generateNavigation(modules, activeModuleId);

    return `<header class="site-header">
    <div class="header-inner">
        <a href="/" class="site-brand">
            <span class="brand-icon" aria-hidden="true">FC</span>
            <span>
                <span class="brand-name">FamilyConnect</span>
                <span class="brand-subtitle">Disaster family assistance & reconnection</span>
            </span>
        </a>
        <div class="header-controls">
            <div class="lang-selector">
                <label for="language-selector" class="lang-label">Language</label>
                <select id="language-selector" class="lang-select">${langOptions}</select>
            </div>
            <a href="/auth" class="btn-outline">Responder sign in</a>
        </div>
    </div>
    <nav aria-label="Main" class="main-nav">
        <ul class="nav-list">${nav}</ul>
    </nav>
</header>`;
}

/**
 * Generate the standard footer.
 */
function generateFooter() {
    return `<footer class="site-footer">
    <div class="footer-inner">
        <p class="footer-emphasis">FamilyConnect coordinates information and assistance. It is not a police, medical, forensic or consular authority and does not replace them.</p>
        <p>In an emergency contact the local emergency services. Information shown here always carries its source and verification state. Unverified information is never a confirmation.</p>
        <p>Translations are provided to help you understand. Where a translation and the English record differ, coordinators work from the original record, which is language-neutral.</p>
    </div>
</footer>`;
}

/**
 * Country-specific emergency number lookup.
 * For humanitarian deployment — covers all major countries.
 */
const EMERGENCY_NUMBERS = {
    NP: { police: '100', ambulance: '102', fire: '101', general: '100' },
    IN: { police: '100', ambulance: '108', fire: '101', general: '112' },
    US: { general: '911' },
    GB: { general: '999' },
    AU: { general: '000' },
    CN: { police: '110', ambulance: '120', fire: '119', general: '110' },
    JP: { police: '110', ambulance: '119', fire: '119', general: '110' },
    BD: { general: '999' },
    PK: { general: '1122' },
    PH: { general: '911' },
    ID: { general: '112' },
    BR: { police: '190', ambulance: '192', fire: '193', general: '190' },
    MX: { general: '911' },
    KE: { general: '999' },
    DEFAULT: { general: '112' }
};

function getEmergencyNumber(countryCode) {
    return EMERGENCY_NUMBERS[countryCode] || EMERGENCY_NUMBERS.DEFAULT;
}

module.exports = {
    substitute,
    generateNavigation,
    generateHead,
    generateHeader,
    generateFooter,
    getEmergencyNumber,
    EMERGENCY_NUMBERS
};
