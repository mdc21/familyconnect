-- ============================================================
-- SPEC-008 Phase 4 Schema Migration
-- Module M5: Critical Infrastructure Status Tracking (Read/Aggregate view over authoritative sources)
-- Module M9: Funding & Aid Coordination Registry (Non-custodial pledge, allocation & delivery ledger)
-- ============================================================

-- ─── 1. Additional Phase 4 Data-Sharing Agreements ───────────
INSERT INTO data_sharing_agreement (
    agreement_ref, authority_name, authority_type, service_domain, jurisdiction, status, scope_description, signatory_title, legal_signoff_date, is_seed
) VALUES
    (
        'AGREE-NDRRMA-AID-2026',
        'National Disaster Risk Reduction and Management Authority (NDRRMA)',
        'NATIONAL_DISASTER_AGENCY',
        'CROSS_SECTOR',
        'NP',
        'ACTIVE',
        'Statutory coordination protocol for international and national disaster recovery pledges, donor transparency tracking, and reconstruction aid allocations.',
        'Chief Executive / Joint Secretary, NDRRMA',
        '2026-09-01',
        TRUE
    ),
    (
        'AGREE-SWC-INGO-2026',
        'Social Welfare Council (SWC) — Disaster Relief Division',
        'GOVERNMENT_MINISTRY',
        'CROSS_SECTOR',
        'NP',
        'ACTIVE',
        'Validation of INGO/NGO project agreements, disaster recovery budget approvals, and humanitarian sector allocations.',
        'Member Secretary, Social Welfare Council',
        '2026-09-02',
        TRUE
    ),
    (
        'AGREE-ARMY-ENGINEERING-2026',
        'Nepali Army — Engineering Corps & Debris Clearance Taskforce',
        'GOVERNMENT_MINISTRY',
        'ROAD_ACCESS',
        'NP',
        'ACTIVE',
        'Operational sitreps on explosive rock blasting, emergency bailey bridge launching, and glacial mudflow heavy clearance.',
        'Director of Military Engineering',
        '2026-09-03',
        TRUE
    )
ON CONFLICT (agreement_ref) DO UPDATE SET
    authority_name = EXCLUDED.authority_name,
    authority_type = EXCLUDED.authority_type,
    service_domain = EXCLUDED.service_domain,
    status = EXCLUDED.status,
    scope_description = EXCLUDED.scope_description;

-- ─── 2. Module M5: Critical Infrastructure Status ─────────────
CREATE TABLE IF NOT EXISTS infrastructure_status (
    infra_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    infra_reference             TEXT UNIQUE NOT NULL,
    infra_type                  TEXT NOT NULL CHECK (infra_type IN (
        'NATIONAL_HIGHWAY',
        'FEEDER_ROAD',
        'PERMANENT_BRIDGE',
        'BAILEY_BRIDGE',
        'DEBRIS_CLEARANCE_ZONE',
        'RIVER_EMBANKMENT',
        'HYDROPOWER_ACCESS_ROAD'
    )),
    asset_name                  TEXT NOT NULL,
    route_code                  TEXT, -- e.g., H02 (Pasang Lhamu), H04 (Araniko)
    district                    TEXT NOT NULL,
    locality_name               TEXT NOT NULL,
    chainage_km                 TEXT, -- e.g., KM 42+500
    operational_status          TEXT NOT NULL DEFAULT 'PASSABLE_ALL_VEHICLES' CHECK (operational_status IN (
        'PASSABLE_ALL_VEHICLES',
        'PASSABLE_LIGHT_4X4_ONLY',
        'EMERGENCY_SERVICES_ONLY',
        'RESTRICTED_TIMED_CONVOY',
        'BLOCKED_LANDSLIDE',
        'BAILEY_BRIDGE_UNDER_CONSTRUCTION',
        'WASHED_OUT_CLOSED'
    )),
    passable_vehicle_types      TEXT[] NOT NULL DEFAULT '{"HEAVY_TRUCK", "LIGHT_4X4", "MOTORCYCLE", "PEDESTRIAN"}',
    hazard_type                 TEXT CHECK (hazard_type IN (
        'DEBRIS_TORRENT',
        'ROCKFALL',
        'SLUMP_EROSION',
        'BRIDGE_ABUTMENT_SCOUR',
        'FLOOD_INUNDATION',
        'NONE'
    )),
    lead_authority_name         TEXT NOT NULL,
    agreement_ref               TEXT REFERENCES data_sharing_agreement(agreement_ref) ON DELETE RESTRICT,
    verification_reference      TEXT,
    verification_status         TEXT NOT NULL DEFAULT 'OFFICIAL_CONFIRMED' CHECK (verification_status IN (
        'UNVERIFIED',
        'VERIFIED',
        'OFFICIAL_CONFIRMED'
    )),
    contractor_org_id           UUID REFERENCES organisation(organisation_id) ON DELETE SET NULL,
    gps_coordinates             JSONB DEFAULT '{}'::jsonb,
    estimated_clearance_time    TIMESTAMPTZ,
    public_advisory             TEXT,
    last_reported_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_seed                     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infra_district ON infrastructure_status(district);
CREATE INDEX IF NOT EXISTS idx_infra_type ON infrastructure_status(infra_type);
CREATE INDEX IF NOT EXISTS idx_infra_status ON infrastructure_status(operational_status);
CREATE INDEX IF NOT EXISTS idx_infra_route ON infrastructure_status(route_code);
CREATE INDEX IF NOT EXISTS idx_infra_seed ON infrastructure_status(is_seed);

-- ─── 3. Module M9: Non-Custodial Funding & Aid Ledger ─────────

-- 3.1 Funding Pledges
CREATE TABLE IF NOT EXISTS funding_pledge (
    pledge_id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pledge_reference            TEXT UNIQUE NOT NULL,
    event_id                    TEXT REFERENCES disaster_event(event_id),
    donor_name                  TEXT NOT NULL,
    donor_actor_id              TEXT,
    donor_org_id                UUID REFERENCES organisation(organisation_id) ON DELETE SET NULL,
    pledge_type                 TEXT NOT NULL CHECK (pledge_type IN (
        'BILATERAL_GOVERNMENT',
        'MULTILATERAL_AGENCY',
        'INGO',
        'CORPORATE_FOUNDATION',
        'PRIVATE_PHILANTHROPY',
        'COMMUNITY_DIASPORA'
    )),
    currency                    TEXT NOT NULL DEFAULT 'NPR' CHECK (currency IN ('NPR', 'USD', 'EUR', 'GBP', 'INR')),
    amount_declared             NUMERIC(15, 2) NOT NULL CHECK (amount_declared > 0),
    amount_allocated            NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (amount_allocated <= amount_declared),
    amount_disbursed            NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (amount_disbursed <= amount_declared),
    target_sector               TEXT NOT NULL CHECK (target_sector IN (
        'DRINKING_WATER',
        'HOUSING_RECONSTRUCTION',
        'ELECTRICITY',
        'HEALTHCARE',
        'EDUCATION',
        'CRITICAL_INFRASTRUCTURE',
        'LIVELIHOODS',
        'CROSS_SECTOR_RECOVERY'
    )),
    target_locality             JSONB DEFAULT '{}'::jsonb,
    agreement_ref               TEXT REFERENCES data_sharing_agreement(agreement_ref) ON DELETE RESTRICT,
    ndrrma_tracking_no          TEXT,
    swc_approval_ref            TEXT,
    verification_status         TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN (
        'UNVERIFIED',
        'VERIFIED',
        'OFFICIAL_CONFIRMED',
        'REJECTED'
    )),
    status                      TEXT NOT NULL DEFAULT 'ANNOUNCED' CHECK (status IN (
        'ANNOUNCED',
        'COMMITTED',
        'ALLOCATED',
        'RECONCILED',
        'CANCELLED'
    )),
    public_visibility           TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (public_visibility IN (
        'PUBLIC',
        'ANONYMOUS_PUBLIC',
        'RESTRICTED_OFFICIAL'
    )),
    verified_by                 TEXT,
    verified_at                 TIMESTAMPTZ,
    notes                       TEXT,
    is_seed                     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pledge_status ON funding_pledge(status);
CREATE INDEX IF NOT EXISTS idx_pledge_sector ON funding_pledge(target_sector);
CREATE INDEX IF NOT EXISTS idx_pledge_verification ON funding_pledge(verification_status);
CREATE INDEX IF NOT EXISTS idx_pledge_seed ON funding_pledge(is_seed);

-- 3.2 Aid Allocations (linking pledges to M8 projects / tasks)
CREATE TABLE IF NOT EXISTS aid_allocation (
    allocation_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_reference        TEXT UNIQUE NOT NULL,
    pledge_id                   UUID NOT NULL REFERENCES funding_pledge(pledge_id) ON DELETE CASCADE,
    project_id                  UUID NOT NULL REFERENCES recovery_project(project_id) ON DELETE RESTRICT,
    task_id                     UUID REFERENCES recovery_task(task_id) ON DELETE SET NULL,
    recipient_org_id            UUID REFERENCES organisation(organisation_id) ON DELETE SET NULL,
    allocated_amount            NUMERIC(15, 2) NOT NULL CHECK (allocated_amount > 0),
    disbursed_amount            NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (disbursed_amount <= allocated_amount),
    currency                    TEXT NOT NULL DEFAULT 'NPR',
    allocation_status           TEXT NOT NULL DEFAULT 'PLANNED' CHECK (allocation_status IN (
        'PLANNED',
        'COMMITTED',
        'TRANSFERRED',
        'RECONCILED',
        'DISPUTED'
    )),
    external_wire_ref           TEXT,
    allocated_by_actor_id       TEXT,
    notes                       TEXT,
    is_seed                     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alloc_pledge ON aid_allocation(pledge_id);
CREATE INDEX IF NOT EXISTS idx_alloc_project ON aid_allocation(project_id);
CREATE INDEX IF NOT EXISTS idx_alloc_status ON aid_allocation(allocation_status);
CREATE INDEX IF NOT EXISTS idx_alloc_seed ON aid_allocation(is_seed);

-- 3.3 Triangulated Delivery Evidence Ledger (Multi-party Attestation)
CREATE TABLE IF NOT EXISTS aid_delivery_evidence (
    evidence_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_id               UUID NOT NULL REFERENCES aid_allocation(allocation_id) ON DELETE CASCADE,
    evidence_type               TEXT NOT NULL CHECK (evidence_type IN (
        'COMPLETION_CERTIFICATE',
        'BANK_DEPOSIT_RECEIPT',
        'GPS_PHOTO_SURVEY',
        'LOCAL_WARD_ACKNOWLEDGMENT',
        'THIRD_PARTY_AUDIT_REPORT'
    )),
    attestation_tier            TEXT NOT NULL CHECK (attestation_tier IN (
        'IMPLEMENTING_AGENCY',
        'LOCAL_GOVERNMENT_WARD',
        'INDEPENDENT_HUMANITARIAN_MONITOR'
    )),
    attesting_actor_id          TEXT NOT NULL,
    attesting_organisation      TEXT NOT NULL,
    evidence_url                TEXT,
    notes                       TEXT,
    verified_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_seed                     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliv_alloc ON aid_delivery_evidence(allocation_id);
CREATE INDEX IF NOT EXISTS idx_deliv_tier ON aid_delivery_evidence(attestation_tier);
CREATE INDEX IF NOT EXISTS idx_deliv_seed ON aid_delivery_evidence(is_seed);

-- ─── 4. Seed Data: Infrastructure & Aid Pledges ───────────────

-- Seed Infrastructure Status
INSERT INTO infrastructure_status (
    infra_reference,
    infra_type,
    asset_name,
    route_code,
    district,
    locality_name,
    chainage_km,
    operational_status,
    passable_vehicle_types,
    hazard_type,
    lead_authority_name,
    agreement_ref,
    verification_reference,
    gps_coordinates,
    estimated_clearance_time,
    public_advisory,
    is_seed
) VALUES
    (
        'INFRA-H02-TRISHULI-01',
        'NATIONAL_HIGHWAY',
        'Pasang Lhamu Highway (Betrawati to Dhunche Sector)',
        'H02',
        'Rasuwa',
        'Grang & Ramche Bluffs',
        'KM 38+200 to KM 44+100',
        'PASSABLE_LIGHT_4X4_ONLY',
        '{"LIGHT_4X4", "MOTORCYCLE"}',
        'ROCKFALL',
        'Department of Roads (DoR) — Bridge & Highway Division',
        'AGREE-DOR-ROADS-2026',
        'DOR-GALCHI-TRISHULI-REP-20260920',
        '{"lat": 28.112, "lng": 85.295}'::jsonb,
        '2026-10-04T12:00:00Z',
        'Single lane traffic operating under police convoy. Heavy trucks strictly held at Betrawati transit yard.',
        TRUE
    ),
    (
        'INFRA-H02-BAILEY-SYABRU',
        'BAILEY_BRIDGE',
        'Syabrubesi Bridge Replacement',
        'H02',
        'Rasuwa',
        'Syabrubesi Confluence',
        'KM 56+300',
        'BAILEY_BRIDGE_UNDER_CONSTRUCTION',
        '{"PEDESTRIAN"}',
        'BRIDGE_ABUTMENT_SCOUR',
        'Nepali Army — Engineering Corps & Debris Clearance Taskforce',
        'AGREE-ARMY-ENGINEERING-2026',
        'NA-ENG-CORPS-SITREP-0919',
        '{"lat": 28.161, "lng": 85.334}'::jsonb,
        '2026-10-10T18:00:00Z',
        '120-foot bailey bridge launching in progress by Army Engineers. Footbridge accessible with safety harnesses.',
        TRUE
    ),
    (
        'INFRA-H04-MELAMCHI-01',
        'FEEDER_ROAD',
        'Melamchi-Helambu Corridor Road',
        'F12',
        'Sindhupalchok',
        'Melamchi Pul Bazaar to Kiul',
        'KM 0+000 to KM 18+500',
        'PASSABLE_ALL_VEHICLES',
        '{"HEAVY_TRUCK", "LIGHT_4X4", "MOTORCYCLE", "PEDESTRIAN"}',
        'NONE',
        'Department of Roads (DoR) — Bridge & Highway Division',
        'AGREE-DOR-ROADS-2026',
        'DOR-CHARIKOT-DIV-994',
        '{"lat": 27.832, "lng": 85.581}'::jsonb,
        NULL,
        'Embankment raised and road fully restored for all humanitarian and commercial traffic.',
        TRUE
    )
ON CONFLICT (infra_reference) DO UPDATE SET
    operational_status = EXCLUDED.operational_status,
    passable_vehicle_types = EXCLUDED.passable_vehicle_types,
    hazard_type = EXCLUDED.hazard_type,
    estimated_clearance_time = EXCLUDED.estimated_clearance_time,
    public_advisory = EXCLUDED.public_advisory,
    last_verified_at = now();

-- Seed Funding Pledges & Allocations
INSERT INTO funding_pledge (
    pledge_reference,
    event_id,
    donor_name,
    pledge_type,
    currency,
    amount_declared,
    amount_allocated,
    amount_disbursed,
    target_sector,
    target_locality,
    agreement_ref,
    ndrrma_tracking_no,
    swc_approval_ref,
    verification_status,
    status,
    public_visibility,
    notes,
    is_seed
) VALUES
    (
        'PLG-2026-ADB-WATER-01',
        'EVENT-NP-TIBET-2026',
        'Asian Development Bank (ADB) — Emergency Recovery Facility',
        'MULTILATERAL_AGENCY',
        'USD',
        2500000.00,
        1500000.00,
        500000.00,
        'DRINKING_WATER',
        '{"districts": ["Rasuwa", "Sindhupalchok"]}'::jsonb,
        'AGREE-NDRRMA-AID-2026',
        'NDRRMA-GRANT-ADB-2026-088',
        'SWC-PA-2026-8812',
        'OFFICIAL_CONFIRMED',
        'COMMITTED',
        'PUBLIC',
        'Grant financing for municipal water treatment reconstruction and rural gravity schemes.',
        TRUE
    ),
    (
        'PLG-2026-RED-CROSS-SHELTER',
        'EVENT-NP-TIBET-2026',
        'Nepal Red Cross Society & IFRC Emergency Appeal',
        'INGO',
        'NPR',
        85000000.00,
        50000000.00,
        25000000.00,
        'HOUSING_RECONSTRUCTION',
        '{"districts": ["Rasuwa"]}'::jsonb,
        'AGREE-SWC-INGO-2026',
        'NDRRMA-IFRC-2026-041',
        'SWC-RELIEF-2026-90',
        'OFFICIAL_CONFIRMED',
        'ALLOCATED',
        'PUBLIC',
        'Transitional shelter kits, CGI roofing sheets, and cash-for-work reconstruction assistance.',
        TRUE
    ),
    (
        'PLG-2026-PRIVATE-DIASPORA',
        'EVENT-NP-TIBET-2026',
        'Anonymous Philanthropic Donor',
        'COMMUNITY_DIASPORA',
        'NPR',
        5000000.00,
        5000000.00,
        5000000.00,
        'HEALTHCARE',
        '{"district": "Rasuwa", "locality": "Dhunche"}'::jsonb,
        'AGREE-NDRRMA-AID-2026',
        'NDRRMA-DONOR-2026-9921',
        NULL,
        'OFFICIAL_CONFIRMED',
        'RECONCILED',
        'ANONYMOUS_PUBLIC',
        'Direct procurement of portable ultrasound and trauma surgical supplies for District Hospital.',
        TRUE
    )
ON CONFLICT (pledge_reference) DO UPDATE SET
    amount_allocated = EXCLUDED.amount_allocated,
    amount_disbursed = EXCLUDED.amount_disbursed,
    status = EXCLUDED.status,
    verification_status = EXCLUDED.verification_status;
