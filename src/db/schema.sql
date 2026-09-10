-- FamilyConnect MVP schema
-- Derived from SPEC-002 (Domain Model) §54 MVP Data Boundary
-- PostgreSQL primary store per SPEC-005 §8; pg_trgm enabled for approximate matching per SPEC-007 §1

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- approximate name/descriptor matching

-- ============================================================
-- DISASTER EVENT
-- ============================================================
CREATE TABLE disaster_event (
    event_id            TEXT PRIMARY KEY,              -- e.g. EVENT-NP-TIBET-2026 (SPEC-003 X-Disaster-Event-ID)
    name                TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | CLOSING | CLOSED
    governance_authority TEXT,                          -- SPEC-004 §2 Governance Authority
    data_controller     TEXT,                           -- SPEC-004 §2 Controller/Processor model
    data_residency      TEXT,                           -- SPEC-004 §15 sovereign/compliant cloud region
    legal_basis_registry JSONB,                          -- SPEC-004 §3 configured Legal Basis Registry
    retention_policy    JSONB,                           -- SPEC-004 §20 configurable retention
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PERSON / FAMILY
-- ============================================================
CREATE TABLE person (
    person_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name          TEXT,
    middle_name         TEXT,
    last_name           TEXT,
    preferred_name      TEXT,
    date_of_birth       DATE,
    approximate_age     INT,
    gender              TEXT,
    nationality         TEXT,
    photograph_reference TEXT,
    phone               TEXT,
    email               TEXT,
    preferred_language  TEXT DEFAULT 'en',
    identity_verification_status TEXT DEFAULT 'UNVERIFIED',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_person_name_trgm ON person USING gin ((coalesce(first_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops);

CREATE TABLE identity_evidence ( -- basic, per SPEC-002 §6 / MVP boundary "basic IdentityEvidence"
    evidence_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL,
    evidence_type       TEXT NOT NULL, -- PHOTOGRAPH | PHYSICAL_DESCRIPTOR | CLOTHING | PERSONAL_EFFECT | IDENTITY_DOCUMENT
    descriptors         JSONB,         -- height, build, hair, eyes, scars, tattoos, clothing, effects
    source_organisation_id UUID,
    verification_status TEXT DEFAULT 'PENDING',
    classification      TEXT NOT NULL DEFAULT 'RESTRICTED', -- SPEC-004 §4
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    idempotency_key     UUID UNIQUE -- fixes Phase 3 follow-up: was previously a best-effort equality check
);

CREATE TABLE family_unit (
    family_unit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_contact_person_id UUID REFERENCES person(person_id),
    country             TEXT,
    preferred_language  TEXT DEFAULT 'en',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE person_relationship (
    relationship_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_a            UUID NOT NULL REFERENCES person(person_id),
    person_b            UUID NOT NULL REFERENCES person(person_id),
    relationship_type   TEXT NOT NULL,
    reported_by         UUID,
    verification_status TEXT DEFAULT 'SELF_ASSERTED', -- SPEC-004 §8 evidence ladder
    verified_by         UUID,
    verified_at         TIMESTAMPTZ
);

-- ============================================================
-- CASE
-- ============================================================
CREATE TABLE case_record (
    case_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_reference      TEXT UNIQUE NOT NULL,     -- e.g. FC-NP-2026-00892
    event_id            TEXT NOT NULL REFERENCES disaster_event(event_id),
    case_type           TEXT NOT NULL,            -- MISSING_PERSON | SAFETY_DECLARATION | FAMILY_ASSISTANCE | (Phase1 types)
    status              TEXT NOT NULL DEFAULT 'NEW',
    sub_status          TEXT,
    priority             TEXT DEFAULT 'P3',
    primary_person_id   UUID REFERENCES person(person_id),
    case_owner_org_id   UUID,
    authority_of_record TEXT,
    data_sharing_status TEXT NOT NULL DEFAULT 'NORMAL', -- NORMAL | RESTRICTED_PENDING_REVIEW (SPEC-004 §9)
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at    TIMESTAMPTZ,
    next_review_at      TIMESTAMPTZ,               -- BR-020: active cases require a next review date
    closed_at           TIMESTAMPTZ,
    closure_reason      TEXT,
    version             INT NOT NULL DEFAULT 1      -- backs ETag / If-Match optimistic locking (SPEC-003 §1)
);

CREATE TABLE case_person (
    case_id             UUID NOT NULL REFERENCES case_record(case_id),
    person_id           UUID NOT NULL REFERENCES person(person_id),
    role_in_case        TEXT NOT NULL, -- SUBJECT | REPORTER | FAMILY_MEMBER
    PRIMARY KEY (case_id, person_id, role_in_case)
);

-- ============================================================
-- SUBMISSIONS (SPEC-003 §3.1)
-- ============================================================
CREATE TABLE submission_receipt (
    submission_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_reference TEXT UNIQUE NOT NULL,
    submission_type     TEXT NOT NULL, -- SAFETY_DECLARATION | MISSING_REPORT
    submitted_by        UUID,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    linked_case_id      UUID REFERENCES case_record(case_id),
    processing_status   TEXT NOT NULL DEFAULT 'RECEIVED', -- BR-001/BR-002
    next_action         TEXT,
    expected_review_time TEXT,
    idempotency_key     UUID UNIQUE                 -- enforces SPEC-007 §2.A idempotency validation
);

CREATE TABLE missing_report (
    missing_report_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_record(case_id),
    person_id           UUID REFERENCES person(person_id),
    reporter_id         TEXT,
    relationship        TEXT,
    last_known_location JSONB,
    last_known_datetime TIMESTAMPTZ,
    last_contact_datetime TIMESTAMPTZ,
    circumstances       TEXT,
    companions          TEXT,
    distinguishing_information TEXT,
    source              TEXT,
    verification_status TEXT DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE safety_declaration (
    declaration_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id           UUID REFERENCES person(person_id),
    case_id             UUID REFERENCES case_record(case_id),
    declared_status     TEXT NOT NULL DEFAULT 'SAFE_REPORTED',
    current_location    JSONB,
    contact_method      TEXT,
    declaration_datetime TIMESTAMPTZ NOT NULL DEFAULT now(),
    verification_status TEXT DEFAULT 'PENDING',
    verified_by         TEXT,
    verified_at         TIMESTAMPTZ
);

-- ============================================================
-- LOCATION
-- ============================================================
CREATE TABLE family_location (
    family_location_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_unit_id      UUID REFERENCES family_unit(family_unit_id),
    person_id           UUID REFERENCES person(person_id),
    location            JSONB NOT NULL,
    location_type       TEXT,
    location_precision TEXT NOT NULL, -- COUNTRY|REGION|DISTRICT|CITY|FACILITY|AREA|APPROXIMATE|EXACT
    start_datetime      TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_datetime        TIMESTAMPTZ,
    source              TEXT,
    verification_status TEXT DEFAULT 'UNVERIFIED',
    visibility          TEXT NOT NULL DEFAULT 'SENSITIVE' -- classification per SPEC-004 §4
);

CREATE TABLE last_known_contact (
    contact_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id           UUID REFERENCES person(person_id),
    reporter_id         TEXT,
    datetime            TIMESTAMPTZ,
    location             JSONB,
    channel             TEXT,
    information          TEXT,
    evidence_reference  TEXT,
    confidence          TEXT,
    source              TEXT
);

-- ============================================================
-- ORGANISATION / CASE WORKER / ASSIGNMENT  (fixes Gap #3)
-- ============================================================
CREATE TABLE organisation (
    organisation_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    organisation_type   TEXT NOT NULL, -- AUTHORITY|POLICE|RESCUE|MEDICAL|HUMANITARIAN|CONSULAR|FORENSIC|TOUR_OPERATOR|...
    country             TEXT,
    contact_details     JSONB,
    verification_status TEXT DEFAULT 'PENDING', -- SPEC-004 §16 org verification chain
    operational_status  TEXT DEFAULT 'ACTIVE'
);

CREATE TABLE case_worker (
    case_worker_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT NOT NULL,
    organisation_id     UUID REFERENCES organisation(organisation_id),
    role                TEXT,
    authorisation_level TEXT,
    training_status     TEXT,
    active_status       TEXT DEFAULT 'ACTIVE'
);

CREATE TABLE case_assignment (
    assignment_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_record(case_id),
    organisation_id     UUID REFERENCES organisation(organisation_id),
    case_worker_id      UUID REFERENCES case_worker(case_worker_id),
    assignment_role     TEXT NOT NULL, -- PRIMARY_OWNER|SUPPORTING_ORGANISATION|AGENCY_LIAISON|SPECIALIST
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by         TEXT,
    ended_at            TIMESTAMPTZ
);

-- ============================================================
-- INFORMATION / VERIFICATION  (fixes Gap #1: write path for InformationUpdate)
-- ============================================================
CREATE TABLE information_update (
    information_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID REFERENCES case_record(case_id),
    event_id            TEXT REFERENCES disaster_event(event_id),
    information_type    TEXT NOT NULL, -- STATUS_UPDATE|NO_MATERIAL_CHANGE|LOCATION|MEDICAL|OTHER
    content             TEXT NOT NULL,
    source_id           UUID,
    verification_status TEXT NOT NULL DEFAULT 'PENDING', -- submitted|pending|partially_verified|verified|confirmed|rejected|superseded
    audience            TEXT NOT NULL DEFAULT 'CASE',     -- CASE|GROUP|EVENT (SPEC-001 §18)
    visibility_level    TEXT NOT NULL DEFAULT 'CONTROLLED',
    created_by          TEXT,
    verified_by         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at         TIMESTAMPTZ,
    valid_from          TIMESTAMPTZ,
    valid_until         TIMESTAMPTZ,
    translations        JSONB DEFAULT '{}',
    supersedes_information_id UUID REFERENCES information_update(information_id)
);

CREATE TABLE information_source (
    source_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type         TEXT NOT NULL, -- OFFICIAL_AUTHORITY|HOSPITAL|HUMANITARIAN|CONSULAR|TOUR_OPERATOR|FAMILY|AFFECTED_PERSON|COMMUNITY_RESPONDER|MEDIA|PUBLIC_REPORT|AI_ASSISTED
    organisation_id     UUID REFERENCES organisation(organisation_id),
    reliability_level    TEXT
);

CREATE TABLE verification (
    verification_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    information_id      UUID REFERENCES information_update(information_id),
    verification_status TEXT NOT NULL,
    verification_method  TEXT,
    verified_by          TEXT,
    verifying_organisation UUID REFERENCES organisation(organisation_id),
    verified_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    confidence           NUMERIC,
    notes                 TEXT
);

-- ============================================================
-- FAMILY AUTHORISATION / DISPUTE
-- ============================================================
CREATE TABLE family_authorisation (
    authorisation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_record(case_id),
    person_id           UUID REFERENCES person(person_id),
    relationship_claim  TEXT,
    access_level        TEXT NOT NULL, -- PUBLIC|REGISTERED_USER|AUTHORISED_FAMILY|CASE_WORKER|PARTNER_ORGANISATION|AUTHORISED_AGENCY|SPECIALIST|ADMIN
    verification_status TEXT DEFAULT 'PENDING',
    verification_method  TEXT,
    granted_by           TEXT,
    granted_at           TIMESTAMPTZ,
    expires_at           TIMESTAMPTZ,
    revoked_at           TIMESTAMPTZ
);

CREATE TABLE case_dispute (
    dispute_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_record(case_id),
    raised_by           TEXT,
    dispute_type        TEXT NOT NULL,
    description          TEXT,
    evidence_reference   TEXT[],
    status               TEXT NOT NULL DEFAULT 'OPEN',
    severity             TEXT,
    temporary_restriction BOOLEAN NOT NULL DEFAULT true, -- SPEC-004 §9: data sharing instantly frozen
    assigned_reviewer    TEXT,
    raised_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at           TIMESTAMPTZ,
    resolution            TEXT,
    resolution_authority   TEXT
);

-- ============================================================
-- ASSISTANCE  (fixes Gap #6: assistance centre directory)
-- ============================================================
CREATE TABLE family_need (
    need_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_record(case_id),
    need_type           TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assistance_request (
    assistance_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_record(case_id),
    need_id             UUID REFERENCES family_need(need_id),
    requested_service   TEXT NOT NULL,
    receiving_organisation UUID REFERENCES organisation(organisation_id),
    assigned_to         TEXT,
    priority             TEXT DEFAULT 'MEDIUM',
    status               TEXT NOT NULL DEFAULT 'TRIAGED',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    target_resolution_at TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ
);

CREATE TABLE assistance_centre (
    centre_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID REFERENCES organisation(organisation_id),
    event_id            TEXT REFERENCES disaster_event(event_id),
    name                TEXT NOT NULL,
    location             JSONB NOT NULL,
    opening_hours        TEXT,
    services              TEXT[],
    languages             TEXT[],
    accessibility         TEXT,
    emergency_contact     TEXT,
    operational_status    TEXT NOT NULL DEFAULT 'OPEN' -- classification: PUBLIC (SPEC-004 §4)
);

CREATE TABLE proxy_contact (
    proxy_contact_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    represented_family_id UUID REFERENCES family_unit(family_unit_id),
    represented_person_id UUID REFERENCES person(person_id),
    proxy_person_id      UUID REFERENCES person(person_id),
    relationship          TEXT,
    authority_scope        TEXT NOT NULL,
    verification_status     TEXT DEFAULT 'PENDING',
    contact_methods          JSONB,
    valid_from                TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until                TIMESTAMPTZ,
    revoked_at                  TIMESTAMPTZ
);

CREATE TABLE communication_attempt (
    communication_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES case_record(case_id),
    recipient            TEXT,
    channel               TEXT NOT NULL, -- WEB|EMAIL|SMS|VOICE|WHATSAPP|IN_PERSON|COMMUNITY_WORKER|RADIO|EMBASSY|HUMANITARIAN_ORGANISATION
    initiated_by          TEXT,
    purpose                TEXT,
    attempted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    outcome                  TEXT,
    acknowledgement           BOOLEAN,
    notes                      TEXT,
    next_action                 TEXT,
    idempotency_key             UUID UNIQUE, -- supports offline batch-upload replay safety (SPEC-006 §5)
    payload_hash                TEXT NOT NULL -- SPEC-003 §6: distinguishes a safe replay from a genuine 409 idempotency conflict
);

CREATE TABLE notification (
    notification_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id         TEXT,
    case_id              UUID REFERENCES case_record(case_id),
    notification_type    TEXT,
    channel                TEXT,
    priority                TEXT,
    sent_at                  TIMESTAMPTZ,
    delivered_at              TIMESTAMPTZ,
    acknowledged_at             TIMESTAMPTZ,
    status                       TEXT NOT NULL DEFAULT 'QUEUED',
    -- SPEC-005 §12 rule: SMS must never carry medical/forensic/safeguarding content
    contains_restricted_data     BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================
-- ESCALATION  (fixes Gap #5)
-- ============================================================
CREATE TABLE case_escalation (
    escalation_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id              UUID NOT NULL REFERENCES case_record(case_id),
    raised_by             TEXT,
    reason                 TEXT NOT NULL,
    severity                TEXT NOT NULL DEFAULT 'MEDIUM',
    status                   TEXT NOT NULL DEFAULT 'OPEN',
    assigned_to               TEXT,
    raised_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at                 TIMESTAMPTZ
);

-- ============================================================
-- SAFEGUARDING
-- ============================================================
CREATE TABLE safeguarding_alert (
    alert_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id              UUID REFERENCES case_record(case_id),
    category               TEXT NOT NULL, -- CHILD_PROTECTION|VULNERABLE_ADULT|TRAFFICKING|EXPLOITATION|ABUSE|RANSOM|FRAUD|IMMEDIATE_DANGER
    classification          TEXT NOT NULL DEFAULT 'HIGHLY_RESTRICTED',
    raised_by                 TEXT,
    raised_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    status                       TEXT NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE safeguarding_handover (
    handover_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    safeguarding_alert_id  UUID NOT NULL REFERENCES safeguarding_alert(alert_id),
    from_organisation        UUID REFERENCES organisation(organisation_id),
    receiving_organisation     UUID REFERENCES organisation(organisation_id),
    receiving_authority          TEXT,
    intervention_type              TEXT NOT NULL,
    date_time                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason                             TEXT,
    receiving_officer                   TEXT NOT NULL, -- badge/ID captured per SPEC-004 §12
    acknowledgement                       BOOLEAN NOT NULL DEFAULT false,
    authority_reference                    TEXT,
    status                                  TEXT NOT NULL DEFAULT 'PROPOSED',
    completed_at                              TIMESTAMPTZ
);

-- ============================================================
-- RUMOUR  (fixes Gap #2: submission + list/feed, not just correction)
-- ============================================================
CREATE TABLE disaster_rumour (
    rumour_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id              TEXT NOT NULL REFERENCES disaster_event(event_id),
    claim                   TEXT NOT NULL,
    first_reported_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    source                     TEXT,
    affected_area                TEXT,
    severity                       TEXT DEFAULT 'UNKNOWN',
    verification_status             TEXT NOT NULL DEFAULT 'REPORTED', -- REPORTED|UNDER_REVIEW|UNVERIFIED|FALSE|MISLEADING|CONFIRMED|SUPERSEDED|RESOLVED
    verification_source               TEXT,
    response_message                    TEXT,
    publication_status                    TEXT NOT NULL DEFAULT 'UNPUBLISHED',
    created_by                              TEXT,
    verified_by                               TEXT,
    translations                              JSONB DEFAULT '{}',
    resolved_at                                 TIMESTAMPTZ
);

-- ============================================================
-- HANDOVER
-- ============================================================
CREATE TABLE case_handover (
    handover_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                UUID NOT NULL REFERENCES case_record(case_id),
    originating_organisation UUID REFERENCES organisation(organisation_id),
    receiving_organisation     UUID,
    receiving_system              TEXT,
    external_case_reference         TEXT,
    handover_reason                    TEXT NOT NULL,
    data_categories_transferred          TEXT[],
    authorised_by                          TEXT NOT NULL,
    transferred_at                           TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledgement                            BOOLEAN NOT NULL DEFAULT false,
    status                                       TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE external_case_reference (
    external_reference_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                   UUID NOT NULL REFERENCES case_record(case_id),
    organisation_id             UUID REFERENCES organisation(organisation_id),
    system_name                   TEXT NOT NULL,
    external_case_id                 TEXT NOT NULL,
    reference_type                     TEXT,
    created_at                           TIMESTAMPTZ NOT NULL DEFAULT now(),
    active_status                          BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- TOUR GROUP
-- ============================================================
CREATE TABLE tour_group (
    group_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id           UUID REFERENCES organisation(organisation_id),
    itinerary               TEXT,
    departure                 DATE,
    expected_return              DATE,
    coordinator                    TEXT,
    member_count                      INT,
    verification_status                 TEXT DEFAULT 'UNVERIFIED'
);

CREATE TABLE tour_group_member (
    membership_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id              UUID NOT NULL REFERENCES tour_group(group_id),
    person_id             UUID REFERENCES person(person_id),
    role_in_group         TEXT DEFAULT 'PARTICIPANT', -- PARTICIPANT|GUIDE|COORDINATOR
    manifest_status       TEXT NOT NULL DEFAULT 'LISTED', -- LISTED|SAFE|MISSING|DECEASED|UNKNOWN
    linked_case_id        UUID REFERENCES case_record(case_id),
    added_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    idempotency_key       UUID UNIQUE -- supports safe re-upload of a manifest batch
);

-- ============================================================
-- CARE PREFERENCE (Phase 3)
-- ============================================================
CREATE TABLE care_preference (
    care_preference_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id               UUID NOT NULL REFERENCES case_record(case_id),
    person_id             UUID REFERENCES person(person_id),
    preference_type       TEXT NOT NULL, -- DIETARY|RELIGIOUS|MEDICAL_ACCOMMODATION|LANGUAGE|MOBILITY|MENTAL_HEALTH|CULTURAL|OTHER
    details               TEXT NOT NULL,
    classification        TEXT NOT NULL DEFAULT 'SENSITIVE', -- SPEC-004 §4; MEDICAL_ACCOMMODATION/MENTAL_HEALTH escalate to RESTRICTED at the application layer
    recorded_by           TEXT,
    recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    active_status         BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- AUDIT  (append-only; SPEC-007 §2.B Audit Immutability test)
-- ============================================================
CREATE TABLE audit_event (
    audit_id              BIGSERIAL PRIMARY KEY,
    "timestamp"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor                  TEXT NOT NULL,
    organisation             TEXT,
    action                     TEXT NOT NULL,
    entity_type                  TEXT NOT NULL,
    entity_id                      TEXT NOT NULL,
    previous_state                    JSONB,
    new_state                            JSONB,
    access_reason                           TEXT,
    outcome                                    TEXT NOT NULL
);

-- Enforce BR: "Attempt to DELETE or UPDATE records in AuditEvent using
-- application credentials; the database must reject these transactions."
-- (SPEC-007 §2.B). This is enforced at the database layer, not just the
-- application layer, so a compromised app tier still cannot tamper with audit.
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_event is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update
BEFORE UPDATE ON audit_event
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

CREATE TRIGGER audit_event_no_delete
BEFORE DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

-- ============================================================
-- INDEXES supporting rate-limit / enumeration shielding (BR-013)
-- ============================================================
CREATE INDEX idx_case_reference ON case_record(case_reference);
CREATE INDEX idx_submission_reference ON submission_receipt(submission_reference);

-- ============================================================
-- DNA SAMPLE REQUEST
-- Records a public request for a family reference DNA sample kit.
-- FamilyConnect does NOT hold genetic data; only contact details,
-- relationship claim, and the lab's own reference numbers are stored.
-- ============================================================
CREATE TABLE dna_sample_request (
    dna_request_id        BIGSERIAL PRIMARY KEY,
    tracking_reference    TEXT NOT NULL UNIQUE,     -- public-facing ref, e.g. DNA-20260901-XXXX
    disaster_event_id     TEXT NOT NULL,
    requester_name        TEXT NOT NULL,
    requester_email       TEXT NOT NULL,
    requester_phone       TEXT,
    relationship          TEXT NOT NULL,            -- free text, e.g. "mother", "sibling"
    missing_person_name   TEXT,
    case_reference        TEXT,                     -- FK hint (nullable; reporter may not have filed yet)
    preferred_location    TEXT,                     -- where they can attend to give sample
    missing_person_details TEXT,                    -- physical description, clothing etc.
    status                TEXT NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','COORDINATOR_CONTACTED','SAMPLE_TAKEN','LAB_RECEIVED','CLOSED')),
    lab_reference         TEXT,                     -- lab's own ID once received
    submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dna_tracking_reference ON dna_sample_request(tracking_reference);
CREATE INDEX idx_dna_requester_email    ON dna_sample_request(requester_email);

-- ============================================================
-- AI NEWS AGENT & VERIFICATION QUEUE
-- ============================================================
CREATE TABLE ai_news_item (
    news_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                TEXT NOT NULL REFERENCES disaster_event(event_id),
    title                   TEXT NOT NULL,
    summary                 TEXT NOT NULL,
    source_name             TEXT NOT NULL, -- e.g. ReliefWeb (UN OCHA), Kathmandu Post, Nepal Police, Consular Desk
    source_type             TEXT NOT NULL, -- OFFICIAL_AUTHORITY|MEDIA|HOSPITAL|POLICE|CONSULAR|AID_AGENCY|PUBLIC_REPORT
    source_url              TEXT,
    category                TEXT NOT NULL DEFAULT 'RESCUE', -- RESCUE|CASUALTIES|INFRASTRUCTURE|AID|CONSULAR|RUMOUR_CHECK
    credibility_score       NUMERIC(3,2) NOT NULL DEFAULT 0.85, -- 0.00 to 1.00
    proposed_status         TEXT NOT NULL DEFAULT 'VERIFIED', -- VERIFIED|UNVERIFIED|FALSE|MISLEADING|PENDING
    status                  TEXT NOT NULL DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW|PUBLISHED|REJECTED|CONVERTED_TO_RUMOUR
    published_as_update_id UUID REFERENCES information_update(information_id),
    published_as_rumour_id UUID REFERENCES disaster_rumour(rumour_id),
    translations            JSONB DEFAULT '{}',
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by             TEXT,
    reviewed_at             TIMESTAMPTZ
);

CREATE TABLE ai_agent_schedule (
    agent_id               TEXT PRIMARY KEY DEFAULT 'NEPAL_TIBET_GLOF_AGENT',
    event_id               TEXT NOT NULL REFERENCES disaster_event(event_id),
    current_phase          TEXT NOT NULL DEFAULT 'WEEK_1', -- WEEK_1|WEEKS_2_TO_5|PAUSED
    interval_hours         INTEGER NOT NULL DEFAULT 6,
    last_run_at            TIMESTAMPTZ,
    next_run_at            TIMESTAMPTZ,
    items_ingested_count   INTEGER DEFAULT 0
);

CREATE INDEX idx_ai_news_status ON ai_news_item(status);
CREATE INDEX idx_ai_news_event ON ai_news_item(event_id);

-- ============================================================
-- PARTNER ORGANISATIONS & AUTHORITY REGISTRATIONS
-- ============================================================
CREATE TABLE partner_organisation_registration (
    registration_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_name       TEXT NOT NULL,
    org_type                TEXT NOT NULL, -- POLICE|HOSPITAL|GOVERNMENT|AID_AGENCY|CONSULAR|TOUR_OPERATOR
    country                 TEXT NOT NULL DEFAULT 'Nepal',
    contact_name            TEXT NOT NULL,
    contact_email           TEXT NOT NULL,
    contact_phone           TEXT,
    response_role_description TEXT,
    status                  TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION', -- PENDING_VERIFICATION|VERIFIED|REJECTED
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- HYDROPOWER TUNNEL RESCUE & WORKER ROSTERS
-- ============================================================
CREATE TABLE tunnel_site (
    site_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_name               TEXT NOT NULL,
    district                TEXT NOT NULL,
    operator_company        TEXT NOT NULL,
    estimated_trapped       INT DEFAULT 0,
    rescued_count           INT DEFAULT 0,
    confirmed_fatalities    INT DEFAULT 0,
    operational_status      TEXT NOT NULL DEFAULT 'DRILLING_IN_PROGRESS',
    drilling_progress_m     DECIMAL(6,2) DEFAULT 0.0,
    target_depth_m          DECIMAL(6,2) DEFAULT 0.0,
    last_status_update      TEXT NOT NULL,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tunnel_worker_roster (
    roster_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                 UUID NOT NULL REFERENCES tunnel_site(site_id) ON DELETE CASCADE,
    worker_name             TEXT NOT NULL,
    designation             TEXT,
    contractor_company      TEXT,
    shift_date              DATE,
    status                  TEXT NOT NULL DEFAULT 'UNACCOUNTED',
    reported_by_family      BOOLEAN DEFAULT false,
    family_contact_phone    TEXT,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tunnel_site_status ON tunnel_site(operational_status);
CREATE INDEX idx_tunnel_roster_site ON tunnel_worker_roster(site_id);




