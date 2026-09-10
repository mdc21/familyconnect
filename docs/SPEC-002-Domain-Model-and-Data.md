# SPEC-002 — DOMAIN MODEL & DATA SPECIFICATION

## FamilyConnect

### Disaster Family Assistance, Reconnection & Coordination Platform

**Version:** 0.4**Status:** Implemented Baseline — Synchronized with Active Codebase**Parent:** SPEC-001 v0.4**Date:** 10 September 2026**Methodology:** Spec-Driven Development

# 1. Purpose

### SPEC-002 defines the canonical FamilyConnect domain model.

It establishes:

- entities;
- relationships;
- case lifecycle;
- information provenance;
- verification;
- family authority;
- assistance;
- safeguarding;
- communication;
- privacy classification;
- disaster misinformation;
- external handover;
- auditability.
The specification remains technology-neutral.

# 2. Domain Principles

### DMP-01

Person is not Case.

### DMP-02

Family relationship is not authorisation.

### DMP-03

Case is the operational coordination unit.

### DMP-04

Information must have provenance.

### DMP-05

Source is not necessarily authority.

### DMP-06

Uncertainty must be represented explicitly.

### DMP-07

Disputes must be represented explicitly.

### DMP-08

AI is never the authority of record.

### DMP-09

Death cannot be automatically determined.

### DMP-10

Minimum necessary data must be collected.

### DMP-11

Digital and physical operations must both be supported.

### DMP-12

Critical actions must be auditable.

# 3. Core Domain Model

DISASTER EVENT                         │       ┌─────────────────┼──────────────────┐       │                 │                  │      CASE             RUMOUR          ORGANISATION       │                                    │ ┌─────┼───────────┐                        │ │     │           │                        │PERSON FAMILY    INFORMATION          CASE ASSIGNMENT │     │           │ │     │       VERIFICATION │     │           │ │     └───── AUTHORISATION │ ├── Identity Evidence ├── Tour Group └── Care PreferenceCASE │ ├── Missing Report ├── Safety Declaration ├── Family Need ├── Assistance Request ├── Communication ├── Escalation ├── Safeguarding ├── Dispute └── Handover

# 4. Core Entities


| Entity | MVP | Purpose |
| --- | --- | --- |
| DisasterEvent | YES | Disaster context |
| Person | YES | Individual |
| FamilyUnit | YES | Family context |
| PersonRelationship | YES | Relationship |
| Case | YES | Coordination unit |
| CasePerson | YES | Person-case relationship |
| MissingReport | YES | Missing report |
| SafetyDeclaration | YES | Safety declaration |
| SubmissionReceipt | YES | Submission acknowledgement |
| Location | YES | Geographic information |
| FamilyLocation | YES | Family location |
| LastKnownContact | YES | Last contact |
| Organisation | YES | Participating organisation |
| AgencyRole | YES | Organisation role |
| CaseWorker | YES | Human coordinator |
| CaseAssignment | YES | Case ownership |
| InformationUpdate | YES | Information |
| InformationSource | YES | Provenance |
| Verification | YES | Verification |
| FamilyAuthorisation | YES | Family access |
| CaseDispute | YES | Contested access/identity |
| FamilyNeed | YES | Family requirement |
| AssistanceRequest | YES | Operational assistance |
| AssistanceCentre | YES | Physical support |
| ProxyContact | YES | Family representative |
| CommunicationAttempt | YES | Communication |
| Notification | YES | Digital notification |
| CaseEscalation | YES | Escalation |
| SafeguardingAlert | YES | Safeguarding |
| SafeguardingHandover | YES | Intervention handover |
| DisasterRumour | YES | Disaster-level misinformation |
| CaseHandover | YES | External transfer |
| ExternalCaseReference | YES | External identifier |
| AuditEvent | YES | Audit trail |
| TourGroup | YES | Travel grouping |
| IdentityEvidence | YES-basic | Identification support |
| CarePreference | Phase 1 | Explicit cultural/family wishes |
| HospitalEncounter | Phase 1 | Medical encounter |
| UnidentifiedPerson | Phase 1 | Unidentified person |
| DeceasedPerson | Phase 1 | Deceased person |
| ForensicIdentification | Phase 1 | Formal identification |
| ConsularCase | Phase 1 | Consular support |
| RepatriationCase | Phase 1 | Repatriation |

# 5. Person

Represents an individual.

### Attributes

- person_id
- first_name
- middle_name
- last_name
- preferred_name
- date_of_birth
- approximate_age
- gender
- nationality
- photograph_reference
- phone
- email
- preferred_language
- identity_verification_status
- created_at
- updated_at.
Sensitive attributes require controlled access.

# 6. IdentityEvidence

Supports identity matching.

### Evidence types

- photograph;
- physical descriptor;
- clothing;
- personal effect;
- identity document;
- dental-record reference;
- biometric reference;
- medical reference;
- family information.
### Physical descriptors

Where justified:

- approximate height;
- build;
- hair;
- eyes;
- scars;
- tattoos;
- clothing;
- footwear;
- personal effects.
Raw biometric templates should not be stored by default.

# 7. FamilyUnit

Represents a family/household relationship context.

Attributes:

- family_unit_id;
- primary contact;
- country;
- preferred language;
- created_at;
- updated_at.
It is not intended to establish a legal definition of family.

# 8. PersonRelationship

Represents:

- parent;
- child;
- spouse;
- sibling;
- partner;
- guardian;
- relative;
- friend;
- colleague;
- other.
Attributes:

- relationship_id;
- person_a;
- person_b;
- relationship_type;
- reported_by;
- verification_status;
- verified_by;
- verified_at.
# 9. Case

Primary coordination object.

### Attributes

- case_id;
- case_reference;
- event_id;
- case_type;
- status;
- priority;
- primary_person_id;
- case_owner;
- authority_of_record;
- opened_at;
- last_verified_at;
- next_review_at;
- closed_at;
- closure_reason.
# 10. Case Types

### MVP

- MISSING_PERSON
- SAFETY_DECLARATION
- FAMILY_ASSISTANCE.
### Phase 1

- HOSPITALISED_PERSON
- UNIDENTIFIED_PERSON
- DECEASED_PERSON
- CONSULAR_ASSISTANCE
- REPATRIATION.
# 11. Case Status

NEW ↓TRIAGE ↓ACTIVE ├── MISSING │    ├── POTENTIAL_MATCH │    ├── LOCATED │    ├── HOSPITALISED │    ├── SAFE_CONFIRMED │    └── IDENTITY_PENDING │ ├── ESCALATED ├── DISPUTED └── TRANSFERRED          ↓       EXTERNAL AUTHORITYDECEASED ↓IDENTITY_CONFIRMED ↓REPATRIATION ↓CLOSED

# 12. SubmissionReceipt

Provides immediate acknowledgement.

### Attributes

- submission_id;
- submission_type;
- submitted_by;
- submitted_at;
- received_at;
- generated_reference;
- linked_case_id;
- processing_status;
- next_action;
- expected_review_time.
### Status

- RECEIVED
- VALIDATING
- LINKED_TO_CASE
- PENDING_HUMAN_REVIEW
- ACTION_REQUIRED
- COMPLETED
- DUPLICATE
- REJECTED.
# 13. MissingReport

Attributes:

- missing_report_id;
- case_id;
- person_id;
- reporter_id;
- relationship;
- last_known_location;
- last_known_datetime;
- last_contact_datetime;
- circumstances;
- companions;
- distinguishing_information;
- source;
- created_at;
- verification_status.
# 14. SafetyDeclaration

Attributes:

- declaration_id;
- person_id;
- case_id if known;
- declared_status;
- current_location;
- contact_method;
- declaration_datetime;
- verification_status;
- verified_by;
- verified_at.
States:

- SAFE_REPORTED
- SAFE_PENDING_VERIFICATION
- SAFE_CONFIRMED.
# 15. Location

Supports different precision levels:

- COUNTRY
- REGION
- DISTRICT
- CITY
- FACILITY
- AREA
- APPROXIMATE
- EXACT.
Exact location must be restricted.

# 16. FamilyLocation

Attributes:

- family_location_id;
- family_unit_id;
- person_id;
- location;
- location_type;
- precision;
- start_datetime;
- end_datetime;
- source;
- verification_status;
- visibility.
Supports:

- Kathmandu;
- hotel;
- assistance centre;
- embassy;
- hospital;
- other.
# 17. LastKnownContact

Attributes:

- contact_id;
- person_id;
- reporter_id;
- datetime;
- location;
- channel;
- information;
- evidence_reference;
- confidence;
- source.
Multiple contacts may exist.

# 18. Organisation

Attributes:

- organisation_id;
- name;
- organisation_type;
- country;
- contact_details;
- verification_status;
- operational_status.
# 19. AgencyRole

Examples:

- AUTHORITY;
- POLICE;
- RESCUE;
- MEDICAL;
- HUMANITARIAN;
- CONSULAR;
- FORENSIC;
- TOUR_OPERATOR;
- FAMILY_ASSISTANCE;
- TRANSPORT;
- INTERPRETATION.
# 20. CaseWorker

Attributes:

- case_worker_id;
- user_id;
- organisation_id;
- role;
- authorisation_level;
- training_status;
- active_status.
# 21. CaseAssignment

Attributes:

- assignment_id;
- case_id;
- organisation_id;
- case_worker_id;
- assignment_role;
- assigned_at;
- assigned_by;
- ended_at.
Roles:

- PRIMARY_OWNER
- SUPPORTING_ORGANISATION
- AGENCY_LIAISON
- SPECIALIST.
# 22. InformationUpdate

Attributes:

- information_id;
- case_id;
- event_id;
- information_type;
- content;
- source_id;
- verification_status;
- created_at;
- verified_at;
- valid_from;
- valid_until;
- audience;
- visibility_level;
- created_by;
- verified_by;
- supersedes_information_id.
# 23. InformationSource

Source types:

- OFFICIAL_AUTHORITY
- HOSPITAL
- HUMANITARIAN
- CONSULAR
- TOUR_OPERATOR
- FAMILY
- AFFECTED_PERSON
- COMMUNITY_RESPONDER
- MEDIA
- PUBLIC_REPORT
- AI_ASSISTED.
Source does not automatically equal authority.

# 24. Verification

Attributes:

- verification_id;
- information_id;
- verification_status;
- verification_method;
- verified_by;
- verifying_organisation;
- verified_at;
- confidence;
- notes.
States:

- VERIFIED
- PARTIALLY_VERIFIED
- PENDING
- UNVERIFIED
- REJECTED
- SUPERSEDED.
# 25. FamilyAuthorisation

Attributes:

- authorisation_id;
- case_id;
- person_id;
- relationship_claim;
- access_level;
- verification_status;
- verification_method;
- granted_by;
- granted_at;
- expires_at;
- revoked_at.
States:

- PENDING
- VERIFIED
- DISPUTED
- SUSPENDED
- REVOKED
- EXPIRED.
# 26. CaseDispute

Handles:

- identity disputes;
- family relationship disputes;
- family authority disputes;
- case ownership disputes;
- information disputes;
- authority disputes.
Attributes:

- dispute_id;
- case_id;
- raised_by;
- dispute_type;
- description;
- evidence_reference;
- status;
- severity;
- temporary_restriction;
- assigned_reviewer;
- raised_at;
- resolved_at;
- resolution;
- resolution_authority.
# 27. FamilyNeed

Need types:

- INFORMATION
- EMOTIONAL_SUPPORT
- PSYCHOSOCIAL_SUPPORT
- TRAVEL
- ACCOMMODATION
- TRANSPORT
- FINANCIAL
- LEGAL
- CONSULAR
- MEDICAL
- INTERPRETER
- DOCUMENTATION
- REPATRIATION
- OTHER.
# 28. AssistanceRequest

Attributes:

- assistance_request_id;
- case_id;
- need_id;
- requested_service;
- receiving_organisation;
- assigned_to;
- priority;
- status;
- created_at;
- target_resolution_at;
- completed_at.
# 29. AssistanceCentre

Attributes:

- centre_id;
- organisation_id;
- location;
- opening_hours;
- services;
- languages;
- accessibility;
- emergency_contact;
- operational_status.
# 30. ProxyContact

Supports remote family communication.

Examples:

- relative;
- community worker;
- humanitarian worker;
- NGO representative;
- embassy representative.
Attributes:

- proxy_contact_id;
- represented_family/person;
- proxy_person;
- relationship;
- authority_scope;
- verification_status;
- contact_methods;
- valid_from;
- valid_until;
- revoked_at.
# 31. CommunicationAttempt

Attributes:

- communication_id;
- case_id;
- recipient;
- channel;
- initiated_by;
- purpose;
- attempted_at;
- outcome;
- acknowledgement;
- notes;
- next_action.
Channels include:

- WEB;
- EMAIL;
- SMS;
- VOICE;
- WHATSAPP;
- IN_PERSON;
- COMMUNITY_WORKER;
- RADIO;
- EMBASSY;
- HUMANITARIAN_ORGANISATION.
# 32. Notification

Attributes:

- notification_id;
- recipient_id;
- case_id;
- notification_type;
- channel;
- priority;
- sent_at;
- delivered_at;
- acknowledged_at;
- status.
# 33. SafeguardingAlert

Highly restricted.

Possible categories:

- child protection;
- vulnerable adult;
- trafficking;
- exploitation;
- abuse;
- ransom;
- fraud;
- immediate danger.
# 34. SafeguardingHandover

Attributes:

- handover_id;
- safeguarding_alert_id;
- from_organisation;
- receiving_organisation;
- receiving_authority;
- intervention_type;
- date_time;
- reason;
- receiving_officer;
- acknowledgement;
- authority_reference;
- status;
- completed_at.
States:

- PROPOSED
- AUTHORISED
- TRANSFERRED
- ACKNOWLEDGED
- COMPLETED
- REJECTED.
# 35. DisasterRumour

Attributes:

- rumour_id;
- event_id;
- claim;
- first_reported_at;
- source;
- affected_area;
- affected_cases;
- severity;
- verification_status;
- verification_source;
- response_message;
- publication_status;
- created_by;
- verified_by;
- resolved_at.
States:

- REPORTED
- UNDER_REVIEW
- UNVERIFIED
- FALSE
- MISLEADING
- CONFIRMED
- SUPERSEDED
- RESOLVED.
# 36. CaseHandover

Attributes:

- handover_id;
- case_id;
- originating_organisation;
- receiving_organisation;
- receiving_system;
- external_case_reference;
- handover_reason;
- data_package_reference;
- data_categories_transferred;
- authorised_by;
- transferred_at;
- acknowledgement;
- status.
# 37. ExternalCaseReference

Attributes:

- external_reference_id;
- case_id;
- organisation_id;
- system_name;
- external_case_id;
- reference_type;
- created_at;
- active_status.
# 38. Identity Matching

Potential matching may use:

- name;
- approximate age;
- date of birth;
- nationality;
- photograph;
- physical descriptors;
- travel group;
- location;
- last contact;
- documents.
AI may identify:

POTENTIAL_MATCH

but only authorised humans/authorities can establish:

CONFIRMED_MATCH.

# 39. CarePreference

Phase 1.

Stores explicitly provided preferences relevant to:

- religious practice;
- cultural practice;
- funeral wishes;
- family representative;
- mortuary arrangements.
### Critical rule

No preference may be inferred from:

- nationality;
- ethnicity;
- language;
- name;
- location.
# 40. TourGroup

Attributes:

- group_id;
- operator_id;
- itinerary;
- departure;
- expected_return;
- coordinator;
- member_count;
- verification_status.
Group membership does not automatically grant access to individual information.

# 41. HospitalEncounter

Phase 1.

Attributes:

- encounter_id;
- person_id;
- hospital_id;
- admission_status;
- arrival_datetime;
- transfer_status;
- family_notification_status;
- authority_reference.
Detailed clinical information remains with the medical provider.

# 42. UnidentifiedPerson

Phase 1.

Attributes:

- unidentified_person_id;
- authority_reference;
- location_found;
- date_found;
- identification_status;
- forensic_authority;
- family_notification_status.
# 43. DeceasedPerson

Phase 1.

Attributes:

- deceased_case_id;
- authority_reference;
- death_confirmation_status;
- identification_status;
- forensic_status;
- mortuary;
- family_notification_status;
- release_status.
# 44. ForensicIdentification

Phase 1 and highly restricted.

Attributes:

- identification_id;
- deceased_case_id;
- method;
- authority;
- status;
- verified_at;
- authorised_by.
FamilyConnect should retain status/reference rather than unnecessary forensic detail.

# 45. ConsularCase

Phase 1.

Attributes:

- consular_case_id;
- case_id;
- embassy;
- nationality;
- consular_reference;
- assistance_status;
- documentation_status;
- family_contact_status.
# 46. RepatriationCase

Phase 1.

States:

NOT_STARTEDIDENTITY_CONFIRMEDDOCUMENTATIONCONSULAR_CLEARANCEFORENSIC_CLEARANCEMORTUARY_RELEASETRANSPORT_BOOKEDIN_TRANSITDESTINATION_RECEIVEDFAMILY_HANDOVERCOMPLETED

# 47. AuditEvent

Every sensitive operation should generate an audit event.

Attributes:

- audit_id;
- timestamp;
- actor;
- organisation;
- action;
- entity_type;
- entity_id;
- previous_state;
- new_state;
- access_reason;
- outcome.
Audit records must be tamper-resistant.

# 48. Privacy Classification

### PUBLIC

General disaster information.

### CONTROLLED

Normal case information.

### SENSITIVE

Personal/family/medical information.

### HIGHLY_RESTRICTED

Forensic, safeguarding and identity-document information.

# 49. Access Levels

- PUBLIC
- REGISTERED_USER
- AUTHORISED_FAMILY
- CASE_WORKER
- PARTNER_ORGANISATION
- AUTHORISED_AGENCY
- SPECIALIST
- ADMIN.
Access must be determined by role **and case/field permissions**.

# 50. Key Security Principle

The system must distinguish:

RELATIONSHIP      ≠VERIFICATION      ≠AUTHORISATION

Likewise:

SOURCE      ≠VERIFICATION      ≠AUTHORITY

These distinctions are foundational to trust.

# 51. Data Lifecycle

Every material data object should have:

- creation;
- owner;
- purpose;
- classification;
- retention rule;
- review;
- archive/deletion state.
Retention requirements require legal/governance review.

# 52. Critical Business Rules

### BR-001

Every submission receives acknowledgement where technically possible.

### BR-002

Acknowledgement does not mean verification.

### BR-003

Potential duplicate does not automatically change status.

### BR-004

Contested family authority can restrict disclosure.

### BR-005

Emergency access must be authorised and audited.

### BR-006

Raw biometric data is not collected by default.

### BR-007

Physical descriptors may be collected when operationally justified.

### BR-008

Cultural preferences are never inferred.

### BR-009

Proxy access is scoped.

### BR-010

Non-digital communications are auditable.

### BR-011

Safeguarding handovers require acknowledgement.

### BR-012

Unverified does not mean false.

### BR-013

Public search cannot enumerate the person database.

### BR-014

External handover preserves original history.

### BR-015

Data export is minimum-necessary.

### BR-016

No authority can be simulated by an AI system.

### BR-017

Death cannot be automatically determined.

### BR-018

Identity cannot be automatically confirmed by AI.

### BR-019

Case ownership must always be explicit.

### BR-020

Active cases require a next review date.

# 53. Edge Cases

The model must support:

- repeated safety declarations;
- multiple missing reports;
- competing family claims;
- disputed access;
- person found but refusing disclosure;
- unconscious person;
- unidentified person;
- unidentified deceased person;
- family cultural preferences;
- family travelling to Kathmandu;
- family moving between locations;
- remote family;
- community proxy;
- telecom failure;
- safeguarding intervention;
- event-wide rumours;
- harmful misinformation;
- long-term unresolved cases;
- external-system handover failure;
- duplicate cases;
- no digital connectivity.
# 54. MVP Data Boundary

## Implement

- Person
- FamilyUnit
- PersonRelationship
- Case
- MissingReport
- SafetyDeclaration
- SubmissionReceipt
- Location
- FamilyLocation
- LastKnownContact
- Organisation
- CaseWorker
- CaseAssignment
- InformationUpdate
- InformationSource
- Verification
- FamilyAuthorisation
- CaseDispute
- FamilyNeed
- AssistanceRequest
- AssistanceCentre
- ProxyContact
- CommunicationAttempt
- Notification
- CaseEscalation
- SafeguardingAlert
- SafeguardingHandover
- DisasterRumour
- CaseHandover
- ExternalCaseReference
- AuditEvent
- TourGroup
- basic IdentityEvidence.
# 55. Phase 1 Data Boundary

- HospitalEncounter
- UnidentifiedPerson
- DeceasedPerson
- ForensicIdentification
- ConsularCase
- RepatriationCase
- CarePreference
- advanced identity matching.
# 56. Architectural Implication

FamilyConnect should be designed as a **case-coordination and event-driven information system**, not merely a CRUD missing-person database.

Core layers:

PERSON   ↓CASE   ↓INFORMATION   ↓VERIFICATION   ↓COORDINATION   ↓FAMILY COMMUNICATION   ↓ASSISTANCE   ↓HANDOVER

Across all layers:

PRIVACYSECURITYAUDITSAFEGUARDINGPROVENANCE

# 57. Acceptance Criteria

### SPEC-002 is accepted only when the platform can represent:

- safe declaration;
- submission acknowledgement;
- missing report;
- multiple family claims;
- disputed authorisation;
- potential identity match;
- unconscious/unidentified person;
- culturally appropriate care preferences;
- family physical location;
- proxy communication;
- non-digital communication;
- safeguarding intervention handover;
- disaster-level rumour;
- long-term case handover;
- external case reference;
- complete audit trail.
# 58. Outstanding Governance Decisions

The following must be resolved before production:

- Legal basis for processing.
- Cross-border data transfer.
- Data residency.
- Data retention.
- Authority-of-record agreements.
- Family verification.
- Hospital data sharing.
- Forensic data sharing.
- Consular data sharing.
- Safeguarding responsibilities.
- Biometric governance if introduced.
- Data breach response.
- Cybersecurity controls.
- Physical assistance-centre responsibilities.
# 59. Status

**SPEC-002 v0.2 — Recommended for Approval**

The red-team review has been incorporated.

The domain model now explicitly supports:

- uncertainty;
- contested information;
- contested family authority;
- degraded communications;
- physical humanitarian operations;
- safeguarding;
- misinformation;
- long-term handover.
# 60. Next Specification

## SPEC-003 — API CONTRACT & EVENT SPECIFICATION

### SPEC-003 shall derive directly from SPEC-001 and SPEC-002 and define:

- public APIs;
- family APIs;
- case-worker APIs;
- agency APIs;
- authority APIs;
- authentication;
- authorisation;
- case-state transitions;
- event contracts;
- notifications;
- AI boundaries;
- idempotency;
- error handling;
- external integration;
- audit requirements.
Each API shall be classified as:

**PUBLIC / FAMILY / PARTNER / AUTHORITY / INTERNAL**

and every state transition shall identify the permitted actor:

**PERSON / FAMILY / CASE WORKER / PARTNER / AUTHORITY / SYSTEM / AI-ASSISTED HUMAN**

# 61. Implemented Production Entities & Extended Domain Model (v0.4)

The implemented database schema (`src/db/schema.sql`, `migration-orchestrator.sql`, `seed_assam.sql`) extends the baseline domain model with 37+ production tables supporting multi-event crisis operations:

### 61.1 Multi-Disaster Partitioning Model
- **`disaster_event`**: Core disaster entity defining operational boundaries:
  - `id` (VARCHAR PK, e.g. `EVENT-NP-TIBET-2026`, `EVENT-IN-FL-2026-1187`)
  - `name` (VARCHAR), `event_type` (GLOF, FLOOD, EARTHQUAKE), `country_code` (NPL, IND)
  - `status` (ACTIVE, CLOSED), `bounding_box` (JSONB GPS coordinates)
  - **Foreign Key Binding**: All operational entities (`case_record`, `safety_declaration`, `assistance_request`, `information_update`, `water_level_gauge`, `relief_distribution_schedule`, `damage_assessment`, `news_article`) carry a mandatory `disaster_event_id` foreign key.

### 61.2 Hydrological & Emergency Relief Entities
- **`water_level_gauge`**: Real-time river gauge telemetry:
  - `id` (UUID PK), `disaster_event_id` (FK), `station_name`, `river_name`, `district`
  - `current_level_m` (DECIMAL), `warning_level_m` (DECIMAL), `danger_level_m` (DECIMAL)
  - `highest_flood_level_m` (DECIMAL), `trend` (RISING, FALLING, STEADY), `status` (NORMAL, ABOVE_WARNING, ABOVE_DANGER)
  - `recorded_at` (TIMESTAMPTZ), `source_authority` (e.g. CWC, DHM)
- **`relief_distribution_schedule`**: Multi-agency humanitarian distribution:
  - `id` (UUID PK), `disaster_event_id` (FK), `centre_name`, `district`, `distribution_time`
  - `distributing_agency` (ASDMA, NDRF, RED_CROSS), `ration_scale` (JSONB)
  - `airdrop_coordinates` (JSONB), `status` (SCHEDULED, IN_PROGRESS, COMPLETED)
- **`damage_assessment`**: Community field damage reports:
  - `id` (UUID PK), `disaster_event_id` (FK), `reporter_name`, `reporter_role` (VILLAGE_HEAD, CITIZEN, REVENUE_OFFICER)
  - `damage_type` (RESIDENTIAL, AGRICULTURAL, EMBANKMENT, INFRASTRUCTURE)
  - `severity` (LOW, MEDIUM, HIGH, TOTAL_LOSS), `description`, `coordinates` (JSONB), `village_circle`

### 61.3 Infrastructure & Forensic Rescue Entities
- **`tunnel_site` & `tunnel_telemetry`**: Deep-shaft hydropower tunnel rescue monitoring:
  - `site_id` (PK, e.g. `UT3A-MAIN-SHAFT`, `RASUWAGADHI-INTAKE`), `disaster_event_id` (FK)
  - `name`, `operator`, `trapped_person_count`, `water_level_m`, `oxygen_percent`, `structural_integrity`
- **`dna_kit_request`**: Reference sample kit management:
  - `id` (UUID PK), `case_id` (FK), `tracking_ref` (CSPRNG hex format `DNA-XXXXXX`)
  - `requester_name`, `requester_relationship`, `dispatch_address`, `status` (DISPATCHED, SAMPLES_RETURNED, SEQUENCING)

### 61.4 Autonomous AI Intelligence & News Pipeline
- **`news_article`**: Ground truth disaster intelligence:
  - `id` (UUID PK), `disaster_event_id` (FK), `source_id` (FK), `title`, `url`, `content`
  - `verification_status` (`PENDING`, `VERIFIED`, `REJECTED`), `verified_by` (FK), `published_at`
- **`news_source` & `news_schedule`**: Feed management:
  - Source authority URLs, scrapers, and crawling cadence (`mode`: `6h` emergency burst vs. `24h` routine monitoring).

### 61.5 Autonomous Agentic Orchestrator Registry
- **`portal_module_registry`**: Dynamic modular components (`MOD-WATER-LVL`, `MOD-DAMAGE`, `MOD-RELIEF`, `MOD-TUNNEL`, `MOD-DNA`).
- **`orchestrator_event_plan`**: Planner recommendations based on GDACS disaster geometry.
- **`orchestrator_deployment`**: Staging preview, two-person authorization log, and live deployment state.

