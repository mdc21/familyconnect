-- ============================================================
-- MODULE REGISTRY SEED DATA
-- 21 modules with applicability rules for all disaster types
-- ============================================================

INSERT INTO module_registry (module_id, module_name, description, applicable_types, is_core, has_public_page, nav_label, nav_path, console_tab, dependencies)
VALUES
-- ── Core modules (always activated) ──────────────────────
('MOD-TRACE', 'Family Tracing & Missing Persons', 'Report and track missing persons with case reference system', ARRAY['ALL'], true, true, 'Report someone missing', '/report-missing', 'cases', NULL),
('MOD-SAFE', 'Safe Declarations', 'Allow individuals to declare themselves safe and notify family', ARRAY['ALL'], true, true, 'I am safe', '/safe', NULL, NULL),
('MOD-DNA', 'DNA Identification', 'DNA sample request and matching coordination with forensic authorities', ARRAY['FLOOD', 'GLACIER_BURST', 'EARTHQUAKE', 'TSUNAMI'], false, true, 'DNA identification', '/family-dna', 'dna', ARRAY['MOD-TRACE']),
('MOD-ASSIST', 'Assistance Centres', 'Directory of physical assistance centres with services and hours', ARRAY['ALL'], true, true, 'Assistance centres', '/assistance', NULL, NULL),
('MOD-INFO', 'Verified Information Feed', 'AI-curated and human-verified information from credible sources', ARRAY['ALL'], true, true, 'Verified information', '/information', 'sources', NULL),
('MOD-RUMOUR', 'Rumour Management', 'Track, verify, and correct misinformation circulating about the event', ARRAY['ALL'], true, true, 'Rumour tracker', '/rumours', NULL, NULL),
('MOD-AUDIT', 'Audit Trail', 'Immutable append-only log of all system actions for accountability', ARRAY['ALL'], true, false, NULL, NULL, 'audit', NULL),
('MOD-CONSULAR', 'Consular & Foreign National Support', 'Embassy coordination desk for foreign nationals affected', ARRAY['ALL'], true, false, NULL, NULL, 'consular', NULL),
('MOD-NEWS-AI', 'AI News Collector Agent', 'Automated credible news ingestion with human verification queue', ARRAY['ALL'], true, false, NULL, NULL, 'sources', NULL),
('MOD-GUIDES', 'Guides for Families', 'Step-by-step guides for reporting, tracing, and verifying information', ARRAY['ALL'], true, true, 'Guides', '/guides', NULL, NULL),
('MOD-PARTNERS', 'Partner Updates', 'Updates from relief agencies, police, hospitals, and consular services', ARRAY['ALL'], true, true, 'Partner updates', '/partner-updates', NULL, NULL),
('MOD-AGENCIES', 'Active Agencies', 'Directory of responding organisations and their roles', ARRAY['ALL'], true, true, 'Active agencies', '/agencies', 'organisations', NULL),
('MOD-TRACK', 'Case Tracker', 'Public case status lookup by reference code', ARRAY['ALL'], true, true, 'Track a case', '/track', NULL, ARRAY['MOD-TRACE']),

-- ── Flood / Glacier / Cloud Burst specific ───────────────
('MOD-TUNNEL', 'Tunnel & Underground Rescue', 'Track rescue operations at flooded tunnels, mines, and underground sites', ARRAY['FLOOD','GLACIER_BURST'], false, true, 'Rescue operations', '/rescue-sites', 'rescue', NULL),
('MOD-WATER-LVL', 'Water Level Monitoring', 'River and reservoir water level stations with alert thresholds', ARRAY['FLOOD','GLACIER_BURST','CLOUD_BURST','TSUNAMI'], false, true, 'Water levels', '/water-levels', NULL, NULL),
('MOD-SHELTER', 'Temporary Shelter Registry', 'Map of temporary shelters with real-time capacity and services', ARRAY['ALL'], false, true, 'Shelters', '/shelters', NULL, NULL),
('MOD-WATER-PT', 'Safe Water Points', 'Verified safe drinking water sources and distribution points', ARRAY['FLOOD','GLACIER_BURST','CLOUD_BURST','EARTHQUAKE','CYCLONE'], false, true, 'Safe water', '/water-points', NULL, NULL),
('MOD-RELIEF', 'Relief Distribution Schedule', 'Calendar of food, water, and supply distribution by location', ARRAY['ALL'], false, true, 'Relief schedule', '/relief', NULL, NULL),
('MOD-DAMAGE', 'Damage Assessment Self-Report', 'Form for households to report infrastructure damage and needs', ARRAY['EARTHQUAKE','FLOOD','GLACIER_BURST','CLOUD_BURST','CYCLONE','WILDFIRE'], false, true, 'Report damage', '/report-damage', NULL, NULL),

-- ── Earthquake specific ──────────────────────────────────
('MOD-BUILDING', 'Building Collapse Sites', 'Track search and rescue at collapsed structures', ARRAY['EARTHQUAKE'], false, true, 'Collapse sites', '/collapse-sites', 'collapse', NULL),
('MOD-AFTERSHOCK', 'Aftershock Alert Feed', 'Real-time aftershock alerts from seismological networks', ARRAY['EARTHQUAKE'], false, true, 'Aftershock alerts', '/aftershocks', NULL, NULL)

ON CONFLICT (module_id) DO UPDATE SET
    module_name = EXCLUDED.module_name,
    description = EXCLUDED.description,
    applicable_types = EXCLUDED.applicable_types,
    is_core = EXCLUDED.is_core,
    has_public_page = EXCLUDED.has_public_page,
    nav_label = EXCLUDED.nav_label,
    nav_path = EXCLUDED.nav_path,
    console_tab = EXCLUDED.console_tab,
    dependencies = EXCLUDED.dependencies;
