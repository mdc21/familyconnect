# SPEC-001 — PRODUCT REQUIREMENTS SPECIFICATION

## FamilyConnect

### Disaster Family Assistance, Reconnection & Coordination Platform

**Version:** 0.4**Status:** Implemented Baseline — Synchronized with Active Codebase**Parent:** Original FamilyConnect concept + disaster-scenario red-team review**Date:** 10 September 2026**Methodology:** Spec-Driven Development

# 1. Executive Summary

FamilyConnect is a humanitarian coordination platform designed to help people and families affected by a major disaster to:

- declare themselves safe;
- report someone missing;
- establish and track a case;
- receive verified ground-truth intelligence;
- communicate with authorised family members;
- coordinate practical assistance (boat evacuation, food rations, clean water, medical aid);
- connect with relevant authorities and humanitarian organisations;
- monitor specialized disaster telemetry (river levels, tunnel rescue shafts);
- report community damage assessments;
- request forensic reference DNA buccal swab kits;
- support families who travel to the affected area or remain remote;
- coordinate longer-term assistance, including consular and repatriation support.

### Multi-Disaster Operational Scope (Implemented in v0.4):
The platform actively supports concurrent, strictly isolated multi-disaster event operations:

1. **Nepal–Tibet Border Glacial Outburst Flood (`EVENT-NP-TIBET-2026`)**: High-altitude flash flood, landslips, deep-shaft hydropower tunnel rescue monitoring (Upper Trishuli 3A and Rasuwagadhi), forensic DNA reference kits, and consular repatriation desks.
2. **Assam Brahmaputra Basin Flooding (`EVENT-IN-FL-2026-1187`)**: Widespread monsoon inundation across 15 districts, real-time Central Water Commission (CWC) river gauge telemetry, multi-agency relief distribution schedules, and community flood damage assessment for Circle Officers.

### Multilingual Support:
The platform operates natively with client-side localization across 6 languages:
- English (`en`)
- Nepali (`ne`)
- Hindi (`hi`)
- Bengali (`bn`)
- Assamese (`as`)
- Tibetan / Mandarin (`zh`)

# 2. Problem Statement

During a major disaster, families face a fragmented information and assistance environment.

A relative may be:

- missing;
- safe but unable to contact family;
- hospitalised;
- evacuated;
- unidentified;
- deceased but not yet formally identified;
- travelling between locations;
- part of a tour group whose status is unclear.
At the same time, families may be:

- in Kathmandu;
- elsewhere in Nepal;
- in India;
- in another country;
- unable to travel;
- unable to access reliable communications.
Information may be distributed across:

- police;
- hospitals;
- government agencies;
- rescue organisations;
- humanitarian organisations;
- tour operators;
- embassies;
- social media;
- community networks;
- family members.
FamilyConnect aims to provide a **trusted coordination layer**, not replace statutory authorities.

# 3. Product Vision

**One trusted place for people and families to reconnect, understand what is known, obtain verified updates and coordinate practical help during and after a disaster.**

The platform should reduce:

- uncertainty;
- duplicated enquiries;
- misinformation;
- family distress caused by lack of information;
- fragmented coordination;
- unnecessary travel;
- repeated reporting to multiple agencies.
# 4. Product Principles

## PRP-01 — Humanitarian First

The platform exists to assist affected people and families.

## PRP-02 — Do No Harm

The platform must not expose people to additional:

- physical;
- emotional;
- privacy;
- security;
- safeguarding risks.
## PRP-03 — Trusted Information

Information must identify its source and verification state.

## PRP-04 — No False Certainty

Unverified information must never be presented as confirmed.

## PRP-05 — Authority Remains With Authorities

FamilyConnect coordinates information and assistance but does not replace:

- police;
- medical authorities;
- forensic authorities;
- government;
- consular authorities;
- child-protection authorities.
## PRP-06 — Human Oversight

Critical decisions require appropriate human/authority review.

## PRP-07 — Digital and Physical

The platform must support both digital and non-digital humanitarian operations.

## PRP-08 — Family-Centred

Families need information, but also:

- emotional support;
- logistical assistance;
- travel guidance;
- accommodation;
- interpretation;
- consular support;
- repatriation assistance where required.
## PRP-09 — Privacy by Design

Only minimum necessary personal information should be collected and disclosed.

## PRP-10 — Inclusive

The platform must support local residents as well as international visitors.

# 5. Users

## 5.1 Affected Person

A person who:

- is safe;
- needs assistance;
- wants to declare themselves safe;
- needs to reconnect with family.
## 5.2 Family Member

A relative seeking:

- information;
- case registration;
- updates;
- assistance;
- coordination.
## 5.3 Authorised Family Representative

Someone authorised to communicate on behalf of a family.

Examples:

- relative;
- friend;
- community representative;
- humanitarian worker.
## 5.4 Local Community

People who may:

- report someone missing;
- report sightings;
- provide information;
- request assistance.
## 5.5 Tour Operator

May manage:

- group information;
- traveller status;
- last-known information;
- communication with families.
A tour operator does **not automatically become the authority for a person’s status**.

## 5.6 Humanitarian Organisation

Examples:

- humanitarian agencies;
- NGOs;
- community organisations;
- family assistance centres.
## 5.7 Medical Organisation

Hospitals and medical partners may provide authorised status information.

## 5.8 Government / Police / Rescue Authority

Provides authoritative information within its legal/operational remit.

## 5.9 Embassy / Consular Organisation

Supports international nationals and their families where appropriate.

## 5.10 Case Worker

A trained human coordinator responsible for case management.

## 5.11 System Administrator

Maintains the platform but should not automatically have access to all sensitive case data.

# 6. Primary User Journeys

## Journey 1 — I Am Safe

Person:

- Opens FamilyConnect.
- Selects **I AM SAFE**.
- Provides minimum identity/contact information.
- Provides optional current location.
- Submits.
- Receives a submission reference immediately.
- System attempts to identify a potential existing missing case.
- Human verification occurs where required.
- Status becomes SAFE_CONFIRMED.
- Authorised family members are notified.
The acknowledgement must not imply confirmation.

# 7. Journey 2 — Report Someone Missing

Family/member:

- Selects **REPORT SOMEONE MISSING**.
- Provides minimum available information.
- Provides last-known contact/location.
- Provides relationship.
- Provides photograph if available.
- Provides contact information.
- Receives case reference.
- Case enters triage.
- Case is assigned to an appropriate coordinator.
- Verified updates are communicated.
# 8. Journey 3 — Track a Case

Family member:

- Provides case reference/authentication.
- System verifies access.
- Family sees information they are authorised to receive.
- Updates are labelled:
- confirmed;
- verified;
- pending;
- unverified.
- Family can request assistance.
# 9. Journey 4 — Family Arrives in Kathmandu

Family can:

- locate Family Assistance Centres;
- obtain directions;
- identify relevant agencies;
- request accommodation;
- request transport;
- obtain interpreter support;
- connect with hospitals/authorities where appropriate;
- register/update their case;
- request psychosocial support;
- obtain consular assistance.
FamilyConnect should not direct families into unsafe areas.

# 10. Journey 5 — Family Cannot Travel

Family can:

- register a case remotely;
- appoint a proxy;
- receive updates;
- communicate by available channels;
- request humanitarian assistance;
- communicate through authorised community/humanitarian representatives;
- receive information about what actions are possible remotely.
# 11. Journey 6 — Hospitalised / Unidentified Person

Where participating agencies provide information:

- potential identity may be established;
- physical descriptors may support matching;
- authorised information can be linked to a case;
- family notification can occur after appropriate verification.
Medical details remain with medical authorities unless specifically required and authorised.

# 12. Journey 7 — Deceased / Identification / Repatriation

Where death has been formally established:

- authority confirms death;
- identification process occurs;
- authorised family notification occurs;
- consular process may begin;
- documentation is coordinated;
- mortuary release is coordinated;
- repatriation can be initiated;
- destination/family handover is coordinated.
FamilyConnect does not independently certify death or identity.

# 13. Journey 8 — Safeguarding

Where a child or vulnerable person is identified:

- safeguarding alert is raised;
- priority is assigned;
- appropriate authority is notified;
- intervention is tracked;
- custody/intervention handover is recorded;
- FamilyConnect maintains the coordination record.
# 14. Journey 9 — Misinformation

When a significant rumour emerges:

- report is captured;
- source is recorded;
- claim is assessed;
- verification occurs;
- status is established;
- appropriate correction is issued;
- affected families/groups may receive the correction.
UNVERIFIED must not automatically mean FALSE.

# 15. Journey 10 — Long-Term Unresolved Case

Where a case remains unresolved:

- review continues;
- family receives meaningful “no material change” updates;
- case remains active;
- longer-term authority may be identified;
- formal handover can occur;
- external case reference is retained;
- original history remains auditable.
# 16. Functional Requirements

## FR-001 — Disaster Registration

The system shall support disaster/event creation.

## FR-002 — Safety Declaration

The system shall allow affected people to declare themselves safe.

## FR-003 — Submission Acknowledgement

Every valid submission shall generate a reference/acknowledgement.

## FR-004 — Missing Person Reporting

The system shall allow authorised users to create missing-person cases.

## FR-005 — Case Tracking

Families shall be able to track authorised cases.

## FR-006 — Case Ownership

Every active case shall have an accountable owner.

## FR-007 — Case Assignment

Cases shall be assignable to authorised case workers/organisations.

## FR-008 — Verification

Material information shall support verification.

## FR-009 — Provenance

Material information shall record its source.

## FR-010 — Family Authorisation

Sensitive information shall require appropriate authorisation.

## FR-011 — Dispute Management

The system shall support disputed family relationships and access.

## FR-012 — Assistance

Families shall be able to request practical assistance.

## FR-013 — Family Location

The system shall support the location of families/representatives.

## FR-014 — Proxy Support

Families shall be able to nominate authorised proxies.

## FR-015 — Multi-Channel Communication

The system shall support digital and non-digital communication records.

## FR-016 — Safeguarding

The system shall support safeguarding alerts and intervention handover.

## FR-017 — Disaster-Level Information

The system shall support event-wide operational updates.

## FR-018 — Rumour Management

The system shall support disaster-level misinformation management.

## FR-019 — Hospital/Unidentified Person Support

The architecture shall support hospital and unidentified-person workflows.

## FR-020 — Repatriation

The architecture shall support future repatriation workflows.

## FR-021 — External Handover

Cases shall support transfer to external authorities/systems.

## FR-022 — Audit

Sensitive operations shall be auditable.

# 17. Information Trust Model

Every material update must show:

- source;
- timestamp;
- verification status;
- authority;
- audience.
Possible states:

- submitted;
- pending;
- partially verified;
- verified;
- confirmed;
- rejected;
- superseded.
# 18. Family Communication Requirements

The system shall distinguish:

### Case-level

Information about an individual.

### Group-level

Information affecting:

- tour group;
- defined community;
- family group.
### Event-level

Information affecting the wider disaster.

# 19. Privacy Requirements

The platform shall:

- minimise personal-data collection;
- separate public from restricted information;
- implement field-level access control;
- protect identity documents;
- restrict medical information;
- restrict forensic information;
- restrict safeguarding information;
- prevent public enumeration of cases;
- log sensitive access;
- support consent/preferences where appropriate;
- support legal retention requirements.
# 20. Public Search

Public search shall expose only information explicitly authorised for public disclosure.

It must not expose:

- passport numbers;
- private telephone numbers;
- exact addresses;
- medical information;
- safeguarding information;
- forensic information.
# 21. AI Requirements

AI may assist with:

- duplicate detection;
- potential identity matching;
- summarisation;
- translation;
- classification;
- routing;
- information retrieval.
AI must not independently:

- confirm death;
- confirm identity;
- authorise family access;
- override authorities;
- determine safeguarding outcomes;
- publish unverified information as fact.
# 22. Offline / Degraded Operations

The product shall be designed for:

- poor connectivity;
- intermittent connectivity;
- telecom disruption;
- power disruption;
- limited digital literacy;
- paper-based agency operations.
The system shall therefore support human-mediated workflows.

# 23. Multilingual Roadmap

### MVP

English.

### Phase 2

Multilingual:

- Nepali;
- Tibetan;
- Hindi;
- other languages based on affected populations.
Language support should cover:

- UI;
- notifications;
- case-worker interaction;
- family communication;
- public information;
- voice interaction where feasible.
# 24. Safety Requirements

The platform shall avoid:

- revealing exact locations of vulnerable people;
- directing families into unsafe zones;
- exposing unverified survivor information;
- exposing children publicly;
- exposing sensitive medical information;
- creating false expectations of rescue;
- encouraging unauthorised searches;
- creating false confirmation of death.
# 25. Operational Roles

The operating model should distinguish:

### Platform Operator

Maintains FamilyConnect.

### Case Coordinator

Manages individual cases.

### Information Provider

Provides information.

### Authority of Record

Provides official determination where applicable.

### Humanitarian Provider

Provides assistance.

### Family Representative

Receives authorised information.

# 26. MVP Scope

## Must Have

- disaster registration;
- I Am Safe;
- Report Missing;
- case reference;
- case tracking;
- case triage;
- human case assignment;
- verified updates;
- family authorisation;
- dispute management;
- assistance requests;
- family location;
- proxy support;
- communication tracking;
- basic safeguarding;
- rumour management;
- audit trail;
- English interface.
## Phase 1

- hospital integration;
- unidentified persons;
- forensic identification;
- consular coordination;
- deceased-person workflow;
- repatriation workflow;
- advanced agency integrations.
## Phase 2

- multilingual;
- voice;
- advanced AI matching;
- broader international integrations;
- advanced offline functionality.
# 27. MVP Success Measures

The MVP should measure:

### Reconnection

- number of safety declarations;
- percentage successfully matched;
- time to family notification.
### Missing-person support

- reports received;
- reports acknowledged;
- time to triage;
- time to first verified update.
### Family support

- assistance requests;
- resolution rate;
- response time.
### Information quality

- verified versus unverified information;
- misinformation identified;
- correction time.
### Operational effectiveness

- cases assigned;
- overdue cases;
- escalations;
- successful handovers.
### Trust

- unauthorised access incidents;
- privacy incidents;
- incorrect notifications;
- family complaints.
# 28. Non-Functional Requirements

The MVP should be:

- secure;
- auditable;
- resilient;
- accessible;
- mobile-friendly;
- low-bandwidth tolerant;
- scalable;
- observable;
- privacy-preserving.
# 29. Critical Assumptions to Avoid

The system must not assume:

- everyone has internet;
- everyone has a smartphone;
- everyone speaks English;
- every family relationship can immediately be verified;
- every authority has a shared database;
- every report is accurate;
- every rumour is false;
- a tour operator knows the official status of every traveller;
- a person wants their location disclosed;
- a missing person is necessarily alive;
- an unidentified body is necessarily connected to a registered case.
# 30. Governance Boundaries

FamilyConnect must establish formal agreements before production operation with relevant:

- government authorities;
- police;
- rescue organisations;
- hospitals;
- humanitarian organisations;
- tour operators;
- embassies/consulates;
- forensic authorities.
The platform must not claim official authority it does not possess.

# 31. MVP Release Strategy

## Stage 1 — Internal Prototype

Core workflows.

## Stage 2 — Controlled Pilot

Selected humanitarian/tour operators.

## Stage 3 — Agency Pilot

Selected authorities and assistance organisations.

## Stage 4 — Public MVP

Only after:

- privacy review;
- security review;
- operational ownership;
- escalation procedures;
- safeguarding arrangements;
- information-verification model;
- agency contacts.
# 32. Acceptance Criteria

The MVP is acceptable only if a user can:

- declare themselves safe;
- receive an acknowledgement;
- report someone missing;
- obtain a case reference;
- see authorised case updates;
- distinguish verified from unverified information;
- request assistance;
- nominate a proxy;
- communicate remotely;
- access physical assistance information;
- handle disputed family access;
- support safeguarding escalation;
- receive event-level verified information;
- receive misinformation corrections;
- support long-term case handover.
# 33. Product Definition

FamilyConnect is therefore defined as:

**A trusted humanitarian information, family-support and multi-agency coordination platform that helps affected people declare themselves safe, enables families to report and track missing-person cases, facilitates verified information and practical assistance, and supports both digital and physical coordination during disaster conditions.**

It is **not**:

- a replacement for police;
- a replacement for hospitals;
- a forensic identification system;
- a government missing-person registry;
- an autonomous rescue system;
- an authority for determining death.
# 34. Next Specification

**SPEC-002 — Domain Model & Data Specification v0.2**

followed by:

**SPEC-003 — API Contract & Event Specification**

and then:

**SPEC-004 — Security, Privacy, Governance & Safeguarding Specification.**

# 35. SPEC-001 STATUS

**Version:** 0.4**Status:** Implemented Baseline — Synchronized with Active Codebase

The red-team scenarios and multi-disaster architecture have been fully incorporated into the production platform.

# 36. Implemented Architectural Refinements (v0.4 Delta)

In the active production release, the following critical requirements have been realized:

### 36.1 Multi-Disaster Event Model & Dynamic Scoping
- Complete isolation between disaster operational theatres:
  - `EVENT-NP-TIBET-2026`: Nepal Glacial Outburst Flood.
  - `EVENT-IN-FL-2026-1187`: Assam Brahmaputra Floods.
- All cases, assistance requests, news items, and telemetry are strictly bound to `disaster_event_id`.
- Dynamic event switching across all public portal pages and coordinator operations consoles.

### 36.2 Autonomous AI News Agent & Verification Hub
- Autonomous crawler ingesting ground truth intelligence from authorized disaster feeds (ASDMA, CWC, NDRF, NDRRMA, NRCS, Police, Meteorological departments).
- Dual crawling schedule: 6-hour emergency burst mode vs. 24-hour routine monitoring mode.
- Mandatory Human-in-the-Loop coordinator verification queue (`PENDING`, `VERIFIED`, `REJECTED`) before publication to public feeds.

### 36.3 Autonomous Agentic Disaster Orchestrator
- Autonomous GDACS (Global Disaster Alert and Coordination System) feed monitoring.
- Dynamic Module Planner recommending event-specific feature modules (`MOD-WATER-LVL`, `MOD-DAMAGE`, `MOD-RELIEF`, `MOD-TUNNEL`, `MOD-DNA`).
- Automated staging preview and two-person governance gates with Identity Assurance Level 2 (IAL-2) step-up authentication.

### 36.4 Specialized Disaster Relief & Telemetry Modules
- **Hydrological Telemetry (`water-levels.html`)**: Real-time river gauges tracking water levels against official Danger Levels (CWC).
- **Relief Schedules (`relief.html`)**: Multi-agency food ration quotas, water supply times, and air-drop locations.
- **Community Damage Assessment (`report-damage.html`)**: Field damage reporting (structural, embankment, agricultural) for Revenue Circle Officers.
- **Hydropower Tunnel Telemetry (`tunnels.html`)**: Deep-shaft rescue monitoring with real-time water and oxygen metrics.
- **Forensic DNA Reference Kit Requests (`dna-request.html`)**: Public buccal swab kit requests with CSPRNG tracking references.
- **Misinformation Debunker (`rumours.html`)**: Rumor reporting and authoritative fact-check statements.

