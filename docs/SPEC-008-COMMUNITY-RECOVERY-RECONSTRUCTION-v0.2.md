# SPEC-008 — Community Recovery & Reconstruction Coordination

*disasteraassistance.life | Oxford–Erdős specification-driven artefact | v0.2 | Draft for Human Review*

**Revision note (v0.1 → v0.2):** this document was originally submitted
as "SPEC-006," colliding with the existing SPEC-006 (UX/UI Design
Specification). Renumbered to SPEC-008, the next free number after
SPEC-007. Requirement/rule IDs updated from `FR-006-*`/`BR-006-*` to
`FR-008-*`/`BR-008-*` to match. This revision also applies the phasing,
entity reconciliation, and terminology fixes from the accompanying
red-team review (`RED-TEAM-REVIEW-SPEC008-AGENTIC.md`) — see the
changelog at the end of this document for the full list.

| | |
|---|---|
| Status | DRAFT — proposed baseline for human/partner review |
| Parent artefacts | SPEC-001 Product Requirements; SPEC-002 Domain/Data; SPEC-003 API/Events; SPEC-004 Security, Privacy, Governance & Safeguards; SPEC-005 Architecture; SPEC-007 Engineering QA & Deployment Testing |
| Purpose | Extend the portal from missing-person/emergency coordination into a governed community recovery and reconstruction coordination platform. |
| Design principle | The portal coordinates and exposes verified information; it does not replace government, police, medical, forensic, civil-registration or humanitarian authorities. |
| AI authority | AI may observe, classify, recommend, draft and escalate. AI does not independently approve high-impact actions or alter authoritative records. |
| Lifecycle | REPORTED → ASSESSED → VERIFIED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED; disputed items enter RESTRICTED_PENDING_REVIEW, mirroring the existing `case_record.data_sharing_status` mechanism (SPEC-002). |
| Target users | Affected people/families; local authorities; national authorities; Red Cross/Red Crescent; UN/humanitarian organisations; NGOs; volunteers; donors; contractors; tour operators/partners; portal operators. |

---

## Gate G0 — Prerequisite (blocking)

**No module in this document begins implementation until the
platform's existing authentication and authorization gaps are closed
and independently re-verified**, specifically: real, non-spoofable
actor identity (session- or token-based, not client-declared headers);
authorization checks present on every case status-transition, dispute,
and escalation endpoint; and case/safeguarding handover restricted to
verified authority identity with genuine two-party acknowledgment. This
document's entire human-in-the-loop trust model — "human reviewer
approves, decision becomes immutable audit data" — is unverifiable
without this. G0 is evaluated the same way as G1–G9 in Section 11 and
blocks all of them.

---

## 1. Problem Statement

One month after a major flash-flood/glacial-disaster event, the
operational problem shifts from immediate life-saving response to a
combined problem of family recovery, restoration of essential services,
infrastructure clearance/reconstruction, livelihoods, documentation and
coordination. People need a simple way to report needs and understand
what is happening. Authorities and humanitarian organisations need a
common, trustworthy view of unmet needs, commitments, assignments,
resources and outcomes.

The platform must therefore become a persistent coordination layer
between affected communities and organisations, while preserving clear
authority-of-record, provenance, privacy, safeguarding and human
decision rights.

## 2. Product Outcome

The desired outcome is not a static website. It is a living recovery
system that continuously observes new information, identifies gaps and
operational risks, proposes improvements or actions, routes proposals
to accountable humans, executes approved changes, tests them, deploys
them safely, monitors outcomes and learns from evidence — subject to
Gate G0.

## 3. Scope and Phasing

**This is the primary structural change from v0.1.** The original
draft presented twelve modules as equally in-scope with no sequencing,
despite Section 13 itself admitting authority-of-record, data-sharing
agreements, and identity-API availability are all unresolved. Scope is
now explicitly phased; a module may not begin before its phase opens,
and a later phase may not open before the prior phase's gates pass.

| Module | Core capability | Primary actors | Phase | Opens after |
|---|---|---|---|---|
| M1 Recovery Need | Report, assess, verify, assign and close household/community needs | Public, case worker, authority, NGO | **1** | G0 |
| M11 Information Integrity | Source provenance, verification, contradiction, rumour/dispute and correction workflows | All roles | **1** | G0 (this is largely an extension of the existing rumour/dispute mechanism, not new ground) |
| M3 Community Recovery (status view only) | Read-only community profile: aggregated service status, unmet-need counts above the disclosure threshold (§10) | Public, local authority, NGO | **2** | Phase 1 shipped and measured for one full cycle |
| M2 Family Recovery | Single family recovery journey spanning missing/deceased/documentation/housing/education/assistance | Family, case worker, authority | **2** | Phase 1; requires M3's entity-reconciliation work (§8) complete |
| M10 Documentation | Guidance and case tracking for death certificates, identity, compensation and related processes | Family, authority, case worker | **2** | Phase 1 |
| M4 Essential Services | Water, electricity, health, schools, sanitation, telecom status **as reported by authoritative sources** | Authority, service provider, NGO | **3** | Named data-sharing agreement per service domain (§13) exists |
| M6 Resource Exchange | Volunteers, machinery, transport, professional skills, supplies | Public, NGO, business, authority | **3** | Phase 2 shipped |
| M7 Organisation Registry | Verified organisations, capabilities, operating areas, commitments | Admin, authority, partner | **3** | Phase 2; required by M6 |
| M8 Recovery Projects | Project lifecycle, milestones, dependencies, evidence and verification | Authority, implementer | **3** | Phase 3 entry, requires M7 |
| M5 Infrastructure | Roads, bridges, buildings, debris/mud clearance, hydropower and access restoration — **read/aggregate-only over authoritative government sources; the platform never originates an independent status for critical infrastructure** | Authority, contractor, NGO | **4** | Explicit government data-sharing agreement per infrastructure domain; legal review confirming read-only posture |
| M9 Funding/Aid Registry | Pledges, commitments, allocations and delivery evidence; no payment processing | Donor, authority, NGO | **4** | Dedicated legal/compliance review (donor due-diligence, fraud, any applicable financial-screening obligations) — separate from and in addition to the general security gate |
| M12 AI Change & Operations | Continuous observation, proposals, build/test/deploy/monitor loops with human approval | AI agents, human reviewers, operators | **5** | G0, and Phases 1–2 operating in production with real usage data to give agents something grounded to observe |

Rationale for the ordering: Phase 1 extends the platform's existing,
proven strengths (need intake, verification/dispute workflows) with the
smallest new surface area. Phase 2 stays within data the platform
already substantially owns (family-level data). Phase 3 introduces
external coordination (other organisations, resources) where the
platform is a broker, not a system of record. Phase 4 is explicitly
gated on external agreements this document cannot itself guarantee.
Phase 5 (the agentic layer) is deliberately last: it needs real
operational data to observe and a trustworthy human-authorization layer
to report to, neither of which exist until the phases before it do.

## 4. Actors and Authority Model

| Actor | May do | May not do |
|---|---|---|
| Public | Report needs, submit evidence, view public status, provide feedback | Confirm official facts, access restricted cases |
| Family | Manage own family case, provide evidence, dispute information | Override authority records |
| Case Worker | Assess cases, request evidence, assign assistance, escalate | Issue official certificates unless delegated authority |
| Authority | Verify/confirm authoritative facts, assign official work, approve closures | Expose restricted personal data unnecessarily |
| Humanitarian Organisation | Register capability, accept tasks, update delivery evidence | Represent unverified claims as official |
| Volunteer/Business | Offer resources, accept approved tasks, report completion evidence | Self-authorise access to sensitive cases |
| Administrator | Manage configuration, access, audit and platform operations | Override authoritative decisions without trace |
| AI Agent | Observe, classify, detect gaps, propose, draft, test, monitor, escalate — **scoped per agent class, see §8 `AgentIdentity`** | Make final high-impact decisions or silently change authoritative data; act under a shared/undifferentiated "AI" identity (see red-team finding H4) |
| Human Review Board | Approve/reject AI proposals and high-risk escalations | Delegate accountability to an AI agent |

**Change from v0.1:** "AI Agent" is no longer treated as a single actor
class in the API layer. The Agentic Model (companion document) defines
sixteen distinct agent roles with different tool/data access needs;
least-privilege (BR-008-009) requires each to have its own scoped
identity, not a shared one. See §8.

## 5. Core State Machines

*(Unchanged from v0.1 — these were sound.)*

### 5.1 Recovery Need
`REPORTED → ASSESSED → VERIFIED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED`
Alternative: `REPORTED`/`ASSESSED`/`VERIFIED` → `RESTRICTED_PENDING_REVIEW`
where safeguarding, identity, legal, fraud, misinformation or authority
conflicts exist. This mirrors `case_record.data_sharing_status` in the
existing schema (SPEC-002) — see §8 for the corresponding field.

### 5.2 Recovery Project
`PROPOSED → HUMAN_APPROVED → PLANNED → FUNDED/RESOURCE_CONFIRMED → IN_PROGRESS → FIELD_VERIFICATION → COMPLETED → ACCEPTED → ARCHIVED`

### 5.3 AI Change
`OBSERVED → ANALYSED → PROPOSED → HUMAN_REVIEW → APPROVED/REJECTED → IMPLEMENTED → TESTED → RELEASE_APPROVED → DEPLOYED → MONITORED → LEARNED → REPLAN`
Gated entirely behind Phase 5 / G0.

### 5.4 Escalation
`DETECTED → TRIAGED → HUMAN_ASSIGNED → HUMAN_DECISION → ACTIONED → VERIFIED → CLOSED`

## 6. Functional Requirements

| ID | Requirement | Acceptance-level statement | Phase |
|---|---|---|---|
| FR-008-001 | Report a Need | System shall allow public users to report household/community needs with category, location, affected population, urgency, narrative and optional evidence. | 1 |
| FR-008-002 | Need provenance | Every submission shall retain source, timestamp, actor type, evidence references and verification state. | 1 |
| FR-008-003 | Assessment | Authorised users shall assess severity, affected population, duplication, safeguarding implications and required service. | 1 |
| FR-008-004 | Assignment | Authorised coordinators shall assign an accepted need to an accountable organisation/person with target date and service outcome. | 1 |
| FR-008-005 | Community profile | System shall aggregate verified service and recovery information by locality without exposing sensitive personal data, and without publishing any locality-level count below the minimum-aggregation threshold in §10. | 2 |
| FR-008-006 | Essential service status | System shall track water, electricity, health, schools, sanitation and telecom service states and restoration tasks **as reported by the authoritative source for each domain** — the platform does not originate these statuses independently. | 3 |
| FR-008-007 | Infrastructure task | System shall track clearance/repair/reconstruction task status **as a read/aggregate view over authoritative government sources**, with location, responsible authority, resource needs and evidence. | 4 |
| FR-008-008 | Resource exchange | System shall match verified resource offers to approved needs/tasks subject to human approval. | 3 |
| FR-008-009 | Family recovery | System shall link relevant family needs while maintaining strict role-based access to sensitive records, reconciled with the existing `family_need`/`assistance_request` entities per §8. | 2 |
| FR-008-010 | Documentation | System shall provide process guidance and status tracking for authority-issued documents; it shall not impersonate the issuing authority. | 2 |
| FR-008-011 | Dispute/correction | Public and authorised actors shall be able to challenge or correct information with provenance and review workflow, extending the existing rumour-correction mechanism. | 1 |
| FR-008-012 | Organisation registry | Partner organisations shall have verified identity, capability, geographic scope, contact and operating status. | 3 |
| FR-008-013 | Project transparency | Public users shall see non-sensitive project status, responsible implementing organisation and evidence of completion. | 3 |
| FR-008-014 | AI proposal | AI agents shall be able to create proposals with rationale, evidence, confidence/uncertainty, impact classification and required human decision, subject to the rate limit in BR-008-020. | 5 |
| FR-008-015 | AI escalation | AI shall escalate predefined high-risk conditions rather than acting autonomously. | 5 |
| FR-008-016 | Audit | Every material state change shall be attributable to a human, system process or specifically-identified AI agent (§8 `AgentIdentity`) and retain before/after state. | 1 (mechanism already exists; extended per module as each phase opens) |
| FR-008-017 | Monitoring | System shall monitor availability, performance, data quality, safety signals, AI behaviour, adoption, workflow outcomes, and AI agent operating cost (§10). | 3 onward |
| FR-008-018 | Learning loop | Closed outcomes and reviewer decisions shall feed controlled improvement backlogs, evaluation sets and future proposals. | 5 |
| FR-008-019 | Agent suspension | An authorised Administrator or Security Lead shall be able to immediately suspend any individual AI agent, revoking its credentials and halting in-flight actions, within a stated SLA. | 5 |
| FR-008-020 | Duplicate/merge review | A potential duplicate or match between two Recovery Need or Family Recovery Case records shall be surfaced for human review and shall never silently merge. | 1 (extends the existing `confirm-match`/`reject-match` mechanism) |

## 7. Business Rules and Invariants

- BR-008-001: AI-generated information is never authoritative solely
  because an AI agent generated it.
- BR-008-002: Official confirmation remains with the competent
  authority/authorised organisation.
- BR-008-003: Sensitive personal data is not displayed on public maps
  or public dashboards.
- BR-008-004: A potential duplicate or match cannot silently merge two
  cases (see FR-008-020).
- BR-008-005: High-impact actions require human approval: death status,
  safeguarding disposition, identity merge, public emergency alert,
  material policy change, deletion of sensitive records, and production
  changes affecting security or data integrity.
- BR-008-006: Every AI proposal must contain evidence references,
  uncertainty, intended outcome, impact class, rollback plan and named
  human decision owner.
- BR-008-007: Public status must distinguish reported, verified and
  officially confirmed information.
- BR-008-008: A recovery project cannot be marked complete solely by an
  implementer self-attestation where independent verification is
  required.
- BR-008-009: Agents must use least-privilege, individually-scoped
  service identities (§8 `AgentIdentity`) and cannot grant themselves
  permissions.
- BR-008-010: Human reviewers can reject, modify, defer or request more
  evidence for any AI proposal.
- BR-008-011: AI agents cannot change their own governing policies,
  guardrails or approval thresholds; such changes require controlled
  human governance.
- BR-008-012: The platform must support graceful degradation and
  low-bandwidth/mobile-first access.
- BR-008-013 *(new)*: No locality-level aggregate (service status count,
  unmet-need count, or similar) is published where the underlying
  population or record count falls below the minimum-aggregation
  threshold defined in §10.
- BR-008-014 *(new)*: `AIExecutionRun` may not begin until its
  `approval_ref` resolves to an `AIProposal` with `decision = Approved`.
  This was implied but not stated as an enforceable invariant in v0.1.
- BR-008-020 *(new)*: AI Proposal creation is rate-limited per agent
  identity and per objective; near-duplicate proposals are
  automatically consolidated before reaching human review, so that
  proposal volume cannot function as a denial-of-service against
  reviewer capacity.
- BR-008-021 *(new)*: Any Administrator or Security Lead may suspend an
  individual agent identity immediately; suspension revokes that
  agent's credentials and is itself an audited action (FR-008-019).

## 8. Data Model Additions

*(Entities marked "reconciliation required" cannot proceed to
implementation until the named reconciliation work is done — this is a
gate, not a suggestion, matching how this project's SPEC-003 gaps were
handled via a formal delta document.)*

| Entity | Key fields | Note |
|---|---|---|
| RecoveryNeed | id, type, location, affected_population, severity, evidence[], provenance, verification_state, **data_sharing_status** *(new — mirrors `case_record.data_sharing_status`, was missing in v0.1 despite the lifecycle table requiring it)*, safeguarding_state, owner, assignee, target_date, status | **Reconciliation required** against existing `family_need`/`assistance_request` before Phase 1 build — is this a supertype, rename, or genuinely parallel concept? |
| FamilyRecoveryCase | id, household, linked person/case refs, needs[], documentation[], assistance[], access_policy | Phase 2 |
| Community | id, administrative hierarchy, population estimate, service_states[], recovery_score_components, public_summary, **min_aggregation_threshold_met** *(new — boolean gate before publishing any count)* | Phase 2 |
| ServiceStatus | service_type, locality, status, last_verified, source, authority, restoration_task_id | Phase 3; `source`/`authority` must resolve to a named data-sharing agreement |
| RecoveryTask | id, need/project ref, task_type, authority, implementer, resources, milestones, evidence, status | Phase 3/4 |
| RecoveryProject | id, locality, objective, scope, owner, budget_ref, dependencies, milestones, verification_method, status | Phase 3 |
| ResourceOffer | id, provider, resource_type, capacity, location, availability, verification, accepted_task | Phase 3 |
| Organisation | id, legal/operating identity, capabilities, geographic scope, verification, contacts, active commitments | Phase 3 |
| FundingCommitment | id, project, source, amount/range, currency, commitment_state, verification, reporting refs | Phase 4; blocked on the compliance gate in §3 |
| **AgentIdentity** *(new)* | agent_id, agent_class (A01–A16 per the Agentic Model), scoped_permissions[], credential_ref, owning_system, status (ACTIVE/SUSPENDED), suspended_by, suspended_at | Replaces the single "AI" actor assumption (red-team finding H4) |
| AIProposal | id, agent_id *(FK to AgentIdentity, was a loose "agent" field)*, objective, evidence_refs, analysis, uncertainty, **impact_class** *(canonical field name — see terminology note below)*, proposed_action, rollback, reviewer, decision, audit_ref | Phase 5 |
| AIExecutionRun | id, agent_id, trigger, plan, tools, outputs, test_results, approval_ref *(must resolve to `AIProposal.decision = Approved` — BR-008-014)*, deployment_ref, outcome | Phase 5 |
| Escalation | id, trigger, **impact_class** *(renamed from `severity` — terminology consolidation)*, rationale, assigned_reviewer, SLA, decision, resolution | Phase 1 (extends existing mechanism) / 5 |
| AuditEvent | timestamp, actor_type, actor_id, action, entity, before_hash, after_hash, evidence_refs, correlation_id | Already exists in the platform (`audit_event`); this extends it, doesn't replace it |

**Terminology note:** v0.1 used three different field names —
`impact_class` (AIProposal), `severity` (Escalation), "risk class"
(Agentic Model's own decision table) — for what is the same underlying
concept. This revision consolidates on `impact_class` (Low / Medium /
High / Critical) everywhere.

## 9. API/Event Extensions

The table below states *intent* per SPEC-008; it is **not** a SPEC-003-
conformant contract. Before any endpoint here is built, it requires the
same treatment SPEC-003 v0.2's own gaps received — headers
(`Idempotency-Key`, `X-Correlation-ID`), the actor-resolution matrix
(now per `AgentIdentity`, not a shared "AI" role — see §8), ETag
concurrency where applicable, and RFC 9457 error responses. This is
flagged as required follow-on work, not restated informally here.

| Endpoint | Role | Purpose | Phase |
|---|---|---|---|
| `POST /api/v1/submissions/recovery-needs` | PUBLIC/FAMILY | Create recovery need | 1 |
| `GET /api/v1/recovery-needs/{id}` | PUBLIC/AUTH | Retrieve permitted status | 1 |
| `POST /api/v1/recovery-needs/{id}/assess` | CASE_WORKER/AUTHORITY | Assess | 1 |
| `POST /api/v1/recovery-needs/{id}/verify` | AUTHORITY/VERIFIER | Verify | 1 |
| `POST /api/v1/recovery-needs/{id}/assign` | COORDINATOR/AUTHORITY | Assign | 1 |
| `POST /api/v1/recovery-needs/{id}/evidence` | AUTH/PARTNER | Attach evidence | 1 |
| `POST /api/v1/recovery-needs/{id}/disputes` | PUBLIC/AUTH/PARTNER | Dispute/correct | 1 |
| `GET /api/v1/communities/{id}/recovery-summary` | PUBLIC | Public community recovery view — subject to BR-008-013 | 2 |
| `GET /api/v1/communities/{id}/services` | PUBLIC | Essential service status | 3 |
| `POST /api/v1/recovery-projects` | AUTHORITY/ADMIN | Create project | 3 |
| `POST /api/v1/recovery-projects/{id}/commitments` | PARTNER/AUTHORITY | Register commitment | 3 |
| `POST /api/v1/resources/offers` | PUBLIC/PARTNER | Offer resource | 3 |
| `POST /api/v1/resources/{id}/match-proposal` | Specific agent class (§8)/HUMAN | Propose match | 3/5 |
| `POST /api/v1/ai/proposals` | Specific agent class (§8) | Create AI proposal, subject to BR-008-020 rate limiting | 5 |
| `POST /api/v1/ai/proposals/{id}/decision` | HUMAN REVIEWER | Approve/reject/modify/defer | 5 |
| `POST /api/v1/ai/escalations` | Specific agent class (§8) | Create escalation | 5 |
| `POST /api/v1/ai/agents/{id}/suspend` *(new)* | ADMIN/SECURITY_LEAD | Immediately suspend an agent identity (FR-008-019) | 5 |
| `GET /api/v1/ops/health` | MONITORING | Platform health | 3 onward |
| `GET /api/v1/ops/ai-runs/{id}` | OPS/AUDITOR | AI run trace | 5 |

## 10. Security, Privacy and Safeguarding Requirements

*(v0.1's list retained; additions marked new.)*

- Data minimisation and purpose limitation for every field.
- Explicit sensitivity classification: PUBLIC, INTERNAL, RESTRICTED,
  HIGHLY_RESTRICTED.
- Field-level access controls for identity, family, child, safeguarding,
  forensic/DNA and health information.
- Encryption in transit and at rest; managed secrets; key rotation.
- Strong authentication for privileged users; MFA for
  authority/partner/admin roles — **this is already committed platform-
  wide as of this session's auth work, not a new requirement specific
  to this module.**
- Immutable or tamper-evident audit logging for material events — this
  already exists (`audit_event`, database-enforced append-only trigger).
- Rate limiting, bot/abuse protection, malware scanning and
  evidence-file controls.
- Threat modelling and red-team testing for every major release.
- Humanitarian disclosure-risk assessment before exposing maps,
  coordinates, names or household information.
- **Minimum aggregation threshold** *(new, BR-008-013)*: no
  locality-level count published below a stated minimum population or
  record count.
- Data retention/deletion rules — **extend the existing
  `disaster_event.retention_policy`/`legal_basis_registry` governance
  columns; do not define a new, parallel mechanism.**
- Incident response with safeguarding escalation and notification
  procedures.
- AI-specific controls: prompt/data isolation, model/tool allowlists,
  retrieval provenance, output validation, prompt-injection defence,
  agent permission boundaries and kill switch (FR-008-019).
- **Agent operating cost monitoring** *(new)*: AI agent compute/token
  cost is a monitored dimension with budget caps and cost-based
  throttling, not only safety/quality-based throttling — relevant given
  the platform's likely donor-funded operating context.
- Do-no-harm review for every new AI capability, especially matching,
  prioritisation, identity, safeguarding and public alerts.

## 11. Acceptance Criteria / Quality Gates

| Gate | Pass condition |
|---|---|
| **G0** *(new, blocking)* | Platform authentication/authorization gaps from the security review closed and independently re-verified. |
| G1 Specification | Requirements, state machines, authority-of-record and edge cases reviewed. |
| G2 Security | Threat model, privacy impact/data responsibility assessment, abuse cases and red-team tests passed. |
| G2a *(new)* | Dedicated legal/compliance review passed for M9 specifically (separate from general G2). |
| G3 Data | Sensitivity classification, retention, provenance, access, and minimum-aggregation-threshold tests passed. |
| G4 Functional | All FRs have automated or documented acceptance tests. |
| G5 AI Safety | Agent proposals are traceable to a specific `AgentIdentity`; high-impact actions require human approval; refusal/escalation/suspension paths tested. |
| G6 Operational | Monitoring, alerting, backup/restore, incident runbook, rollback, and agent-cost budget alerts tested. |
| G7 Adoption | Mobile/low-bandwidth usability and multilingual content reviewed with representative users — **contingent on closing the existing frontend i18n gap identified in this session's frontend review (§13).** |
| G8 Release | Named human release authority approves production deployment; a named deputy/succession approver exists for when the primary is unavailable during active disaster response. |
| G9 Post-release | Monitoring confirms agreed SLOs, safety indicators and adoption measures; defects feed the controlled backlog. |

## 12. Adoption Requirements

*(Unchanged from v0.1 — sound as written.)*

- Do not require users to understand the portal's internal case model;
  ask simple questions in local language.
- Mobile-first, low-bandwidth, progressive forms and save/resume.
- Provide assisted access through local authorities, Red Cross/Red
  Crescent, community workers and partner organisations.
- Make the portal useful even without an account: community status,
  service locations and verified updates.
- Create clear value for each stakeholder: citizen = get help/track;
  authority = coordinate; NGO = find unmet needs; volunteer = find
  where skills are needed; donor = see verified projects.
- Use trusted distribution channels and physical/community touchpoints,
  not digital advertising alone.
- Provide Nepali and English initially, with Hindi/other languages
  where operationally justified.
- Publish correction and dispute mechanisms so users can see that
  reports are acted upon.
- Measure task completion and time-to-resolution, not page views alone.
- **New**: given the scope growth in this document, the public-facing
  information architecture requires an explicit revision pass as each
  phase ships — simplicity is not a byproduct of a 12-module backend,
  it has to be designed for at each phase, not assumed.

## 13. Traceability and Known Unknowns

- Exact government authority-of-record for each infrastructure/service
  domain must be confirmed before integration (blocks Phase 3/4 per §3).
- Data-sharing agreements and information-sharing protocols must be
  established with participating agencies (blocks Phase 3/4).
- Official identity/document APIs may not exist; initial implementation
  may require guided workflows and human verification.
- Connectivity and device constraints vary materially by locality;
  field testing is required.
- AI should not be assumed to improve outcomes until measured against
  human baseline and safety metrics.
- **New**: `RecoveryNeed` vs. existing `family_need`/`assistance_request`
  reconciliation is unresolved (§8) and blocks Phase 1.
- **New**: the deployed frontend currently has no working i18n despite
  UI copy on several pages implying translations exist — a known,
  already-identified gap this document depends on being fixed (blocks
  G7).
- **New**: Gate G0 (platform auth) is the overall blocking unknown for
  this entire document — see the red-team review for current status.

## 14. References / Design Inputs

*(Unchanged from v0.1.)*

Humanitarian data responsibility is treated as a first-class design
constraint. OCHA's 2025 guidance explicitly covers operational data and
emphasises safe, ethical and effective management; OCHA's humanitarian
information-management principles include accessibility, inclusiveness,
interoperability, accountability, verifiability, relevance, neutrality,
humanity, timeliness, sustainability and confidentiality. IFRC likewise
describes data protection as integral to protecting life, integrity,
dignity and trust. These principles should be incorporated into the
portal's governance and acceptance gates.

Sources: Centre for Humanitarian Data, Revised OCHA Data Responsibility
Guidelines (2025); OCHA Principles of Humanitarian Information
Management; IFRC Data Protection overview and policy materials.

---

## Changelog (v0.1 → v0.2)

- Renumbered SPEC-006 → SPEC-008 (collision with existing UX/UI spec).
- Renumbered all FR/BR IDs to the `-008-` prefix; declared the
  prefixed-numbering convention explicitly going forward.
- Corrected the SPEC-004 parent-artefact title; added SPEC-007 as a
  parent artefact.
- Added Gate G0 (platform auth prerequisite) — blocking.
- Replaced flat, unphased scope (§3) with an explicit five-phase
  sequence with named entry gates per phase.
- Reframed M5 (Infrastructure) as read/aggregate-only over authoritative
  sources, never an independent system of record.
- Added a dedicated compliance gate (G2a) for M9 (Funding/Aid Registry).
- Added `AgentIdentity` entity; replaced the single shared "AI" actor
  assumption throughout §4/§9 with per-agent-class scoping.
- Added BR-008-013 (minimum aggregation threshold), BR-008-014
  (AIExecutionRun/AIProposal approval linkage), BR-008-020 (proposal
  rate limiting), BR-008-021 (agent suspension) and corresponding
  FR-008-019/020.
- Consolidated `impact_class`/`severity`/"risk class" terminology onto
  a single canonical `impact_class` field.
- Added `data_sharing_status` to `RecoveryNeed` to actually carry the
  `RESTRICTED_PENDING_REVIEW` state the lifecycle table already claimed.
- Flagged `RecoveryNeed` vs. existing `family_need`/`assistance_request`
  as requiring formal reconciliation before Phase 1.
- Cross-referenced existing `disaster_event` retention/legal-basis
  columns instead of restating retention policy as a placeholder.
- Cross-referenced the known frontend i18n gap against the G7 adoption
  gate.
- Added agent operating-cost monitoring as an explicit requirement.
