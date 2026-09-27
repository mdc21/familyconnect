# FamilyConnect — AI Agent Definition

---

## One-Paragraph Version

My agent is the **FamilyConnect Sentinel–Planner–Builder–Deployer AI orchestration system** — a multi-stage humanitarian coordination agent that monitors the world for natural disasters, autonomously assembles a ready-to-deploy response portal, and then continuously coordinates the entire arc from emergency response through community recovery and physical reconstruction. It helps **national disaster management authorities, humanitarian agencies, case workers, affected families, and reconstruction project leads** achieve two measurable goals: **reducing the time from disaster detection to a live public coordination portal to under 30 minutes** (response phase), and **ensuring verified, non-custodial reconstruction funding reaches the right community projects with full audit transparency** (recovery phase). It uses global alert feeds (GDACS, USGS, ReliefWeb), an institutional precedent memory, and a Gemini LLM for context-sensitive module selection. Its principal activities span two phases: (1) **Response** — scanning multi-hazard feeds, classifying events by type (Cyclone, Flood, Earthquake, Tsunami, Glacier Burst, Wildfire), resolving an optimal set of response modules, generating culturally localised HTML portals; and (2) **Recovery & Reconstruction** — coordinating community recovery needs (M1), tracking reconstruction projects from proposal to field verification (M8), managing non-custodial funding pledges and evidence-backed aid allocations (M9), and running AI gap-detection to match unmet needs with available donor funds (M12). It may autonomously detect events, deduplicate alerts, select and activate response modules, generate portal artifacts, observe cross-module recovery gaps, and propose funding matches — but it must obtain human approval before promoting any portal to production, activating safeguarding or death-status modules, ratifying funding allocations, or releasing reconstruction tranches. Its guardrails are based on SPHERE humanitarian standards, UN OCHA data-sharing agreements, GDPR/data-minimisation principles, a six-tier (L0–L5) human decision authority model (SPEC-009), and a zero-fund-holding non-custodial invariant (BR-008-025). It must escalate when LLM confidence is below threshold, when a confounds analysis is required before issuing an IMPROVED verdict, or when a compound infrastructure bottleneck triggers a Level-3 (L3) gap-escalation. Its actions are recorded in a full PostgreSQL audit event log (`audit_event` table) and governed by proposal/outcome records in the institutional memory (`ai_proposal`, `outcome_record`, `precedent` tables). It will be considered successful when a portal is live within 30 minutes of a red-alert detection, reconstruction projects progress from PROPOSED to FIELD_VERIFICATION with full tri-party attestation, zero fund custodianship violations occur, and 128/128 automated tests pass across all feature additions.

---

## Full AI Agent Definition Template

### My agent is:
**FamilyConnect Sentinel–Planner–Builder–Deployer Orchestration Agent**

A multi-stage autonomous AI system that continuously monitors global disaster feeds, classifies natural hazard events, selects appropriate response modules, generates multilingual disaster coordination portals, and stages them for human review and production deployment — then continues to coordinate community recovery needs, reconstruction project tracking, non-custodial funding flows, and AI-driven gap detection through the full recovery arc — all within a governed, human-in-the-loop pipeline.

---

### It is designed for:
- **National Disaster Management Authorities (NDMAs)** — e.g., NDRRMA (Nepal), NDMA (Pakistan), NDMO (Vanuatu), PDRRMO (Philippines)
- **UN/OCHA Humanitarian Agencies and INGOs** — coordinating multi-cluster disaster response and reconstruction programmes
- **Partner Organisations and NGOs** — registering capabilities, reporting infrastructure damage, and delivering reconstruction assistance
- **Case Workers and Frontline Responders** — tracking displaced families and essential service outages
- **Affected Families and Individuals** — declaring safety, reporting missing persons, submitting recovery needs, and tracking reconstruction entitlements
- **Reconstruction Project Leads & Municipalities** — proposing, managing, and field-verifying community reconstruction projects (water, shelter, roads, schools)
- **Donor Organisations** — making statutory funding pledges and monitoring non-custodial aid delivery with evidence-backed transparency

---

### The problem it solves is:
When a major disaster strikes — a Category 5 cyclone in Vanuatu, a super typhoon in the Philippines, a glacial outburst in Pakistan — humanitarian agencies waste critical hours manually standing up communication portals, coordinating who does what, and figuring out which tools are relevant. Then, as the acute phase passes, a second coordination failure emerges: recovery needs go unmatched to available funds, reconstruction projects stall without verified progress tracking, and donor accountability is weak. FamilyConnect addresses both problems: it **automatically detects the event and generates a live, localised, role-appropriate portal in under 30 minutes** (response phase), and then provides a **governed reconstruction coordination platform** — where community recovery needs are registered, matched to non-custodial funding pledges, and tracked through evidence-backed delivery with three-tier attestation (beneficiary → field worker → authority).

---

### Its primary goal is:
> **Phase 1 (Response):** Reduce disaster coordination cold-start time from 24–72 hours to under 30 minutes.
> **Phase 2 (Recovery & Reconstruction):** Ensure every verified community recovery need is matched to available funding within 72 hours, and every reconstruction project has an evidence-backed delivery trail from approval to field verification — with zero fund custodianship by the platform.

Measurable targets:
- Detection-to-live-portal latency: **≤ 30 minutes** for RED/CRITICAL alerts
- Recovery need-to-funding match rate: **≥ 80%** of verified needs matched within 72 hours
- Reconstruction project completion tracking: **100%** of `HUMAN_APPROVED` projects reaching `FIELD_VERIFICATION` with tri-party attestation evidence
- Test suite pass rate: **128/128 (100%)** maintained across all feature additions
- Portal modules activated correctly per event type: **≥ 95% accuracy vs. expert baseline**
- Zero `BR-008-025` (fund custodianship) violations
- Full audit trail coverage: **100%** of AI actions logged to `audit_event`

---

### It is needed because:
A simple web application or fixed automation cannot handle this problem because:
1. **Event type diversity** — Floods, cyclones, earthquakes, tsunamis, wildfires, and glacier bursts each require a different set of coordination modules, terminology, emergency contacts, and country-specific language codes (23 country configurations in the registry).
2. **Country-specific context** — A cyclone in Tonga requires Tongan language codes, different emergency numbers, and island-specific infrastructure status modules vs. a cyclone in the Philippines requiring Tagalog and multi-island coordination.
3. **Dynamic module selection** — Determining which optional modules (e.g., DNA forensics for mass-casualty events, water purification for flood/cholera risk, aftershock alerts for earthquakes) should be activated requires contextual reasoning over severity, region, and precedent cases.
4. **Reconstruction lifecycle complexity** — Post-disaster recovery is multi-phase and non-linear: needs must be verified, projects proposed and approved, funds pledged and allocated sector-by-sector (HOUSING_RECONSTRUCTION, DRINKING_WATER, HEALTHCARE, EDUCATION), and delivery evidenced through triangulated attestation. No fixed automation can handle this dynamically.
5. **Institutional memory** — Module selection and gap-matching decisions must improve over time from prior event outcomes; a static app has no such capability.
6. **Non-custodial fund transparency** — Ensuring funds flow directly donor → recipient while maintaining a public audit trail of every pledge, allocation, and delivery attestation requires AI-driven cross-module observation that no static dashboard can provide.
7. **Multi-stakeholder coordination** — The system must simultaneously serve public users, case workers, partner agencies, reconstruction project leads, donors, and government authorities with role-appropriate access — impossible with a single fixed interface.

---

### It is triggered when:
- **Scheduled cron** — `sentinelAgent.js` polls GDACS, USGS, NOAA/JTWC, and ReliefWeb feeds for alerts at RED or ORANGE severity (production: every 15 minutes)
- **Manual admin scan** — An authenticated IAL-2 admin triggers `POST /orchestrator/scan` from the console
- **Webhook event** — An external UN/OCHA system posts a new alert directly to the ingest endpoint
- **User-reported event** — A government authority submits a detection through the authority portal

---

### It receives:
- **Global disaster alert feeds**: GDACS RSS/JSON (UN OCHA/EC), USGS Earthquake API, NOAA/JTWC tropical cyclone advisories, ReliefWeb API
- **Structured alert fields**: `sourceAlertId`, `eventType` (TC/FL/EQ/TS/GL/WF/VO), `severity` (RED/ORANGE/GREEN), `country`, `region`, `coordinates`, `estimatedAffected`, `confidence`
- **Community recovery needs submissions**: Household and community-level need reports (category: DRINKING_WATER, TEMPORARY_SHELTER, HOUSING_REPAIR, MEDICAL_CARE, SCHOOL_MATERIALS, EDUCATION) with location, affected population, severity, and narrative
- **Reconstruction project proposals**: Title, objective, scope, lead organisation, community ID, budget, and sector — submitted by AUTHORITY or ADMIN actors via `POST /api/v1/recovery-projects`
- **Funding pledges and allocation requests**: Donor name, pledge amount, currency, target sector (HOUSING_RECONSTRUCTION, HEALTHCARE, DRINKING_WATER, EDUCATION), statutory verification status
- **Tri-party delivery attestation evidence**: Beneficiary, field worker, and authority attestations for aid allocation delivery (`aid_delivery_evidence`)
- **Infrastructure damage reports**: Power outages, road damage, bridge failures, water system breaches — via `POST /api/v1/infrastructure/status`
- **Institutional precedent records**: Prior event outcomes, module performance data, and confounds analysis from the `precedent` table (filtered `is_seed = FALSE` to exclude test fixtures)
- **Human override inputs**: Module toggle decisions from admin console, reviewer comments (APPROVED / REJECTED / NEEDS_REVISION), project status updates
- **Operational context**: Current infrastructure status, active funding pledges, gap reports, and aid allocation data from live database

---

### It uses knowledge from:
- **SPHERE Humanitarian Standards** — minimum standards for shelter, water, sanitation, food, and health in disaster response and reconstruction
- **UN OCHA data-sharing agreements** — governs which partner organisations can feed authoritative essential-services data
- **SPEC-008 Community Recovery & Reconstruction specification** — 13-module architecture covering needs (M1) → infrastructure (M5) → recovery projects (M8) → funding & evidence (M9) → gap detection & Gate G8 release (M12)
- **SPEC-009 Agentic Platform Engineering Governance** — six-tier (L0–L5) human decision authority model, least-privilege agent permissions, anti-DoS consolidation rules
- **SPEC-010 Humanitarian Intelligence & Continuous Learning** — mandatory confounds analysis, human baseline comparison, precedent applicability matching
- **Module Registry (`module_registry` table)** — capability catalogue with `applicable_types`, `is_core`, `dependencies` for all 21 registered modules (14 core + 7 optional hazard-specific)
- **Sector mapping rules** — cross-module logic that maps recovery need categories (TEMPORARY_SHELTER, HOUSING_REPAIR) to funding sectors (HOUSING_RECONSTRUCTION) for gap-matching in M12
- **Recovery project status machine** — `PROPOSED → HUMAN_APPROVED → PLANNED → RESOURCE_CONFIRMED → IN_PROGRESS → FIELD_VERIFICATION → COMPLETED → ACCEPTED` lifecycle enforced by `recovery-projects/routes.js`
- **Institutional memory (`precedent` table)** — curated prior-event decisions, outcomes, and evaluation verdicts used to inform planning for new events
- **Country language code configuration** — 23 country codes configured in `COUNTRY_LANGUAGES` registry (NP, IN, BD, PK, CN, JP, PH, ID + 9 Pacific Island/coastal nations FJ, VU, SB, TO, WS, PG, MG, MZ, MU + US, MX, BR, AU, GB, KE). ⚠️ **Note**: the agent selects language codes for the portal manifest; delivery of translated content depends on locale JSON files (`/locales/*.json`) deployed alongside the portal.

---

### It can use these tools:
| Tool / Service | Purpose |
|:---|:---|
| **GDACS API** (`gdacs.org/xml/rss.xml`) | Multi-hazard alert feed (TC, EQ, FL, TS, VO, WF) |
| **USGS Earthquake API** | Real-time seismic event detection |
| **Gemini LLM (gemini-3.6-flash)** | Context-sensitive optional module selection during event planning |
| **Deterministic fallback selector** | Priority-ordered module selection when LLM is unavailable (503/no-key) |
| **Module Registry** | Queries `module_registry` table for applicable modules per hazard type (21 modules registered) |
| **Template Engine** | Substitutes `{{variable}}` into pre-written, pre-tested HTML templates (no LLM code generation) |
| **Recovery Needs API** (`/api/v1/submissions/recovery-needs`) | Accepts community recovery need submissions; manages REPORTED→ASSESSED→VERIFIED→ASSIGNED lifecycle |
| **Recovery Projects API** (`/api/v1/recovery-projects`) | Creates and tracks reconstruction projects through 8-stage status machine (PROPOSED→ACCEPTED) |
| **Funding Registry API** (`/api/v1/funding/pledges`, `/api/v1/funding/allocations`) | Records non-custodial pledges, sector allocations, and tri-party delivery attestation evidence |
| **Infrastructure Status API** (`/api/v1/infrastructure/status`) | Ingests power outage, road damage, and water system failure reports |
| **Recovery Ops / Gap Detection** (`/api/v1/ops/observe-gaps`) | AI cross-module observation: matches unmet needs to unallocated funds; triggers L3 escalation for compound bottlenecks |
| **PostgreSQL database** | `detected_event`, `disaster_event`, `generated_artifact`, `recovery_need`, `recovery_project`, `funding_pledge`, `aid_allocation`, `aid_delivery_evidence`, `audit_event`, `ai_proposal`, `outcome_record`, `precedent` tables |
| **Evaluation Service** | Records proposal outcomes and manages the institutional precedent set |
| **Agent Governance Service** | Validates agent permissions, enforces minimum tier requirements (L0–L5), consolidates proposals |
| **Rate limiter** (`express-rate-limit`) | Defends write-path endpoints against abuse (429 with RFC9457 `problem+json`) |
| **Audit writer** (`writeAuditEvent`) | Immutable append-only audit log for every AI action |

---

### It follows this operating loop:

```
OBSERVE → UNDERSTAND → EXPLORE → DECIDE → APPROVE → ACT → MEASURE → LEARN
```

| Stage | What happens |
|:---|:---|
| **Observe** | (Response) Sentinel polls GDACS + USGS + JTWC for RED/ORANGE natural hazard alerts across all event types. (Recovery) Gap Detection Agent (M12) continuously queries unmet recovery needs vs. unallocated pledged funds across all active events |
| **Understand** | Deduplicates alerts by `source_alert_id`; maps GDACS codes (TC→CYCLONE, EQ→EARTHQUAKE) to internal hazard types; assesses severity, country, affected population. For recovery phase: cross-maps need categories (TEMPORARY_SHELTER→HOUSING_RECONSTRUCTION) to funding sectors |
| **Explore** | Planner queries Module Registry for applicable core + optional modules; consults institutional memory (`precedent` table) for prior event patterns. Recovery ops service scans `recovery_need` (status REPORTED/ASSESSED/VERIFIED) vs. `funding_pledge` (OFFICIAL_CONFIRMED, unallocated > 0) |
| **Decide** | Gemini LLM recommends which optional modules to activate (deterministic fallback if unavailable). Gap Detection generates AI proposals (`ai_proposal` table) for fund-to-need matches and flags compound bottlenecks for L3 escalation |
| **Approve** | (Portal launch) Human admin reviews staged portal preview and submits APPROVED/REJECTED/NEEDS_REVISION. (Reconstruction) AUTHORITY or ADMIN approves recovery projects (`PROPOSED→HUMAN_APPROVED`); IAL-2 authority verifies pledge statutory clearance; dual-signature Gate G8 ratifies production releases |
| **Act** | Builder generates multilingual HTML portal artifacts via template substitution (no LLM code generation). Deployer promotes to `disaster_event` (ACTIVE). Recovery ops advances project status through `IN_PROGRESS→FIELD_VERIFICATION→COMPLETED`. Tri-party attestation records delivery evidence (beneficiary + field worker + authority) |
| **Measure** | M12 gap-detection metrics logged to `ops_cost_metric`; L3 escalations tracked; project completion rates measured; funding allocation vs. pledge amounts monitored for BR-008-025 compliance |
| **Learn** | Evaluation Service records proposal outcomes (baseline vs. post-change, confounds analysis). IMPROVED verdicts enter precedent set. Human module overrides attributed for future calibration. Negative findings preserved equally (BR-010-006) |

---

### The main decisions it makes are:
1. **Hazard classification** — Which GDACS event type code maps to which internal disaster category, and what severity band applies
2. **Module activation** — Which of the 21 registered modules should be active for this specific disaster type, severity, and country context
3. **Optional module selection** — Whether to activate DNA forensics (CRITICAL/HIGH severity only), water purification (flood/cholera risk), aftershock alerts (earthquake), or shelter modules
4. **Language code selection** — Which BCP-47 language codes to include in the portal manifest based on the affected country code (23 country configurations; unknown countries default to English-only)
5. **Terminology selection** — Which hazard-appropriate vocabulary to use (e.g., "Impact Zone" and "Disaster Response Force" for cyclones vs. "Collapse Site" and "Urban Search & Rescue" for earthquakes)
6. **Recovery need → funding sector mapping** — Whether TEMPORARY_SHELTER maps to HOUSING_RECONSTRUCTION, DRINKING_WATER matches available water sector pledges, etc. for gap-matching in M12
7. **Gap escalation** — Whether an unmet-need/funding mismatch, or compound infrastructure bottleneck (water + power + health simultaneously), constitutes an L3 escalation
8. **Reconstruction project status advancement** — When to propose moving a project from RESOURCE_CONFIRMED → IN_PROGRESS → FIELD_VERIFICATION based on evidence received
9. **Precedent applicability** — Whether a prior event outcome is applicable to the current event and should inform planning decisions
10. **Proposal tier assignment** — What minimum human authority tier (L0–L5) is required to approve a given AI-proposed change

---

### It may autonomously:
- Poll disaster alert feeds and ingest new alerts into `detected_event`
- Deduplicate alerts by `source_alert_id` (idempotent re-scans)
- Classify event type and severity from feed data
- Query module registry and resolve module dependencies (including transitive dependencies)
- Consult institutional memory for applicable precedents (`is_seed = FALSE` filtered)
- Generate portal HTML artifacts using pre-approved templates (no LLM-generated code)
- Write audit events to the immutable `audit_event` log
- Run cross-module recovery gap observation (observe unmet needs vs. unallocated pledges)
- Generate AI proposals (`ai_proposal`) for fund-to-need matching with evidence references
- Trigger L3 compound bottleneck escalation when multiple infrastructure failures co-occur
- Record gap observations and operational cost metrics to `ops_cost_metric`
- Apply rate limiting and reject unauthorised or IAL-0 requests
- Map recovery need categories to funding sectors for gap analysis

---

### It must obtain human approval before:
- **Promoting a portal to production** (APPROVED status + `deployEventToProduction`) — required reviewer must be IAL-2 authenticated
- **Activating modules that touch safeguarding, identity matching, or death status** — L3 minimum tier human decision required per SPEC-009 §8
- **Emergency alert broadcasting** — L3 minimum tier per capability tier map
- **Modifying access control, authentication, or agent permissions** — L4 minimum tier
- **Changing approval thresholds, authority-of-record rules, or agent governance policy** — L5 minimum tier
- **Issuing an IMPROVED evaluation verdict** that enters the precedent set — requires human evaluator review with mandatory confounds analysis (BR-010-003)
- **Gate G8 production release ratification** — requires both primary approver and deputy succession approver with dual-signature attestation

---

### It must escalate when:
- LLM module selection fails or returns a non-array response (falls back to deterministic priority selector; logs warning)
- `GEMINI_API_KEY` is absent or the LLM returns a 503 — deterministic fallback executes and a warning is recorded
- Gap observation detects compound infrastructure bottlenecks (missing water + power + health access simultaneously) — fires L3 escalation to senior coordinator
- An evaluation cannot be concluded (verdict stays `INCONCLUSIVE`) because confounds analysis is incomplete or human baseline is missing
- A proposal attempts to declare a tier below the capability's required minimum — anti-tampering check raises `TIER_INSUFFICIENT` error
- Evidence array exceeds 50 items during aid delivery attestation — capped and logged for human review
- A precedent query attempts to include `is_seed = TRUE` fixtures — blocked to prevent test data polluting institutional memory

---

### Its guardrails are based on:
| Guardrail | Source |
|:---|:---|
| Zero fund custodianship | BR-008-025: Platform never holds, transfers, or controls humanitarian funds |
| Non-custodial aid transparency | All pledges and allocations publicly visible; funds flow directly donor → recipient |
| Data-sharing agreement gating | OCHA §13: Essential service feeds only accepted from verified authorities with active `agreementRef` |
| Six-tier human authority model | SPEC-009 §8: L0 (documentation) → L5 (governance policy) tiered approval requirements |
| Least-privilege agent permissions | SPEC-009 §5: Each agent has an `agent_identity` record with explicit permission set |
| IAL-2 authentication requirement | Sensitive endpoints (safeguarding, DNA, verification) require Identity Assurance Level 2 |
| Anti-DoS proposal consolidation | BR-009-011: Maximum 50 evidence refs; duplicate proposals consolidated, not multiplied |
| SPHERE humanitarian standards | Minimum standards for shelter, water, sanitation, nutrition, and health in portal-generated guidance |
| GDPR / data minimisation | PII collected only as needed; locality threshold suppresses counts for low-population communities (BR-008-013) |
| Anti-enumeration shielding | Sensitive endpoints return 404 (not 401/403) to unauthenticated callers to prevent resource discovery |
| Institutional memory isolation | `is_seed = FALSE` filter prevents test fixtures from influencing precedent queries |

---

### It must never:
- Hold, transfer, or custody humanitarian funds (BR-008-025, zero-tolerance)
- Accept essential-services data from organisations without a verified data-sharing agreement
- Promote a portal to production without a human-issued APPROVED decision in `event_review`
- Allow an agent to execute an action for which it lacks explicit permission in `agent_permissions`
- Use LLM to generate portal HTML code (only deterministic template substitution is permitted for artifact generation)
- Allow `is_seed = TRUE` precedents to influence live event planning
- Expose PII or case-level data to PUBLIC actor class
- Silently merge potential duplicate family registrations (must queue for human deduplication review)
- Issue a death status update without L3 human authority
- Allow a proposal to self-declare a tier lower than the capability's minimum required tier

---

### If it is uncertain, it will:
- **LLM unavailable or low-confidence**: Automatically fall back to the deterministic priority-ordered module selector and log a `console.warn` with reason
- **Precedent not found**: Proceed with current event classification without precedent consultation; log `institutional memory query skipped`
- **Confounds analysis incomplete**: Hold evaluation verdict at `INCONCLUSIVE`; do not promote to precedent set until human evaluator completes review
- **Module dependency ambiguous**: Apply conservative dependency resolution (add all transitive dependencies rather than omit)
- **Country code unknown**: Default to English-only language pack (`COUNTRY_LANGUAGES.DEFAULT`)
- **Event type unrecognised**: Apply FLOOD terminology as safe default fallback

---

### If a tool or system fails, it will:
| Failure | Response |
|:---|:---|
| **LLM (Gemini API) returns 503 or throws** | Catch exception → `getDeterministicFallbackModules()` executes → warning logged |
| **Database connection fails** | Transaction rolled back (`ROLLBACK`) → connection released → error propagated with HTTP 500 |
| **GDACS feed unreachable** | `fetchGDACSAlerts()` returns last-known catalog; scan audit event records zero new detections |
| **Rate limit exceeded on write-path** | Returns HTTP 429 with `application/problem+json` RFC9457 body; request not processed |
| **Artifact generation template missing** | Builder Agent throws and rolls back; event stays in PLANNED status; admin console shows error |
| **Evidence array overflow (>50 items)** | Array capped at 50; warning logged; human review flag set |
| **Deployer finds non-APPROVED status** | Hard error: `Cannot deploy event with status X. Must be APPROVED.` — no partial deployment |

---

### Its actions will be recorded through:
- **`audit_event` table** — immutable append-only log for every agent action: `actor`, `action`, `entity_type`, `entity_id`, `previous_state`, `new_state`, `outcome`, `timestamp`
- **`ai_proposal` table** — structured record of every AI-generated proposal with tier, justification, evidence refs, and approval status
- **`outcome_record` table** — measured metrics, baseline vs. post-change values, confounds analysis, and evaluation verdict for every executed proposal
- **`precedent` table** — curated, human-verified institutional memory entries (filtered to exclude seed/test fixtures)
- **`event_review` table** — human reviewer decisions (APPROVED/REJECTED/NEEDS_REVISION) with reviewer identity and comments
- **`event_module_activation` table** — per-module activation record attributed to agent (`A04-PLANNER`) or human override (`HUMAN:<reviewer>`)
- **`ops_cost_metric` table** — daily compute token usage and budget solvency tracking per Gate G8 / SPEC-008 §10

---

### It learns and improves from:
- **Outcome records** — Post-change metrics compared against human baseline; verdict (IMPROVED / NO_CHANGE / REGRESSED / INCONCLUSIVE) stored against the proposal
- **Expert evaluator review** — Human evaluator completes confounds analysis and upgrades verdicts from INCONCLUSIVE before they enter the precedent set
- **Precedent consultation** — Every new event plan queries applicable prior precedents by hazard type; findings stored in `manifest.precedentsConsulted`
- **Negative/null findings** — SPEC-010 BR-010-006 requires equal preservation of null and negative results to prevent optimism bias in institutional memory
- **Human module overrides** — When an admin toggles a module after AI planning, the override is attributed (`HUMAN:<reviewer>`), creating a signal for future module selection calibration
- **Gap detection feedback** — L3 escalation outcomes feed back into the operational learning cycle for cluster-specific response calibration

---

### The agent will be successful when:

| Target | Metric |
|:---|:---|
| **Response speed** | Detection-to-live-portal latency ≤ 30 minutes for RED/CRITICAL alerts |
| **Hazard coverage** | All 9 hazard types (CYCLONE, FLOOD, EARTHQUAKE, TSUNAMI, GLACIER_BURST, CLOUD_BURST, WILDFIRE, VOLCANO, DROUGHT) correctly classified and routed |
| **Module accuracy** | ≥ 95% module activation precision vs. expert humanitarian coordinator baseline |
| **Recovery matching** | ≥ 80% of verified recovery needs matched to available sector funding within 72 hours |
| **Reconstruction tracking** | 100% of HUMAN_APPROVED reconstruction projects tracked to FIELD_VERIFICATION with tri-party attestation evidence |
| **Test quality** | 128/128 automated tests passing (0 failures) after every feature addition |
| **Compliance** | Zero BR-008-025 (fund custodianship) violations; 100% audit event coverage |
| **Language code correctness** | Correct BCP-47 language codes selected for all 23 configured countries; unknown countries default gracefully to English-only |
| **Resilience** | Graceful deterministic fallback when LLM is unavailable; zero data loss on any single component failure |
| **Human trust** | Human reviewers approve ≥ 90% of AI-generated portal plans without requiring NEEDS_REVISION |
| **Institutional memory** | Precedent set grows with verified, confound-analysed entries; planning quality measurably improves over successive events |

---

### The agent will be tested using:

| Test Category | Examples |
|:---|:---|
| **Normal response cases** | RED cyclone alert → portal generated with correct 17 modules, Tongan language codes, cyclone terminology |
| **Multi-hazard coverage** | Each of 9 disaster types individually triggers correct module set and terminology |
| **Country language code selection** | Vanuatu → `['en','bi','fr']`; Philippines → `['en','tl']`; Tonga → `['en','to']`; unknown code → `['en']` |
| **Deduplication** | Re-running sentinel scan on already-ingested `source_alert_id` produces zero new records |
| **LLM failure (adversarial)** | Gemini API returns 503 → deterministic fallback activates → correct modules selected |
| **Module dependency resolution** | MOD-TRACK requires MOD-TRACE; activating MOD-TRACK auto-activates MOD-TRACE |
| **Recovery need lifecycle** | REPORTED → ASSESSED → VERIFIED → ASSIGNED state machine enforced; potential duplicates queued, not silently merged |
| **Reconstruction project lifecycle** | PROPOSED → HUMAN_APPROVED (authority required) → IN_PROGRESS → FIELD_VERIFICATION → COMPLETED |
| **Gap detection — fund matching** | M12 cross-matches DRINKING_WATER need vs. OFFICIAL_CONFIRMED pledge with unallocated balance |
| **Gap detection — L3 escalation** | Compound bottleneck (water + power + health missing simultaneously) fires L3 escalation |
| **Fund custodianship (compliance)** | Allocation exceeding pledge amount returns 400 (BR-008-025 violation) |
| **Tri-party attestation** | Aid delivery evidence requires beneficiary + field worker + authority attestations |
| **Governance guardrails** | L3-capability proposal rejected when submitted at L1 tier (TIER_INSUFFICIENT) |
| **Authentication shielding** | Sensitive endpoints return 404 to PUBLIC/unauthenticated callers (anti-enumeration) |
| **Rate limiting** | Burst exceeding threshold returns 429 with RFC9457 `problem+json` |
| **Teardown isolation** | E2E drill test leaves zero stray records in `detected_event` or `disaster_event` after `after()` hook |
| **Precedent isolation** | `is_seed = TRUE` fixtures never appear in precedent queries during live event planning |
| **Gate G8 succession** | Release approval rejected when deputy succession approver is absent |
| **Out-of-scope** | Unknown event type defaults gracefully to FLOOD terminology; no uncaught exception |

---

*Document updated: 2026-09-27 — Corrections: (1) Language support clarified to 23 configured country codes with BCP-47 language code selection (not full translated content delivery); (2) Reconstruction & rebuild capabilities (M1 recovery needs, M8 projects, M9 funding, M12 gap detection) added throughout all sections. | Codebase: FamilyConnect v0.1.0 (SPEC-005/007/008/009/010) | Test status: 128/128 passing*
