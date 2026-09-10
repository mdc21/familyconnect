A review of **SPEC-003 v0.1** against the domain requirements in SPEC-002 v0.2 and real disaster operational constraints (such as the 2015 Nepal earthquake communication breakdowns) highlights five critical technical areas requiring hardening:

- **Standardized Header Contracts:** Mandatory headers (Idempotency-Key, X-Correlation-ID, X-Disaster-Event-ID, and If-Match/ETag for optimistic locking during concurrent case updates) were described conceptually but needed explicit endpoint binding.
- **Missing Entity Endpoints:** Endpoints for IdentityEvidence (physical descriptors/tattoos for unconscious patients) and CarePreference (cultural/funeral wishes) were missing from the contract surface.
- **Structured Non-Digital Communications:** CommunicationAttempt payloads needed explicit attributes for community radio, in-person Red Cross visits, and satellite/embassy relays to reflect offline reality.
- **RFC 9457 Problem Details Catalog:** Problem types needed formal URI bindings and error codes to handle disaster scenarios (e.g., disputed-authorization, active-rate-limit-protection, unauthorized-enumeration-shield).
- **Concrete Domain Event Envelopes:** Event contracts needed strict payload schemas for asynchronous consumers (e.g., notification queues, AI matching workers, and agency webhooks).
# SPEC-003 — API CONTRACT & EVENT SPECIFICATION

**FamilyConnect: Disaster Family Assistance, Reconnection & Coordination Platform**

- **Version:** 0.2
- **Status:** Revised Baseline — Recommended for Approval
- **Parent Specifications:** SPEC-001 v0.3 & SPEC-002 v0.2
- **Date:** 29 August 2026
- **API Style:** REST/JSON (HTTPS) + Asynchronous Domain Events
- **Base Path:** /api/v1
### 1. Architectural & Protocol Standards

- **Content-Type:** application/json (Requests and Responses).
- **Error Format:** application/problem+json (RFC 9457).
- **Character Encoding:** UTF-8.
- **Timestamp Format:** ISO 8601 UTC (YYYY-MM-DDTHH:mm:ssZ).
- **Concurrency Control:** ETag response headers and If-Match request headers on state transitions to prevent lost updates during simultaneous case coordination.
- **Standard Headers:**
- Idempotency-Key: UUIDv4 (Mandatory on all POST / PATCH state-altering calls).
- X-Correlation-ID: UUIDv4 (Required for end-to-end distributed tracing across API, workers, and audit logs).
- X-Disaster-Event-ID: Identifier linking the operation to an active DisasterEvent (e.g., EVENT-NP-TIBET-2026).
- Accept-Language: RFC 5646 language tag (Default: en).
### 2. Actor Resolution & Security Matrix

Clients must never declare their own permissions in the request payload. The API Gateway and Authorisation Filter resolve the actor context dynamically from cryptographically validated bearer tokens (JWT/OIDC).


| Actor Class | Credentials & Context | Permitted API Surfaces | Field-Level Data Access |
| --- | --- | --- | --- |
| PUBLIC | Anonymous / Rate-limited Session | Public Submissions, Disaster Feeds | General Public Only |
| PERSON | OTP / SMS / Magic Link Verified | Own Safety Declaration, Submission Status | Personal Profile Only |
| FAMILY | Case Reference + Verified Relationship OTP | Case Tracking, Needs, Disputes, Proxies | Authorized Case Records (Masked Docs) |
| PROXY | Delegated Family Access Token | Scoped Case Access, Assistance Requests | Delegated Scope Only |
| CASE_WORKER | Organizational MFA + Incident Role Token | Internal Case Management, Verification | Controlled & Sensitive Case Records |
| PARTNER | Scoped Partner mTLS / API Key | Logistics, Medical Liaison, Assistance Centres | Operationally Necessary Data Only |
| AUTHORITY | Statutory Authority mTLS + MFA Token | Forensics, Safeguarding Handover, Rumour Verification | Restricted / Highly Restricted Data |
| SYSTEM / AUDITOR | Internal Service Identity (mTLS) | Event Streaming, Notifications, Audit Ingestion | Append-Only Audit Records |

### 3. Core API Endpoints & Contracts

#### 3.1 Public Submissions

**POST /api/v1/submissions/safety**

- **Actors:** PUBLIC, PERSON
- **Classification:** Public Input
- **Description:** Enables an affected person to declare safety and contact preferences.
JSON

*// Request*{  *"person"*: {    *"firstName"*: *"Tenzing"*,    *"lastName"*: *"Norbu"*,    *"dateOfBirth"*: *"1988-05-12"*,    *"nationality"*: *"NPL"*,    *"phone"*: *"+977-9801234567"*  },  *"currentLocation"*: {    *"precision"*: *"CITY"*,    *"administrativeArea"*: *"Kathmandu"*,    *"description"*: *"Boudha Guest House"*  },  *"contactPreference"*: *"SMS"*,  *"tourGroupId"*: *"TG-EVEREST-2026-04"*}

JSON

*// Response: 202 Accepted*{  *"submissionId"*: *"SUB-SAFE-982341"*,  *"submissionReference"*: *"FC-SAFE-982341"*,  *"processingStatus"*: *"RECEIVED"*,  *"message"*: *"Your safety declaration has been received and queued for verification."*,  *"expectedReviewWindow"*: *"Within 2 hours"*,  *"receivedAt"*: *"2026-08-29T10:15:30Z"*}

**GET /api/v1/submissions/{submissionId}**

- **Actors:** PERSON, FAMILY, CASE_WORKER
- **Classification:** Controlled
- **Description:** Retrieves the acknowledgement state of a submission to prevent duplicate re-submissions during telecom delays.
JSON

*// Response: 200 OK*{  *"submissionId"*: *"SUB-SAFE-982341"*,  *"submissionType"*: *"SAFETY_DECLARATION"*,  *"processingStatus"*: *"LINKED_TO_CASE"*,  *"linkedCaseReference"*: *"FC-NP-2026-00142"*,  *"nextAction"*: *"Awaiting Case Worker verification before notifying family."*,  *"updatedAt"*: *"2026-08-29T10:18:00Z"*}

**POST /api/v1/submissions/missing**

- **Actors:** PUBLIC, FAMILY
- **Classification:** Public Input
- **Description:** Registers a missing person report. Generates a trackable Case Reference.
JSON

*// Request*{  *"person"*: {    *"firstName"*: *"Sunita"*,    *"lastName"*: *"Sharma"*,    *"approximateAge"*: *34*,    *"gender"*: *"FEMALE"*,    *"nationality"*: *"IND"*,    *"photographBase64"*: *null*  },  *"lastKnownContact"*: {    *"datetime"*: *"2026-08-28T06:30:00Z"*,    *"locationDescription"*: *"Langtang Trekking Trail near Syabrubesi"*,    *"communicationChannel"*: *"PHONE"*  },  *"reporter"*: {    *"firstName"*: *"Anil"*,    *"lastName"*: *"Sharma"*,    *"relationship"*: *"SPOUSE"*,    *"phone"*: *"+91-9876543210"*,    *"email"*: *"anil.sharma@example.com"*  }}

JSON

*// Response: 202 Accepted*{  *"submissionId"*: *"SUB-MIS-554123"*,  *"caseReference"*: *"FC-NP-2026-00892"*,  *"status"*: *"RECEIVED"*,  *"message"*: *"Missing report submitted. Case triaging initiated."*,  *"submittedAt"*: *"2026-08-29T10:20:00Z"*}

#### 3.2 Case Tracking & Dispute Management

**GET /api/v1/cases/{caseId}**

- **Actors:** FAMILY, PROXY, CASE_WORKER, AUTHORITY
- **Classification:** Controlled / Filtered
- **Description:** Returns the case status timeline, verified updates, and scheduled review time.
JSON

*// Response: 200 OK (Family View - Sensitive Data Masked)*{  *"caseReference"*: *"FC-NP-2026-00892"*,  *"status"*: *"ACTIVE"*,  *"subStatus"*: *"SEARCH_ACTIVE"*,  *"priority"*: *"P2"*,  *"person"*: {    *"firstName"*: *"Sunita"*,    *"lastName"*: *"Sharma"*,    *"nationality"*: *"IND"*  },  *"caseOwner"*: {    *"organisationName"*: *"Nepal Red Cross Society"*,    *"role"*: *"PRIMARY_OWNER"*  },  *"lastVerifiedUpdate"*: {    *"timestamp"*: *"2026-08-29T09:00:00Z"*,    *"status"*: *"NO_MATERIAL_CHANGE"*,    *"content"*: *"Active search continuing in Langtang Valley sector B."*  },  *"nextReviewAt"*: *"2026-08-29T15:00:00Z"*,  *"dataSharingStatus"*: *"NORMAL"*}

**POST /api/v1/cases/{caseId}/disputes**

- **Actors:** FAMILY, CASE_WORKER
- **Classification:** Sensitive
- **Description:** Flags a dispute (e.g., competing family claims, estranged relatives, contested custody). Automatically applies data-sharing restrictions pending human review.
JSON

*// Request*{  *"disputeType"*: *"FAMILY_AUTHORITY_DISPUTE"*,  *"description"*: *"Estranged relative attempting to access case details and change repatriation destination."*,  *"evidenceReferences"*: [*"DOC-LEGAL-4412"*]}

JSON

*// Response: 202 Accepted*{  *"disputeId"*: *"DSP-8831"*,  *"caseId"*: *"FC-NP-2026-00892"*,  *"status"*: *"OPEN"*,  *"dataSharingStatus"*: *"RESTRICTED_PENDING_REVIEW"*,  *"assignedReviewer"*: *"LEGAL_PROTECTION_TEAM"*,  *"raisedAt"*: *"2026-08-29T10:30:00Z"*}

#### 3.3 Identity Matching & Care Preferences

**POST /api/v1/cases/{caseId}/evidence**

- **Actors:** CASE_WORKER, PARTNER, AUTHORITY
- **Classification:** Restricted
- **Description:** Attaches physical descriptors, clothing items, and dental/medical references to support unidentified patient matching.
JSON

*// Request*{  *"evidenceType"*: *"PHYSICAL_DESCRIPTOR"*,  *"descriptors"*: {    *"approximateHeightCm"*: *172*,    *"build"*: *"SLENDER"*,    *"hairColor"*: *"BLACK"*,    *"tattoos"*: [*"Trishul symbol on right forearm"*],    *"clothing"*: [*"Red North Face jacket"*, *"Blue trekking trousers"*],    *"personalEffects"*: [*"Silver ring on left thumb"*]  },  *"sourceOrganisationId"*: *"ORG-HOSP-PATAN"*}

JSON

*// Response: 201 Created*{  *"evidenceId"*: *"EVI-9912"*,  *"caseId"*: *"FC-NP-2026-00892"*,  *"verificationStatus"*: *"PARTIALLY_VERIFIED"*,  *"createdAt"*: *"2026-08-29T10:35:00Z"*}

**POST /api/v1/cases/{caseId}/care-preferences**

- **Actors:** FAMILY, CASE_WORKER
- **Classification:** Sensitive
- **Description:** Explicitly captures religious, cultural, and mortuary handling instructions (cannot be inferred from nationality/ethnicity).
JSON

*// Request*{  *"religiousTradition"*: *"HINDU"*,  *"culturalWishes"*: *"Traditional cremation rites requested in Pashupatinath if confirmed deceased."*,  *"mortuaryHandlingRestrictions"*: *"Do not embalm prior to family viewing."*,  *"authorisedRepresentative"*: *"Anil Sharma (Spouse)"*}

JSON

*// Response: 201 Created*{  *"preferenceId"*: *"CP-4401"*,  *"caseId"*: *"FC-NP-2026-00892"*,  *"recordedAt"*: *"2026-08-29T10:40:00Z"*}

#### 3.4 Assistance, Logistics & Remote Proxies

**POST /api/v1/cases/{caseId}/assistance**

- **Actors:** FAMILY, PROXY
- **Classification:** Controlled
- **Description:** Submits a request for emotional, logistical, medical, legal, or consular assistance.
JSON

*// Request*{  *"needType"*: *"ACCOMMODATION"*,  *"priority"*: *"HIGH"*,  *"description"*: *"Two family members arriving in Kathmandu at Tribhuvan Airport on 30 Aug. Require secure accommodation near Assistance Centre."*,  *"travelDetails"*: {    *"arrivalDateTime"*: *"2026-08-30T14:30:00Z"*,    *"flightNumber"*: *"AI-213"*,    *"partySize"*: *2*  }}

JSON

*// Response: 201 Created*{  *"assistanceRequestId"*: *"AR-7712"*,  *"caseId"*: *"FC-NP-2026-00892"*,  *"status"*: *"TRIAGED"*,  *"targetResolutionWindow"*: *"Within 6 hours"*,  *"createdAt"*: *"2026-08-29T10:45:00Z"*}

**POST /api/v1/families/{familyId}/locations**

- **Actors:** FAMILY, PROXY, CASE_WORKER
- **Classification:** Sensitive
- **Description:** Logs the real-time physical footprint of traveling families to coordinate transport and human assistance.
JSON

*// Request*{  *"locationType"*: *"HOTEL"*,  *"administrativeArea"*: *"Kathmandu"*,  *"facilityName"*: *"Hotel Yak & Yeti, Durbar Marg"*,  *"precision"*: *"FACILITY"*,  *"startDatetime"*: *"2026-08-30T16:00:00Z"*}

JSON

*// Response: 201 Created*{  *"familyLocationId"*: *"FLOC-3312"*,  *"familyUnitId"*: *"FAM-9912"*,  *"status"*: *"ACTIVE"*,  *"recordedAt"*: *"2026-08-29T10:50:00Z"*}

**POST /api/v1/cases/{caseId}/proxies**

- **Actors:** FAMILY, CASE_WORKER
- **Classification:** Sensitive
- **Description:** Appoints a proxy (relative, Red Cross volunteer, embassy official) for remote families unable to travel or access the digital platform.
JSON

*// Request*{  *"proxyPerson"*: {    *"firstName"*: *"Ram"*,    *"lastName"*: *"Shrestha"*,    *"phone"*: *"+977-9841112233"*,    *"organization"*: *"Nepal Red Cross Society Volunteer"*  },  *"authorityScope"*: *"FULL_FAMILY_COORDINATION"*,  *"validFrom"*: *"2026-08-29T00:00:00Z"*,  *"validUntil"*: *"2026-09-29T00:00:00Z"*}

JSON

*// Response: 201 Created*{  *"proxyId"*: *"PRX-5519"*,  *"caseId"*: *"FC-NP-2026-00892"*,  *"verificationStatus"*: *"VERIFIED"*,  *"expiresAt"*: *"2026-09-29T00:00:00Z"*}

**POST /api/v1/cases/{caseId}/communications**

- **Actors:** CASE_WORKER, PARTNER, AUTHORITY
- **Classification:** Controlled
- **Description:** Records non-digital outreach (radio broadcasts, physical field visits, satellite calls) when telecom infrastructure fails.
JSON

*// Request*{  *"channel"*: *"COMMUNITY_WORKER"*,  *"recipientName"*: *"Anil Sharma (Spouse)"*,  *"purpose"*: *"Deliver case status update and collect identity documentation."*,  *"attemptedAt"*: *"2026-08-29T11:00:00Z"*,  *"outcome"*: *"SUCCESSFUL_IN_PERSON"*,  *"notes"*: *"NRCS Field Volunteer visited temporary camp in Dhunche; physical verification completed."*,  *"nextAction"*: *"Schedule follow-up contact via VHF radio net tomorrow 09:00 NPT."*}

JSON

*// Response: 201 Created*{  *"communicationId"*: *"COM-1102"*,  *"caseId"*: *"FC-NP-2026-00892"*,  *"loggedAt"*: *"2026-08-29T11:05:00Z"*}

#### 3.5 Safeguarding, Misinformation & Handovers

**POST /api/v1/safeguarding/{alertId}/handover**

- **Actors:** AUTHORITY, CASE_WORKER (Safeguarding Lead only)
- **Classification:** Highly Restricted
- **Description:** Transmits formal custody or protection responsibility for an unaccompanied minor or vulnerable adult to statutory child-welfare/police services.
JSON

*// Request*{  *"receivingOrganisationId"*: *"ORG-NEPAL-POLICE-WCSB"*,  *"receivingAuthority"*: *"Nepal Police Women & Children Service Directorate"*,  *"receivingOfficer"*: *"Insp. Sita Thapa (Badge #NP-8834)"*,  *"interventionType"*: *"UNACCOMPANIED_MINOR_PROTECTION"*,  *"authorityReference"*: *"POL-WCSD-2026-091"*,  *"reason"*: *"Minor located without guardian in temporary shelter; transferred to authorized child protection transit home."*,  *"transferDateTime"*: *"2026-08-29T11:15:00Z"*,  *"handoverAcknowledgement"*: *true*}

JSON

*// Response: 200 OK*{  *"handoverId"*: *"SGH-9901"*,  *"alertId"*: *"SGA-4412"*,  *"status"*: *"COMPLETED"*,  *"completedAt"*: *"2026-08-29T11:20:00Z"*}

**POST /api/v1/events/{eventId}/rumours/{rumourId}/correction**

- **Actors:** AUTHORITY, CASE_WORKER (Incident Lead only)
- **Classification:** Controlled
- **Description:** Formally debunks social media misinformation or unverified claims, issuing targeted notifications to affected groups.
JSON

*// Request*{  *"verificationStatus"*: *"FALSE"*,  *"verificationSource"*: *"Nepal Army Disaster Rescue Headquarters"*,  *"responseMessage"*: *"Reports circulating on social media regarding a dam burst in Trishuli Valley are FALSE. Hydroelectric structures remain structurally sound."*,  *"affectedArea"*: *"Trishuli / Nuwakot / Rasuwa"*,  *"targetAudience"*: *"EVENT_WIDE_PUBLIC"*}

JSON

*// Response: 200 OK*{  *"correctionId"*: *"COR-2201"*,  *"rumourId"*: *"RUM-0081"*,  *"publicationStatus"*: *"BROADCASTED"*,  *"broadcastTimestamp"*: *"2026-08-29T11:30:00Z"*}

**POST /api/v1/cases/{caseId}/handovers**

- **Actors:** AUTHORITY, ADMIN
- **Classification:** Highly Controlled
- **Description:** Formalizes long-term handover of unresolved cases (30+ days) to statutory police databases or ICRC Tracing Services.
JSON

*// Request*{  *"receivingOrganisationId"*: *"ORG-ICRC-RFL"*,  *"receivingSystem"*: *"ICRC_GLOBAL_TRACING_SYSTEM"*,  *"handoverReason"*: *"LONG_TERM_UNRESOLVED_DISASTER_PHASE_CLOSE"*,  *"externalCaseReference"*: *"ICRC-NP-2026-9931"*,  *"dataCategoriesTransferred"*: [    *"PERSON_IDENTITY"*,    *"PHYSICAL_EVIDENCE"*,    *"MISSING_REPORTS"*,    *"LAST_KNOWN_CONTACTS"*,    *"FAMILY_REPRESENTATIVES"*  ],  *"authorisedBy"*: *"National Emergency Operations Centre (NEOC) Director"*}

JSON

*// Response: 200 OK*{  *"handoverId"*: *"HO-6612"*,  *"caseId"*: *"FC-NP-2026-00892"*,  *"caseStatus"*: *"TRANSFERRED"*,  *"externalCaseReference"*: *"ICRC-NP-2026-9931"*,  *"originalHistoryPreserved"*: *true*,  *"transferredAt"*: *"2026-08-29T11:45:00Z"*}

### 4. Controlled State Transition Actions

Status transitions cannot be performed through arbitrary field mutations. They must be executed via distinct, validated action verbs:

- **POST /api/v1/cases/{id}/actions/triage**: Moves NEW → ACTIVE (MISSING / SAFETY_DECLARATION).
- **POST /api/v1/cases/{id}/actions/link-safety-declaration**: Associates a verified SafetyDeclaration.
- **POST /api/v1/cases/{id}/actions/confirm-safety**: Transitions to SAFE_CONFIRMED upon official verification.
- **POST /api/v1/cases/{id}/actions/mark-hospitalised**: Links HospitalEncounter, sets state to HOSPITALISED.
- **POST /api/v1/cases/{id}/actions/mark-deceased**: Requires statutory forensic death certificate reference.
- **POST /api/v1/cases/{id}/actions/close**: Closes case with mandatory legal/humanitarian closureReason.
### 5. Domain Event Catalog & Schemas

All events are formatted in compliance with the **CloudEvents v1.0** specification:

JSON

*// Common Event Envelope*{  *"specversion"*: *"1.0"*,  *"id"*: *"EVT-889123-A"*,  *"source"*: *"/services/case-coordination"*,  *"type"*: *"org.familyconnect.case.PotentialMatchDetected"*,  *"datacontenttype"*: *"application/json"*,  *"time"*: *"2026-08-29T11:50:00Z"*,  *"subject"*: *"CASE-FC-NP-2026-00892"*,  *"correlationid"*: *"COR-771239"*,  *"data"*: {}}

#### 5.1 Event Payloads

- **org.familyconnect.submission.SafetyDeclarationSubmitted**JSON{  *"submissionId"*: *"SUB-SAFE-982341"*,  *"personId"*: *"PER-5512"*,  *"declaredLocation"*: *"Kathmandu"*,  *"hasPotentialMissingMatch"*: *true*}
- **org.familyconnect.match.PotentialMatchDetected** *(AI-Assisted — Non-Authoritative)*JSON{  *"primaryCaseId"*: *"FC-NP-2026-00892"*,  *"candidateCaseId"*: *"FC-SAFE-982341"*,  *"confidenceScore"*: *0.94*,  *"matchedAttributes"*: [*"FIRST_NAME"*, *"LAST_NAME"*, *"DATE_OF_BIRTH"*, *"TOUR_GROUP"*],  *"requiresHumanReview"*: *true*,  *"decisionAuthority"*: *"CASE_WORKER"*}
- **org.familyconnect.case.AuthorisationDisputed**JSON{  *"caseId"*: *"FC-NP-2026-00892"*,  *"disputeId"*: *"DSP-8831"*,  *"disputeType"*: *"FAMILY_AUTHORITY_DISPUTE"*,  *"dataSharingRestricted"*: *true*}
- **org.familyconnect.event.RumourCorrected**JSON{  *"eventId"*: *"EVENT-NP-TIBET-2026"*,  *"rumourId"*: *"RUM-0081"*,  *"verificationStatus"*: *"FALSE"*,  *"broadcastMessage"*: *"Reports of Trishuli dam burst are FALSE."*,  *"affectedSectors"*: [*"Trishuli"*, *"Rasuwa"*]}
- **org.familyconnect.case.CaseExternallyTransferred**JSON{  *"caseId"*: *"FC-NP-2026-00892"*,  *"receivingOrganisationId"*: *"ORG-ICRC-RFL"*,  *"externalCaseReference"*: *"ICRC-NP-2026-9931"*,  *"handoverId"*: *"HO-6612"*}
### 6. Error Catalog (RFC 9457 Problem Details)

All error responses strictly return application/problem+json:

JSON

*// Example: Concurrency / Dispute Lock*{  *"type"*: *"https://api.familyconnect.org/v1/problems/case-data-restricted"*,  *"title"*: *"Case Access Restricted Due to Active Dispute"*,  *"status"*: *403*,  *"detail"*: *"Case data disclosure is temporarily frozen pending resolution of Dispute DSP-8831."*,  *"instance"*: *"/cases/FC-NP-2026-00892"*,  *"code"*: *"FC_ERR_403_DISPUTED_ACCESS"*,  *"timestamp"*: *"2026-08-29T11:55:00Z"*}


| HTTP Status | Problem Type URI | Code | Description / Safe Behavior |
| --- | --- | --- | --- |
| 400 | /problems/invalid-payload | FC_ERR_400_INVALID_SCHEMA | Payload failed structural/format validation. |
| 401 | /problems/unauthenticated | FC_ERR_401_AUTH_REQUIRED | Missing or expired authorization token. |
| 403 | /problems/case-data-restricted | FC_ERR_403_DISPUTED_ACCESS | Access frozen by active CaseDispute. |
| 404 | /problems/resource-not-found | FC_ERR_404_NOT_FOUND | Returned on unpermitted cases to shield against enumeration. |
| 409 | /problems/idempotency-conflict | FC_ERR_409_IDEMPOTENCY | Concurrent request received with same key but differing payload. |
| 412 | /problems/precondition-failed | FC_ERR_412_CONCURRENCY_LOCK | ETag mismatch (If-Match); case modified concurrently. |
| 422 | /problems/illegal-transition | FC_ERR_422_STATE_TRANSITION | Transition rejected by state engine (e.g. AI closing case). |
| 429 | /problems/rate-limited | FC_ERR_429_RATE_LIMIT | Quota exceeded; adapt based on Retry-After header. |
| 503 | /problems/service-unavailable | FC_ERR_503_DEGRADED_MODE | Upstream agency down; request queued asynchronously. |

### 7. Traceability Matrix

### SPEC-001 (Requirements) ──► SPEC-002 (Domain Model) ──► SPEC-003 (API Contracts)┌───────────────────────┐   ┌────────────────────────┐   ┌──────────────────────────────────────────────┐│ FR-002 (Safe Decl.)   │──►│ SafetyDeclaration      │──►│ POST /api/v1/submissions/safety              ││ FR-004 (Report Miss.) │──►│ MissingReport          │──►│ POST /api/v1/submissions/missing             ││ FR-011 (Dispute Mgt.) │──►│ CaseDispute            │──►│ POST /api/v1/cases/{id}/disputes             ││ FR-012 (Assistance)   │──►│ AssistanceRequest      │──►│ POST /api/v1/cases/{id}/assistance           ││ FR-013 (Family Loc.)  │──►│ FamilyLocation         │──►│ POST /api/v1/families/{id}/locations         ││ FR-014 (Proxy Mgt.)   │──►│ ProxyContact           │──►│ POST /api/v1/cases/{id}/proxies              ││ FR-015 (Comm Tracking)│──►│ CommunicationAttempt   │──►│ POST /api/v1/cases/{id}/communications       ││ FR-016 (Safeguarding) │──►│ SafeguardingHandover   │──►│ POST /api/v1/safeguarding/{id}/handover      ││ FR-018 (Rumours)      │──►│ DisasterRumour         │──►│ POST /api/v1/events/{id}/rumours/{r}/correct ││ FR-021 (Handover)     │──►│ CaseHandover           │──►│ POST /api/v1/cases/{id}/handovers            │└───────────────────────┘   └────────────────────────┘   └──────────────────────────────────────────────┘

With **SPEC-003 v0.2** established as the approved baseline, the engineering surface is defined and traceable to humanitarian acceptance criteria. The next logical document in the spec-driven pipeline is **SPEC-004: Security, Privacy, Governance & Safeguarding Specification**.
