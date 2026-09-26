-- ============================================================
-- SPEC-008 Phase 3 Schema Migration: Module M4 Essential Services
-- Authoritative status tracking for Water, Power, Health, Schools,
-- Sanitation, and Telecoms under named data-sharing agreements.
-- ============================================================

-- ─── 1. Data-Sharing Agreement Registry ──────────────────────
CREATE TABLE IF NOT EXISTS data_sharing_agreement (
    agreement_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_ref       TEXT UNIQUE NOT NULL,
    authority_name      TEXT NOT NULL,
    authority_type      TEXT NOT NULL CHECK (authority_type IN (
        'GOVERNMENT_MINISTRY',
        'NATIONAL_DISASTER_AGENCY',
        'UTILITY_OPERATOR',
        'HUMANITARIAN_CLUSTER',
        'TELECOM_REGULATOR',
        'CIVIL_AVIATION'
    )),
    service_domain      TEXT NOT NULL CHECK (service_domain IN (
        'DRINKING_WATER',
        'ELECTRICITY',
        'HEALTHCARE',
        'EDUCATION',
        'SANITATION',
        'TELECOMMUNICATIONS',
        'ROAD_ACCESS',
        'CROSS_SECTOR'
    )),
    jurisdiction        TEXT NOT NULL DEFAULT 'NP',
    status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'UNDER_REVIEW')),
    scope_description   TEXT NOT NULL,
    signatory_title     TEXT,
    legal_signoff_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    expires_at          DATE,
    is_seed             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsa_ref ON data_sharing_agreement(agreement_ref);
CREATE INDEX IF NOT EXISTS idx_dsa_domain ON data_sharing_agreement(service_domain);
CREATE INDEX IF NOT EXISTS idx_dsa_status ON data_sharing_agreement(status);

-- ─── 2. Essential Service Status Table ───────────────────────
CREATE TABLE IF NOT EXISTS essential_service_status (
    service_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_reference           TEXT UNIQUE NOT NULL,
    service_type                TEXT NOT NULL CHECK (service_type IN (
        'DRINKING_WATER',
        'ELECTRICITY',
        'HEALTHCARE',
        'EDUCATION',
        'SANITATION',
        'TELECOMMUNICATIONS',
        'ROAD_ACCESS'
    )),
    community_id                TEXT REFERENCES community_profile(community_id) ON DELETE SET NULL,
    district                    TEXT NOT NULL,
    locality_name               TEXT NOT NULL,
    operational_status          TEXT NOT NULL DEFAULT 'OPERATIONAL' CHECK (operational_status IN (
        'OPERATIONAL',
        'PARTIALLY_OPERATIONAL',
        'DISRUPTED',
        'CRITICAL_OUTAGE',
        'RESTORATION_IN_PROGRESS',
        'UNKNOWN'
    )),
    affected_population_estimate INT DEFAULT 0,
    source_authority_id         UUID REFERENCES organisation(organisation_id) ON DELETE SET NULL,
    source_authority_name       TEXT NOT NULL,
    agreement_ref               TEXT REFERENCES data_sharing_agreement(agreement_ref) ON DELETE RESTRICT,
    verification_status         TEXT NOT NULL DEFAULT 'OFFICIAL_CONFIRMED' CHECK (verification_status IN (
        'UNVERIFIED',
        'VERIFIED',
        'OFFICIAL_CONFIRMED'
    )),
    verification_reference      TEXT,
    public_advisory             TEXT,
    restoration_task_id         UUID REFERENCES recovery_task(task_id) ON DELETE SET NULL,
    restoration_estimate        TIMESTAMPTZ,
    last_reported_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_seed                     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ess_community ON essential_service_status(community_id);
CREATE INDEX IF NOT EXISTS idx_ess_district ON essential_service_status(district);
CREATE INDEX IF NOT EXISTS idx_ess_type ON essential_service_status(service_type);
CREATE INDEX IF NOT EXISTS idx_ess_status ON essential_service_status(operational_status);
CREATE INDEX IF NOT EXISTS idx_ess_agreement ON essential_service_status(agreement_ref);
CREATE INDEX IF NOT EXISTS idx_ess_seed ON essential_service_status(is_seed);

-- ─── 3. Service Outage Ingestion & Provenance Log ────────────
CREATE TABLE IF NOT EXISTS service_outage_report (
    report_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id              UUID NOT NULL REFERENCES essential_service_status(service_id) ON DELETE CASCADE,
    service_type            TEXT NOT NULL,
    community_id            TEXT,
    district                TEXT NOT NULL,
    operational_status      TEXT NOT NULL,
    reported_by_authority   TEXT NOT NULL,
    reported_by_actor_id    TEXT,
    agreement_ref           TEXT NOT NULL,
    outage_description      TEXT NOT NULL,
    affected_population     INT DEFAULT 0,
    estimated_restoration   TIMESTAMPTZ,
    evidence                JSONB DEFAULT '[]'::jsonb,
    is_seed                 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sor_service ON service_outage_report(service_id);
CREATE INDEX IF NOT EXISTS idx_sor_agreement ON service_outage_report(agreement_ref);
CREATE INDEX IF NOT EXISTS idx_sor_seed ON service_outage_report(is_seed);

-- ─── 4. Seed Essential Service Data-Sharing Agreements ───────
INSERT INTO data_sharing_agreement (
    agreement_ref, authority_name, authority_type, service_domain, jurisdiction, status, scope_description, signatory_title, legal_signoff_date, is_seed
) VALUES
    (
        'AGREE-NEA-POWER-2026',
        'Nepal Electricity Authority (NEA)',
        'UTILITY_OPERATOR',
        'ELECTRICITY',
        'NP',
        'ACTIVE',
        'Real-time automated and verified manual transmission feeder and substation operational status exchange for disaster recovery zones.',
        'Executive Director, Distribution & Consumer Services',
        '2026-09-01',
        TRUE
    ),
    (
        'AGREE-DWSS-WATER-2026',
        'Department of Water Supply & Sewerage Management (DWSSM)',
        'GOVERNMENT_MINISTRY',
        'DRINKING_WATER',
        'NP',
        'ACTIVE',
        'Authoritative feed of piped water supply schemes, municipal reservoir chlorine levels, and emergency distribution points.',
        'Director General, DWSSM',
        '2026-09-02',
        TRUE
    ),
    (
        'AGREE-MOHP-HEALTH-2026',
        'Ministry of Health and Population (MoHP) / HEOC',
        'GOVERNMENT_MINISTRY',
        'HEALTHCARE',
        'NP',
        'ACTIVE',
        'Health Emergency Operations Center feed detailing district hospital casualty capacities, clinic status, and field triage deployment.',
        'Chief, Health Emergency Operation Center (HEOC)',
        '2026-09-01',
        TRUE
    ),
    (
        'AGREE-NTA-TELECOM-2026',
        'Nepal Telecommunications Authority (NTA)',
        'TELECOM_REGULATOR',
        'TELECOMMUNICATIONS',
        'NP',
        'ACTIVE',
        'Cellular BTS tower status, fiber backhaul integrity, and satellite voice terminal deployment status from licensed operators.',
        'Director of Infrastructure & Spectrum, NTA',
        '2026-09-03',
        TRUE
    ),
    (
        'AGREE-CEHRD-SCHOOLS-2026',
        'Centre for Education and Human Resource Development (CEHRD)',
        'GOVERNMENT_MINISTRY',
        'EDUCATION',
        'NP',
        'ACTIVE',
        'Tracking school building structural safety status, temporary learning center (TLC) locations, and school reopening timelines.',
        'Director, Inclusive Education Section, CEHRD',
        '2026-09-04',
        TRUE
    ),
    (
        'AGREE-DOR-ROADS-2026',
        'Department of Roads (DoR) — Bridge & Highway Division',
        'GOVERNMENT_MINISTRY',
        'ROAD_ACCESS',
        'NP',
        'ACTIVE',
        'National highway clearance reports, bailey bridge installation milestones, and heavy vehicle transit restrictions.',
        'Superintending Engineer, Planning Branch, DoR',
        '2026-09-01',
        TRUE
    )
ON CONFLICT (agreement_ref) DO UPDATE SET
    authority_name = EXCLUDED.authority_name,
    authority_type = EXCLUDED.authority_type,
    service_domain = EXCLUDED.service_domain,
    status = EXCLUDED.status,
    scope_description = EXCLUDED.scope_description,
    legal_signoff_date = EXCLUDED.legal_signoff_date;

-- ─── 5. Seed Authoritative Essential Service Status Records ───
INSERT INTO essential_service_status (
    service_reference,
    service_type,
    community_id,
    district,
    locality_name,
    operational_status,
    affected_population_estimate,
    source_authority_name,
    agreement_ref,
    verification_status,
    verification_reference,
    public_advisory,
    restoration_estimate,
    is_seed
) VALUES
    (
        'ESS-RASUWA-WATER-01',
        'DRINKING_WATER',
        'comm-rasuwa-dhunche',
        'Rasuwa',
        'Dhunche Bazaar & Ward 6',
        'RESTORATION_IN_PROGRESS',
        1850,
        'Department of Water Supply & Sewerage Management (DWSSM)',
        'AGREE-DWSS-WATER-2026',
        'OFFICIAL_CONFIRMED',
        'DWSSM-RASUWA-DISPATCH-2026-09-18-04',
        'Main gravity intake at Trishuli gorge repaired. Chlorinated bowser distribution active at Dhunche Main Chowk and District Hospital.',
        '2026-10-05T00:00:00Z',
        TRUE
    ),
    (
        'ESS-RASUWA-POWER-01',
        'ELECTRICITY',
        'comm-rasuwa-dhunche',
        'Rasuwa',
        'Dhunche Central Substation & Hospital Feeder',
        'PARTIALLY_OPERATIONAL',
        900,
        'Nepal Electricity Authority (NEA)',
        'AGREE-NEA-POWER-2026',
        'OFFICIAL_CONFIRMED',
        'NEA-GRID-RASUWA-FEED-882',
        'Hospital and administrative center on 24/7 dedicated line; residential rotational power schedule (4 hrs on / 4 hrs off).',
        '2026-10-02T00:00:00Z',
        TRUE
    ),
    (
        'ESS-RASUWA-HEALTH-01',
        'HEALTHCARE',
        'comm-rasuwa-dhunche',
        'Rasuwa',
        'Rasuwa District Hospital',
        'OPERATIONAL',
        0,
        'Ministry of Health and Population (MoHP) / HEOC',
        'AGREE-MOHP-HEALTH-2026',
        'OFFICIAL_CONFIRMED',
        'HEOC-SITREP-2026-09-20-NP',
        'Hospital fully operational with emergency surgery, blood bank, and trauma triage wards. Red Cross volunteer triage team active.',
        NULL,
        TRUE
    ),
    (
        'ESS-RASUWA-TELECOM-01',
        'TELECOMMUNICATIONS',
        'comm-rasuwa-dhunche',
        'Rasuwa',
        'Dhunche BTS Ridge Tower & Local Exchange',
        'OPERATIONAL',
        0,
        'Nepal Telecommunications Authority (NTA)',
        'AGREE-NTA-TELECOM-2026',
        'OFFICIAL_CONFIRMED',
        'NTA-BTS-MONITOR-0920',
        '4G mobile voice and data services restored on both NTC and Ncell towers; solar back-up generators fueled.',
        NULL,
        TRUE
    ),
    (
        'ESS-SINDHU-WATER-01',
        'DRINKING_WATER',
        'comm-sindhupalchok-chautara',
        'Sindhupalchok',
        'Chautara Municipality Wards 1-7',
        'OPERATIONAL',
        0,
        'Department of Water Supply & Sewerage Management (DWSSM)',
        'AGREE-DWSS-WATER-2026',
        'OFFICIAL_CONFIRMED',
        'DWSSM-SINDHU-REP-903',
        'Municipal water treatment plant functioning at standard operational capacity.',
        NULL,
        TRUE
    ),
    (
        'ESS-LANGTANG-POWER-01',
        'ELECTRICITY',
        'comm-langtang-kyangjin',
        'Rasuwa',
        'Kyangjin Gomba Upper Alpine Settlement',
        'DISRUPTED',
        18,
        'Nepal Electricity Authority (NEA)',
        'AGREE-NEA-POWER-2026',
        'OFFICIAL_CONFIRMED',
        'NEA-REMOTE-HYDRO-LANGTANG-03',
        'Micro-hydro penstock damaged by mudflow. Solar generator deployed for monastery satellite comms hub.',
        '2026-10-15T00:00:00Z',
        TRUE
    )
ON CONFLICT (service_reference) DO UPDATE SET
    service_type = EXCLUDED.service_type,
    community_id = EXCLUDED.community_id,
    district = EXCLUDED.district,
    locality_name = EXCLUDED.locality_name,
    operational_status = EXCLUDED.operational_status,
    affected_population_estimate = EXCLUDED.affected_population_estimate,
    source_authority_name = EXCLUDED.source_authority_name,
    agreement_ref = EXCLUDED.agreement_ref,
    verification_status = EXCLUDED.verification_status,
    verification_reference = EXCLUDED.verification_reference,
    public_advisory = EXCLUDED.public_advisory,
    restoration_estimate = EXCLUDED.restoration_estimate;
