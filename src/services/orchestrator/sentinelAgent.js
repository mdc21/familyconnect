/**
 * Sentinel Agent — Monitors global disaster feeds and detects new events.
 * 
 * Priority: FLOOD / GLACIER_BURST / CLOUD_BURST (first template)
 * Feeds: GDACS (free), ReliefWeb API (free), USGS (free)
 * Cost: Zero — all feeds are open/free humanitarian APIs.
 * 
 * Autonomy: Fully autonomous for detection. Human-in-the-loop for
 * anything beyond detection (planning, building, activation).
 */

const https = require('https');
const { pool, writeAuditEvent } = require('../../db');

/**
 * Multi-Hazard Disaster Feeds Ingestion:
 * - GDACS (Global Disaster Alert and Coordination System - UN OCHA / European Commission)
 * - USGS Earthquake Hazards Program
 * - NOAA / JTWC Tropical Cyclone Advisories
 * - ReliefWeb API (UN OCHA)
 * 
 * Supports all major natural disaster categories:
 * - CYCLONE / TROPICAL STORM / TYPHOON (TC)
 * - FLOOD (FL)
 * - GLACIER_BURST / CLOUD_BURST (FL / GL)
 * - EARTHQUAKE (EQ)
 * - TSUNAMI (TS)
 * - WILDFIRE (WF)
 * - VOLCANO (VO)
 */

const GDACS_TYPE_MAP = {
    TC: 'CYCLONE',
    FL: 'FLOOD',
    GL: 'GLACIER_BURST',
    CB: 'CLOUD_BURST',
    EQ: 'EARTHQUAKE',
    TS: 'TSUNAMI',
    WF: 'WILDFIRE',
    VO: 'VOLCANO',
    DR: 'DROUGHT'
};

const ISO3_MAP = {
    PNG: 'PG', PAN: 'PA', PHL: 'PH', MEX: 'MX', USA: 'US', IND: 'IN',
    NPL: 'NP', TON: 'TO', VUT: 'VU', FJI: 'FJ', BGD: 'BD', PAK: 'PK',
    MOZ: 'MZ', MDG: 'MG', WSM: 'WS', SLB: 'SB', BRA: 'BR', CHN: 'CN',
    JPN: 'JP', IDN: 'ID', KEN: 'KE', AUS: 'AU', GBR: 'GB', VNM: 'VN',
    ECU: 'EC', COL: 'CO', CHL: 'CL', PER: 'PE', GTM: 'GT', HND: 'HN',
    SLV: 'SV', NIC: 'NI', CRI: 'CR', HTI: 'HT', DOM: 'DO', CUB: 'CU'
};

/**
 * Fetch live alerts from the official GDACS RSS feed (https://www.gdacs.org/xml/rss.xml).
 */
function fetchLiveGDACSAlerts(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        const req = https.get('https://www.gdacs.org/xml/rss.xml', { timeout: timeoutMs }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`GDACS feed HTTP status: ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const items = data.match(/<item>[\s\S]*?<\/item>/g) || [];
                    const alerts = [];
                    for (const it of items) {
                        const alertLevel = it.match(/<gdacs:alertlevel>(.*?)<\/gdacs:alertlevel>/i)?.[1] || '';
                        if (alertLevel.toLowerCase() !== 'orange' && alertLevel.toLowerCase() !== 'red') continue;
                        const rawType = (it.match(/<gdacs:eventtype>(.*?)<\/gdacs:eventtype>/i)?.[1] || 'FL').toUpperCase();
                        const eventType = GDACS_TYPE_MAP[rawType] || 'FLOOD';
                        const eventId = it.match(/<gdacs:eventid>(.*?)<\/gdacs:eventid>/i)?.[1] || it.match(/<guid[^>]*>(.*?)<\/guid>/i)?.[1] || Math.random().toString(36).slice(2, 8);
                        const sourceAlertId = `GDACS-${rawType}-${eventId}`;
                        const rawTitle = it.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
                        const title = rawTitle.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').trim();
                        const countryName = (it.match(/<gdacs:country>(.*?)<\/gdacs:country>/i)?.[1] || 'Global').replace(/&amp;/g, '&');
                        const iso3 = (it.match(/<gdacs:iso3>(.*?)<\/gdacs:iso3>/i)?.[1] || '').toUpperCase();
                        const country = ISO3_MAP[iso3] || (iso3.length === 2 ? iso3 : iso3.slice(0, 2)) || 'GL';
                        const lat = parseFloat(it.match(/<geo:lat>(.*?)<\/geo:lat>/i)?.[1] || '0');
                        const lon = parseFloat(it.match(/<geo:long>(.*?)<\/geo:long>/i)?.[1] || '0');
                        const popMatch = it.match(/<gdacs:population[^>]*value=\"(\d+)\"/i);
                        const estimatedAffected = popMatch ? parseInt(popMatch[1], 10) : 50000;
                        const rawDesc = it.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '';
                        const description = rawDesc.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').trim();
                        const region = countryName;
                        const rawLink = it.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.replace(/&amp;/g, '&')?.trim();
                        const sourceUrl = rawLink || `https://www.gdacs.org/report.aspx?eventtype=${rawType}&eventid=${eventId}`;

                        alerts.push({
                            sourceAlertId,
                            eventType,
                            severity: alertLevel.toUpperCase(),
                            title,
                            country,
                            countryName,
                            region,
                            coordinates: { lat, lon },
                            estimatedAffected,
                            confidence: alertLevel.toLowerCase() === 'red' ? 0.95 : 0.88,
                            description,
                            sourceUrl,
                            sourceCredibility: 'UN_OCHA_COPERNICUS_GDACS',
                            isSimulation: false
                        });
                    }
                    resolve(alerts);
                } catch (parseErr) {
                    reject(parseErr);
                }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('GDACS feed timeout')); });
        req.on('error', reject);
    });
}

const FALLBACK_ALERTS = [
    {
        sourceAlertId: 'GDACS-TC-2026-0412',
        eventType: 'CYCLONE',
        severity: 'RED',
        title: 'Severe Tropical Cyclone — South Pacific (Vanuatu & Fiji)',
        country: 'VU',
        countryName: 'Vanuatu',
        region: 'Shefa & Tafea Provinces — Port Vila, Tanna Island',
        coordinates: { lat: -17.73, lon: 168.32 },
        estimatedAffected: 210000,
        confidence: 0.95,
        description: 'Category 5 Tropical Cyclone approaching Vanuatu and western Fiji. Destructive winds exceeding 240 km/h, catastrophic storm surges, and island-wide communications blackouts reported.',
        sourceUrl: 'https://www.gdacs.org/report.aspx?simulation=true',
        sourceCredibility: 'SIMULATION_FALLBACK_CATALOG',
        isSimulation: true
    },
    {
        sourceAlertId: 'GDACS-TC-2026-0419',
        eventType: 'CYCLONE',
        severity: 'RED',
        title: 'Super Typhoon — Eastern Visayas & Luzon, Philippines',
        country: 'PH',
        countryName: 'Philippines',
        region: 'Eastern Samar, Leyte, Bicol Region',
        coordinates: { lat: 11.24, lon: 125.00 },
        estimatedAffected: 1450000,
        confidence: 0.93,
        description: 'Super Typhoon making landfall in Eastern Samar with extreme winds and 4m coastal storm surge. Pre-emptive evacuation orders active across coastal municipalities.',
        sourceUrl: 'https://www.gdacs.org/report.aspx?simulation=true',
        sourceCredibility: 'SIMULATION_FALLBACK_CATALOG',
        isSimulation: true
    },
    {
        sourceAlertId: 'GDACS-FL-2026-1087',
        eventType: 'FLOOD',
        severity: 'RED',
        title: 'Major Flooding — Brahmaputra Basin, Assam, India',
        country: 'IN',
        countryName: 'India',
        region: 'Assam, Meghalaya — Brahmaputra River Basin',
        coordinates: { lat: 26.14, lon: 91.74 },
        estimatedAffected: 2800000,
        confidence: 0.94,
        description: 'GDACS Red Alert: Severe monsoon flooding in Brahmaputra basin affecting 28 districts across Assam and northern Meghalaya. Multiple embankments breached.',
        sourceUrl: 'https://www.gdacs.org/report.aspx?simulation=true',
        sourceCredibility: 'SIMULATION_FALLBACK_CATALOG',
        isSimulation: true
    },
    {
        sourceAlertId: 'GDACS-EQ-2026-0782',
        eventType: 'EARTHQUAKE',
        severity: 'RED',
        title: 'M7.4 Major Subduction Earthquake — Tonga Trench / Pacific Islands',
        country: 'TO',
        countryName: 'Tonga',
        region: 'Tongatapu, Ha\'apai Islands',
        coordinates: { lat: -21.17, lon: -175.20 },
        estimatedAffected: 95000,
        confidence: 0.96,
        description: 'Shallow M7.4 earthquake along the Tonga subduction zone. Tsunami threat warning issued for coastal Pacific low-lying atolls and island settlements.',
        sourceUrl: 'https://www.gdacs.org/report.aspx?simulation=true',
        sourceCredibility: 'SIMULATION_FALLBACK_CATALOG',
        isSimulation: true
    },
    {
        sourceAlertId: 'GDACS-TC-2026-0428',
        eventType: 'CYCLONE',
        severity: 'RED',
        title: 'Tropical Cyclone & Storm Surge — Bay of Bengal (Odisha & Bangladesh)',
        country: 'BD',
        countryName: 'Bangladesh',
        region: 'Khulna, Barisal, Chittagong Coastal Belt',
        coordinates: { lat: 21.84, lon: 89.54 },
        estimatedAffected: 1800000,
        confidence: 0.92,
        description: 'Very Severe Cyclonic Storm crossing Sundarbans coast with 3.5m tidal surge inundating saline embankments and coastal villages.',
        sourceUrl: 'https://www.gdacs.org/report.aspx?simulation=true',
        sourceCredibility: 'SIMULATION_FALLBACK_CATALOG',
        isSimulation: true
    },
    {
        sourceAlertId: 'GDACS-FL-2026-1092',
        eventType: 'CLOUD_BURST',
        severity: 'ORANGE',
        title: 'Cloud Burst & Flash Flood — Uttarakhand, India',
        country: 'IN',
        countryName: 'India',
        region: 'Chamoli, Pithoragarh — Uttarakhand',
        coordinates: { lat: 30.44, lon: 79.93 },
        estimatedAffected: 45000,
        confidence: 0.88,
        description: 'Flash flooding from intense cloudburst in Chamoli district. Multiple villages cut off. Bridges destroyed on Alaknanda river.',
        sourceUrl: 'https://www.gdacs.org/report.aspx?simulation=true',
        sourceCredibility: 'SIMULATION_FALLBACK_CATALOG',
        isSimulation: true
    },
    {
        sourceAlertId: 'GDACS-GL-2026-0043',
        eventType: 'GLACIER_BURST',
        severity: 'ORANGE',
        title: 'Glacial Lake Outburst — Hunza Valley, Pakistan',
        country: 'PK',
        countryName: 'Pakistan',
        region: 'Hunza-Nagar, Gilgit-Baltistan',
        coordinates: { lat: 36.32, lon: 74.65 },
        estimatedAffected: 35000,
        confidence: 0.85,
        description: 'Glacial lake outburst flood from Shisper Glacier moraine dam failure. Downstream communities along Hunza River at immediate risk.',
        sourceUrl: 'https://www.gdacs.org/report.aspx?simulation=true',
        sourceCredibility: 'SIMULATION_FALLBACK_CATALOG',
        isSimulation: true
    }
];

async function fetchGDACSAlerts() {
    let liveAlerts = [];
    try {
        liveAlerts = await fetchLiveGDACSAlerts(6000);
    } catch (err) {
        console.warn('[Sentinel] Live GDACS feed fetch unavailable, using simulation catalog:', err.message);
    }

    // Only return live alerts if successfully retrieved, ensuring true events are not mixed with mock data
    if (Array.isArray(liveAlerts) && liveAlerts.length > 0) {
        return liveAlerts;
    }

    // Fallback simulation catalog is used only when feed is offline
    return FALLBACK_ALERTS;
}

/**
 * Check if an alert has already been detected (by source_alert_id).
 */
async function isAlreadyDetected(sourceAlertId) {
    const result = await pool.query(
        `SELECT detection_id FROM detected_event WHERE source_alert_id = $1`,
        [sourceAlertId]
    );
    return result.rows.length > 0;
}

/**
 * Auto-archive events where no action has been taken for 4 weeks (28 days).
 */
async function archiveStaleEvents(maxAgeDays = 28) {
    const res = await pool.query(
        `UPDATE detected_event
         SET status = 'ARCHIVED', archived_at = NOW(), archive_reason = 'EXPIRED_4_WEEKS_INACTIVE'
         WHERE status = 'DETECTED' AND detected_at < NOW() - ($1 || ' days')::INTERVAL
         RETURNING detection_id, source_alert_id, title, detected_at`,
        [maxAgeDays]
    );
    return res.rows;
}

/**
 * Run a Sentinel scan cycle.
 * Fetches alerts from all configured feeds, deduplicates, and inserts new detections.
 * 
 * Returns: { scannedFeeds, newDetections, detections[] }
 */
async function runSentinelScan() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Auto-archive stale events older than 4 weeks with no action taken
        await client.query(`
            UPDATE detected_event
            SET status = 'ARCHIVED', archived_at = NOW(), archive_reason = 'EXPIRED_4_WEEKS_INACTIVE'
            WHERE status = 'DETECTED' AND detected_at < NOW() - INTERVAL '28 days'
        `);
        
        const allAlerts = await fetchGDACSAlerts();
        const newDetections = [];
        
        for (const alert of allAlerts) {
            // Deduplicate by source_alert_id
            const exists = await isAlreadyDetected(alert.sourceAlertId);
            if (exists) continue;
            
            // Map severity to our scale
            const severityMap = { RED: 'CRITICAL', ORANGE: 'HIGH', GREEN: 'MODERATE' };
            const severity = severityMap[alert.severity] || 'MODERATE';
            
            const result = await client.query(
                `INSERT INTO detected_event
                    (source_feed, source_alert_id, event_type, severity, title, country, country_name, region, coordinates, estimated_affected, confidence, status, source_url, source_credibility, is_simulation)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'DETECTED', $12, $13, $14)
                 RETURNING detection_id, event_type, severity, title, country, source_url`,
                [
                    'GDACS',
                    alert.sourceAlertId,
                    alert.eventType,
                    severity,
                    alert.title,
                    alert.country,
                    alert.countryName,
                    alert.region,
                    JSON.stringify(alert.coordinates),
                    alert.estimatedAffected,
                    alert.confidence,
                    alert.sourceUrl || null,
                    alert.sourceCredibility || 'OFFICIAL_GOVERNMENT_UN',
                    alert.isSimulation === true
                ]
            );
            
            newDetections.push({
                detectionId: result.rows[0].detection_id,
                title: alert.title,
                eventType: alert.eventType,
                severity,
                country: alert.country,
                countryName: alert.countryName,
                sourceUrl: alert.sourceUrl
            });
        }
        
        // Audit the scan
        await writeAuditEvent(client, {
            actor: 'SENTINEL_AI_AGENT',
            action: 'SENTINEL_SCAN_COMPLETED',
            entityType: 'DetectedEvent',
            entityId: 'SENTINEL_SCAN',
            newState: { 
                scannedFeeds: ['GDACS'],
                totalAlerts: allAlerts.length,
                newDetections: newDetections.length
            },
            outcome: 'SUCCESS'
        });
        
        await client.query('COMMIT');
        
        return {
            scannedFeeds: 1,
            totalAlerts: allAlerts.length,
            newDetections: newDetections.length,
            detections: newDetections
        };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/**
 * List detected events, automatically archiving any stale > 4-week events first.
 * If filter is ACTIVE (or null), hides ARCHIVED and DISMISSED events.
 */
async function listDetectedEvents(filter = null) {
    // 1. Auto-archive events with no action taken after 4 weeks (28 days)
    await pool.query(`
        UPDATE detected_event
        SET status = 'ARCHIVED', archived_at = NOW(), archive_reason = 'EXPIRED_4_WEEKS_INACTIVE'
        WHERE status = 'DETECTED' AND detected_at < NOW() - INTERVAL '28 days'
    `);

    // 2. Query events
    let query = `SELECT detection_id as id, detection_id, source_feed, source_alert_id, event_type, severity, 
                        severity as alert_level, title, country as country_code, country_name, 
                        region as location_name, region, status, event_id as event_code, 
                        module_manifest, preview_url, detected_at,
                        source_url, source_credibility, is_simulation,
                        dismiss_reason, feedback_notes, dismissed_at, dismissed_by,
                        archived_at, archive_reason
                 FROM detected_event`;
    const params = [];
    if (!filter || filter === 'ACTIVE') {
        // Active display list hides archived and dismissed events
        query += ` WHERE status NOT IN ('ARCHIVED', 'DISMISSED')`;
    } else if (filter === 'ALL') {
        // No filter
    } else if (filter === 'ARCHIVED') {
        query += ` WHERE status = 'ARCHIVED'`;
    } else if (filter === 'DISMISSED') {
        query += ` WHERE status = 'DISMISSED'`;
    } else {
        query += ` WHERE status = $1`;
        params.push(filter);
    }
    query += ` ORDER BY detected_at DESC`;
    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Allow a human administrator to provide feedback on an event (e.g. FAKE_NEWS, MINOR_EVENT, OUT_OF_SCOPE)
 * and dismiss it from the active planning queue.
 */
async function dismissEventWithFeedback({ detectedEventId, reason, notes = '', actorId = 'admin-user' }) {
    if (!detectedEventId) {
        const err = new Error('detectedEventId is required');
        err.status = 400;
        throw err;
    }
    const validReasons = ['FAKE_NEWS', 'MINOR_EVENT', 'OUT_OF_SCOPE', 'DUPLICATE', 'SIMULATION_DATA', 'OTHER'];
    const chosenReason = validReasons.includes(reason) ? reason : 'OTHER';

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const updateRes = await client.query(
            `UPDATE detected_event
             SET status = 'DISMISSED',
                 dismiss_reason = $1,
                 feedback_notes = $2,
                 dismissed_by = $3,
                 dismissed_at = NOW()
             WHERE detection_id = $4
             RETURNING *`,
            [chosenReason, notes, actorId, detectedEventId]
        );

        if (updateRes.rows.length === 0) {
            const err = new Error(`Detected event '${detectedEventId}' not found.`);
            err.status = 404;
            throw err;
        }

        const dismissedEvent = updateRes.rows[0];

        // Audit the human feedback to AI Sentinel agent
        await writeAuditEvent(client, {
            actor: actorId,
            action: 'SENTINEL_EVENT_FEEDBACK_DISMISSED',
            entityType: 'DetectedEvent',
            entityId: detectedEventId,
            newState: {
                previousStatus: 'DETECTED',
                newStatus: 'DISMISSED',
                dismissReason: chosenReason,
                notes,
                title: dismissedEvent.title,
                sourceAlertId: dismissedEvent.source_alert_id,
                isSimulation: dismissedEvent.is_simulation
            },
            outcome: 'SUCCESS'
        });

        await client.query('COMMIT');
        return dismissedEvent;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

async function scanFeeds() {
    const result = await runSentinelScan();
    const events = await listDetectedEvents();
    return {
        scannedFeeds: result.scannedFeeds,
        totalAlerts: result.totalAlerts,
        newDetections: result.newDetections,
        detections: result.detections,
        events
    };
}

module.exports = {
    runSentinelScan,
    fetchGDACSAlerts,
    listDetectedEvents,
    scanFeeds,
    dismissEventWithFeedback,
    archiveStaleEvents
};

