-- ============================================================
-- SPEC-008 Phase 2 Seed Data: Active Disaster Community Profiles
-- Seed data for Nepal & Assam disaster localities
-- All rows are explicitly marked with is_seed = TRUE for safe cleanup
-- ============================================================

-- 1. Community Profiles (M3)
INSERT INTO community_profile (
    community_id, 
    name, 
    event_id, 
    admin_hierarchy, 
    population_estimate, 
    min_aggregation_threshold, 
    service_states, 
    is_seed
)
VALUES 
    (
        'comm-rasuwa-dhunche',
        'Dhunche Bazaar & Environs',
        'EVENT-NP-TIBET-2026',
        '{"country": "NP", "province": "Bagmati", "district": "Rasuwa", "municipality": "Gosaikunda Rural Municipality", "ward": "Ward 6"}'::jsonb,
        2450,
        25,
        '[
            {"service_type": "DRINKING_WATER", "status": "RESTORATION_IN_PROGRESS", "details": "Main gravity pipeline breached by debris torrent; 3 emergency water points operational", "last_verified": "2026-09-20T10:00:00Z"},
            {"service_type": "ELECTRICITY", "status": "PARTIAL", "details": "Trishuli line 70% functional; high-voltage feeders to Dhunche hospital prioritized", "last_verified": "2026-09-20T12:00:00Z"},
            {"service_type": "TELECOMMUNICATIONS", "status": "OPERATIONAL", "details": "Ncell & Nepal Telecom 3G towers active; satellite backup at DAO", "last_verified": "2026-09-20T08:30:00Z"},
            {"service_type": "HEALTHCARE", "status": "OPERATIONAL", "details": "Rasuwa District Hospital operating 24/7 with emergency surgical triage", "last_verified": "2026-09-20T14:00:00Z"},
            {"service_type": "ROAD_ACCESS", "status": "RESTRICTED", "details": "Pasang Lhamu Highway passable for light 4x4 vehicles only; heavy trucks held at Betrawati", "last_verified": "2026-09-20T15:00:00Z"}
        ]'::jsonb,
        TRUE
    ),
    (
        'comm-sindhupalchok-chautara',
        'Chautara Urban Hub',
        'EVENT-NP-TIBET-2026',
        '{"country": "NP", "province": "Bagmati", "district": "Sindhupalchok", "municipality": "Chautara Sangachokgadhi Municipality", "ward": "Ward 4 & 5"}'::jsonb,
        5800,
        25,
        '[
            {"service_type": "DRINKING_WATER", "status": "OPERATIONAL", "details": "Chlorinated municipal network operating on scheduled 4-hour shifts", "last_verified": "2026-09-20T09:00:00Z"},
            {"service_type": "ELECTRICITY", "status": "OPERATIONAL", "details": "Grid supply stable across wards 1-7", "last_verified": "2026-09-20T11:00:00Z"},
            {"service_type": "TELECOMMUNICATIONS", "status": "OPERATIONAL", "details": "All commercial carriers operational; fiber line fully restored", "last_verified": "2026-09-20T09:30:00Z"},
            {"service_type": "HEALTHCARE", "status": "OPERATIONAL", "details": "Sindhupalchok District Hospital and 2 private clinics functional", "last_verified": "2026-09-20T13:00:00Z"},
            {"service_type": "ROAD_ACCESS", "status": "OPERATIONAL", "details": "Araniko highway connection cleared and open for all traffic", "last_verified": "2026-09-20T16:00:00Z"}
        ]'::jsonb,
        TRUE
    ),
    (
        'comm-langtang-kyangjin',
        'Kyangjin Gomba Alpine Settlement',
        'EVENT-NP-TIBET-2026',
        '{"country": "NP", "province": "Bagmati", "district": "Rasuwa", "municipality": "Gosaikunda Rural Municipality", "ward": "Ward 4 (Upper Valley)"}'::jsonb,
        18,
        25,
        '[
            {"service_type": "DRINKING_WATER", "status": "DISRUPTED", "details": "Glacial stream silted; boil-water advisory in place", "last_verified": "2026-09-20T07:00:00Z"},
            {"service_type": "ELECTRICITY", "status": "DISRUPTED", "details": "Micro-hydro penstock damaged by mudflow", "last_verified": "2026-09-20T07:00:00Z"},
            {"service_type": "TELECOMMUNICATIONS", "status": "RESTRICTED", "details": "Satellite phone available at community monastery only", "last_verified": "2026-09-20T07:00:00Z"},
            {"service_type": "HEALTHCARE", "status": "PARTIAL", "details": "Community health post damaged; army paramedic team on site", "last_verified": "2026-09-20T07:00:00Z"},
            {"service_type": "ROAD_ACCESS", "status": "CLOSED", "details": "Mule trail washed out between Bamboo and Rimche; helicopter access only", "last_verified": "2026-09-20T07:00:00Z"}
        ]'::jsonb,
        TRUE
    ),
    (
        'comm-kamrup-guwahati',
        'Guwahati Riverfront & Relief Zone',
        'EVENT-IN-FL-2026-1187',
        '{"country": "IN", "state": "Assam", "district": "Kamrup Metropolitan", "circle": "Guwahati Sadar"}'::jsonb,
        12000,
        25,
        '[
            {"service_type": "DRINKING_WATER", "status": "PARTIAL", "details": "Jal Board mobile water tankers serving all 6 designated relief camps", "last_verified": "2026-09-20T09:00:00Z"},
            {"service_type": "ELECTRICITY", "status": "OPERATIONAL", "details": "APDCL grid active with scheduled safety shutdowns in inundated low areas", "last_verified": "2026-09-20T11:00:00Z"},
            {"service_type": "HEALTHCARE", "status": "OPERATIONAL", "details": "Gauhati Medical College Hospital receiving flood casualties and waterborne triage", "last_verified": "2026-09-20T12:00:00Z"}
        ]'::jsonb,
        TRUE
    ),
    (
        'comm-goalpara-town',
        'Goalpara Town & Embankment Zone',
        'EVENT-IN-FL-2026-1187',
        '{"country": "IN", "state": "Assam", "district": "Goalpara", "circle": "Balijana / Town"}'::jsonb,
        4200,
        25,
        '[
            {"service_type": "DRINKING_WATER", "status": "RESTORATION_IN_PROGRESS", "details": "Submerged borewells shut down; portable purification plants deploying", "last_verified": "2026-09-20T10:00:00Z"},
            {"service_type": "ELECTRICITY", "status": "PARTIAL", "details": "Substation 2 waterlogged; feeder lines under emergency maintenance", "last_verified": "2026-09-20T10:30:00Z"},
            {"service_type": "HEALTHCARE", "status": "OPERATIONAL", "details": "Goalpara Civil Hospital high-ground ward operational", "last_verified": "2026-09-20T11:00:00Z"}
        ]'::jsonb,
        TRUE
    )
ON CONFLICT (community_id) DO UPDATE 
SET 
    name = EXCLUDED.name,
    event_id = EXCLUDED.event_id,
    admin_hierarchy = EXCLUDED.admin_hierarchy,
    population_estimate = EXCLUDED.population_estimate,
    min_aggregation_threshold = EXCLUDED.min_aggregation_threshold,
    service_states = EXCLUDED.service_states,
    is_seed = TRUE;

-- 2. Correlated Recovery Needs (linked to these seeded communities for live metrics)
INSERT INTO recovery_need (
    need_id,
    event_id,
    category,
    location,
    affected_population,
    severity,
    narrative,
    verification_state,
    data_sharing_status,
    status,
    is_seed
)
VALUES
    (
        '00000000-0000-0000-0008-000000000001',
        'EVENT-NP-TIBET-2026',
        'DRINKING_WATER',
        '{"communityId": "comm-rasuwa-dhunche", "village": "Bazaar Ward 6"}'::jsonb,
        45,
        'HIGH',
        'Polyethylene water distribution piping required for 15 households cut off from feeder tank.',
        'VERIFIED',
        'NORMAL',
        'ASSIGNED',
        TRUE
    ),
    (
        '00000000-0000-0000-0008-000000000002',
        'EVENT-NP-TIBET-2026',
        'TEMPORARY_SHELTER',
        '{"communityId": "comm-rasuwa-dhunche", "village": "Lower Dhunche"}'::jsonb,
        18,
        'CRITICAL',
        'Slope destabilization behind 3 residential dwellings requires relocation to community shelter.',
        'VERIFIED',
        'NORMAL',
        'IN_PROGRESS',
        TRUE
    ),
    (
        '00000000-0000-0000-0008-000000000003',
        'EVENT-NP-TIBET-2026',
        'HEALTHCARE',
        '{"communityId": "comm-sindhupalchok-chautara", "village": "Chautara North"}'::jsonb,
        120,
        'MEDIUM',
        'Supplemental medical supplies and tetanus toxoid vials requested for mobile clinic.',
        'VERIFIED',
        'NORMAL',
        'RESOLVED',
        TRUE
    ),
    (
        '00000000-0000-0000-0008-000000000004',
        'EVENT-NP-TIBET-2026',
        'FOOD_SECURITY',
        '{"communityId": "comm-sindhupalchok-chautara", "village": "Chautara South"}'::jsonb,
        60,
        'MEDIUM',
        'Dry ration replenishment for 12 displaced households.',
        'UNVERIFIED',
        'NORMAL',
        'REPORTED',
        TRUE
    ),
    (
        '00000000-0000-0000-0008-000000000005',
        'EVENT-NP-TIBET-2026',
        'SHELTER',
        '{"communityId": "comm-langtang-kyangjin", "village": "Alpine Ridge"}'::jsonb,
        8,
        'HIGH',
        'Insulated winter tents for high-altitude herder families.',
        'VERIFIED',
        'NORMAL',
        'REPORTED',
        TRUE
    )
ON CONFLICT (need_id) DO NOTHING;
