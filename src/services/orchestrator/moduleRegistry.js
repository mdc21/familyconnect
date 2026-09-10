/**
 * Module Registry Service — Manages the catalog of all FamilyConnect capabilities.
 * 
 * Queries the module_registry table to determine which modules apply to a given
 * disaster type, and provides dependency resolution.
 */

const { pool } = require('../../db');

/**
 * Get all modules from the registry.
 */
async function getAllModules() {
    const result = await pool.query(
        `SELECT module_id, module_name, description, applicable_types, is_core,
                has_public_page, nav_label, nav_path, console_tab, dependencies
         FROM module_registry ORDER BY is_core DESC, module_name`
    );
    return result.rows;
}

/**
 * Get modules applicable to a specific disaster type.
 * Core modules (applicable_types includes 'ALL') are always returned.
 * Optional modules are returned if their applicable_types includes the event type.
 */
async function getModulesForEventType(eventType) {
    const result = await pool.query(
        `SELECT module_id, module_name, description, applicable_types, is_core,
                has_public_page, nav_label, nav_path, console_tab, dependencies
         FROM module_registry
         WHERE 'ALL' = ANY(applicable_types) OR $1 = ANY(applicable_types)
         ORDER BY is_core DESC, module_name`,
        [eventType]
    );
    return result.rows;
}

/**
 * Resolve module dependencies — ensures required modules are activated.
 * Returns augmented list with any missing dependencies added.
 */
function resolveDependencies(selectedModuleIds, allModules) {
    const moduleMap = {};
    for (const m of allModules) {
        moduleMap[m.module_id] = m;
    }

    const resolved = new Set(selectedModuleIds);
    let changed = true;
    while (changed) {
        changed = false;
        for (const id of [...resolved]) {
            const mod = moduleMap[id];
            if (mod && mod.dependencies) {
                for (const dep of mod.dependencies) {
                    if (!resolved.has(dep)) {
                        resolved.add(dep);
                        changed = true;
                    }
                }
            }
        }
    }
    return [...resolved];
}

/**
 * Terminology mappings by disaster type — used in template substitution.
 * Country-agnostic, but culturally appropriate language.
 */
const TERMINOLOGY = {
    FLOOD: {
        primaryHazard: 'Flood',
        eventCategory: 'flood disaster',
        siteName: 'Rescue Site',
        siteNamePlural: 'Rescue Sites',
        rescueUnit: 'Search & Rescue Team',
        evacuationTerm: 'evacuation',
        shelterTerm: 'relief camp',
        missingContext: 'swept away or trapped by floodwaters',
        safeContext: 'safe from the flooding'
    },
    GLACIER_BURST: {
        primaryHazard: 'Glacial Lake Outburst Flood',
        eventCategory: 'glacial outburst flood',
        siteName: 'Rescue Site',
        siteNamePlural: 'Rescue Sites',
        rescueUnit: 'Search & Rescue Team',
        evacuationTerm: 'evacuation',
        shelterTerm: 'relief camp',
        missingContext: 'missing after the glacial outburst flood',
        safeContext: 'safe from the glacial flood'
    },
    CLOUD_BURST: {
        primaryHazard: 'Cloud Burst & Flash Flood',
        eventCategory: 'cloudburst and flash flood',
        siteName: 'Affected Site',
        siteNamePlural: 'Affected Sites',
        rescueUnit: 'Rescue Team',
        evacuationTerm: 'evacuation',
        shelterTerm: 'relief camp',
        missingContext: 'missing after the flash flood',
        safeContext: 'safe from the flash flood'
    },
    EARTHQUAKE: {
        primaryHazard: 'Earthquake',
        eventCategory: 'earthquake disaster',
        siteName: 'Collapse Site',
        siteNamePlural: 'Collapse Sites',
        rescueUnit: 'Urban Search & Rescue',
        evacuationTerm: 'evacuation',
        shelterTerm: 'earthquake shelter',
        missingContext: 'trapped or missing after the earthquake',
        safeContext: 'safe after the earthquake'
    },
    WILDFIRE: {
        primaryHazard: 'Wildfire',
        eventCategory: 'wildfire emergency',
        siteName: 'Fire Zone',
        siteNamePlural: 'Fire Zones',
        rescueUnit: 'Firefighting Unit',
        evacuationTerm: 'evacuation',
        shelterTerm: 'evacuation centre',
        missingContext: 'missing in the fire zone',
        safeContext: 'safe from the wildfire'
    },
    TSUNAMI: {
        primaryHazard: 'Tsunami',
        eventCategory: 'tsunami disaster',
        siteName: 'Impact Zone',
        siteNamePlural: 'Impact Zones',
        rescueUnit: 'Maritime Search & Rescue',
        evacuationTerm: 'evacuation to higher ground',
        shelterTerm: 'tsunami evacuation centre',
        missingContext: 'missing after the tsunami',
        safeContext: 'safe from the tsunami'
    },
    CYCLONE: {
        primaryHazard: 'Cyclone',
        eventCategory: 'cyclone disaster',
        siteName: 'Impact Zone',
        siteNamePlural: 'Impact Zones',
        rescueUnit: 'Disaster Response Force',
        evacuationTerm: 'evacuation',
        shelterTerm: 'cyclone shelter',
        missingContext: 'missing after the cyclone',
        safeContext: 'safe from the cyclone'
    }
};

function getTerminology(eventType) {
    return TERMINOLOGY[eventType] || TERMINOLOGY.FLOOD;
}

/**
 * Language configuration for multi-country deployment.
 */
const COUNTRY_LANGUAGES = {
    NP: ['en', 'ne', 'hi'],
    IN: ['en', 'hi', 'bn'],
    BD: ['en', 'bn'],
    PK: ['en'],
    CN: ['en', 'zh'],
    JP: ['en', 'ja'],
    PH: ['en'],
    ID: ['en'],
    US: ['en', 'es'],
    MX: ['es', 'en'],
    BR: ['pt', 'en'],
    AU: ['en'],
    GB: ['en'],
    KE: ['en', 'sw'],
    DEFAULT: ['en']
};

function getLanguagesForCountry(countryCode) {
    return COUNTRY_LANGUAGES[countryCode] || COUNTRY_LANGUAGES.DEFAULT;
}

module.exports = {
    getAllModules,
    getModulesForEventType,
    resolveDependencies,
    getTerminology,
    getLanguagesForCountry,
    TERMINOLOGY,
    COUNTRY_LANGUAGES
};
