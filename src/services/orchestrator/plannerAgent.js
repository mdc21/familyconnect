/**
 * Planner Agent — Classifies detected events and selects applicable modules.
 * 
 * Autonomy: Autonomous for module selection.
 * Human-in-the-loop: Admin can override module selections before build.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { pool, writeAuditEvent } = require('../../db');
const { getModulesForEventType, resolveDependencies, getTerminology, getLanguagesForCountry } = require('./moduleRegistry');

/**
 * Plan a detected event — select modules, generate terminology, determine languages.
 * 
 * @param {string} detectionId - UUID of the detected event
 * @returns {Object} Module manifest with activated/deactivated modules and config
 */

async function getLLMRecommendedModules(event, optionalModules) {
    if (!optionalModules.length) return [];
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("No GEMINI_API_KEY found, returning all optional modules by default.");
        return optionalModules.map(m => m.module_id);
    }
    
    const prompt = `
You are an AI orchestrator for a disaster response platform. 
A disaster event has been detected:
Title: ${event.title}
Type: ${event.event_type}
Severity: ${event.severity}
Region: ${event.region}

Here are the optional modules available for this type of event:
${JSON.stringify(optionalModules.map(m => ({ id: m.module_id, name: m.module_name, description: m.description })), null, 2)}

Which of these optional modules should be activated for this specific event? 
Return a JSON array containing ONLY the string IDs of the recommended modules.
`;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.6-flash", 
            generationConfig: { responseMimeType: "application/json" } 
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed;
        }
    } catch (err) {
        console.warn('LLM module selection failed:', err.message);
    }
    
    return optionalModules.map(m => m.module_id); // fallback to all
}

async function planEvent(detectionId) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Fetch the detected event
        const eventRes = await client.query(
            `SELECT * FROM detected_event WHERE detection_id = $1`,
            [detectionId]
        );
        
        if (!eventRes.rows.length) {
            throw new Error(`Detected event ${detectionId} not found`);
        }
        
        const event = eventRes.rows[0];
        
        // Get applicable modules for this disaster type
        const applicableModules = await getModulesForEventType(event.event_type);
        
        // Separate into core (always active) and optional (recommended)
        const coreModules = applicableModules.filter(m => m.is_core);
        const optionalModules = applicableModules.filter(m => !m.is_core);
        
        // Determine recommended optional modules using LLM
        const recommendedOptionalIds = await getLLMRecommendedModules(event, optionalModules);
        
        // Combine core + recommended optional modules
        const allModuleIds = [
            ...coreModules.map(m => m.module_id),
            ...recommendedOptionalIds
        ];
        const resolvedIds = resolveDependencies(allModuleIds, applicableModules);
        
        // Insert module activations
        for (const mod of applicableModules) {
            await client.query(
                `INSERT INTO event_module_activation (detection_id, module_id, is_active, activated_by)
                 VALUES ($1, $2, $3, 'AI_PLANNER')
                 ON CONFLICT (detection_id, module_id) DO UPDATE SET is_active = EXCLUDED.is_active`,
                [detectionId, mod.module_id, resolvedIds.includes(mod.module_id)]
            );
        }
        
        // Generate the event ID
        const countryCode = event.country || 'XX';
        const typeShort = {
            FLOOD: 'FL', GLACIER_BURST: 'GL', CLOUD_BURST: 'CB',
            EARTHQUAKE: 'EQ', WILDFIRE: 'WF', TSUNAMI: 'TS', CYCLONE: 'CY'
        }[event.event_type] || 'DIS';
        const year = new Date().getFullYear();
        const seq = Math.floor(Math.random() * 9000) + 1000;
        const eventId = `EVENT-${countryCode}-${typeShort}-${year}-${seq}`;
        
        // Get terminology and languages
        const terminology = getTerminology(event.event_type);
        const languages = getLanguagesForCountry(countryCode);
        
        // Build module manifest
        const manifest = {
            eventId,
            detectionId,
            eventType: event.event_type,
            severity: event.severity,
            title: event.title,
            country: event.country,
            countryName: event.country_name,
            region: event.region,
            coordinates: event.coordinates,
            estimatedAffected: event.estimated_affected,
            terminology,
            languages,
            branding: {
                primaryColor: '#005eb8', // FamilyConnect standard blue
                eventBannerText: event.title
            },
            activatedModules: applicableModules
                .filter(m => resolvedIds.includes(m.module_id))
                .map(m => ({
                    moduleId: m.module_id,
                    moduleName: m.module_name,
                    isCore: m.is_core,
                    hasPublicPage: m.has_public_page,
                    navLabel: m.nav_label,
                    navPath: m.nav_path,
                    consoleTab: m.console_tab
                })),
            deactivatedModules: applicableModules
                .filter(m => !resolvedIds.includes(m.module_id))
                .map(m => m.module_id)
        };
        
        // Update detected event status and save manifest
        await client.query(
            `UPDATE detected_event
             SET status = 'PLANNED', module_manifest = $1, planned_at = now()
             WHERE detection_id = $2`,
            [JSON.stringify(manifest), detectionId]
        );
        
        // Audit
        await writeAuditEvent(client, {
            actor: 'PLANNER_AI_AGENT',
            action: 'EVENT_PLANNED',
            entityType: 'DetectedEvent',
            entityId: detectionId,
            newState: {
                eventId,
                activatedCount: manifest.activatedModules.length,
                deactivatedCount: manifest.deactivatedModules.length,
                eventType: event.event_type
            },
            outcome: 'SUCCESS'
        });
        
        await client.query('COMMIT');
        
        return manifest;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Toggle a module's activation status (human override).
 */
async function toggleModule(detectionId, moduleId, isActive, reviewer) {
    await pool.query(
        `UPDATE event_module_activation
         SET is_active = $1, activated_by = $2
         WHERE detection_id = $3 AND module_id = $4`,
        [isActive, `HUMAN:${reviewer}`, detectionId, moduleId]
    );
}

module.exports = { planEvent, planEventPortal: planEvent, toggleModule };

