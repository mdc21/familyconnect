# FamilyConnect — System Specifications (SPEC-001 to SPEC-007)

This directory contains the authoritative system specifications governing the architecture, data models, security controls, API contracts, user experience, and deployment gates for the **FamilyConnect** crisis response platform.

> [!NOTE]
> All specifications have been synchronized with the live production platform (**Version 0.4 Implemented Baseline**), reflecting multi-disaster operational support (Nepal GLOF & Assam Floods), the Autonomous AI News Agent, Agentic Disaster Orchestrator, OWASP Top 10 security controls, and 6-language localization.
> 
> - **Live Authoritative Specs (`.md`)**: Formatted in GitHub Flavored Markdown with complete section hierarchies, schemas, and tables for browser viewing.
> - **Historical Inception Archive (`.docx`)**: Original planning documents archived under [`docs/docx/`](docx/).

---

## Specification Index (Version 0.4 Baseline)

| Spec ID | Title | Summary & Production Scope | Markdown Spec | Historical Word Document |
| :--- | :--- | :--- | :--- | :--- |
| **SPEC-001** | **Product Requirements Specification** | High-level humanitarian mission requirements, multi-disaster operational scope (Nepal GLOF & Assam Floods), 6-language i18n, assistance requests, and specialized relief modules. | [SPEC-001.md](SPEC-001-Product-Requirements.md) | [SPEC-001.docx](docx/SPEC-001-Product-Requirements.docx) |
| **SPEC-002** | **Domain Model & Data Specification** | Canonical entity model expanded to 37+ production tables: multi-disaster isolation (`disaster_event`), CWC river gauges, SDRF relief schedules, damage reports, tunnel rescue shafts, and news ingestion. | [SPEC-002.md](SPEC-002-Domain-Model-and-Data.md) | [SPEC-002.docx](docx/SPEC-002-Domain-Model-and-Data.docx) |
| **SPEC-003** | **API Contract & Event Specification** | REST/JSON endpoints, RFC 9457 Problem Details error catalog, mandatory headers (`Idempotency-Key`, `X-Disaster-Event-ID`), AI news queues, orchestrator deployment routes, and CloudEvents payloads. | [SPEC-003.md](SPEC-003-API-Contract-and-Events.md) | [SPEC-003.docx](docx/SPEC-003-API-Contract-and-Events.docx) |
| **SPEC-003-DELTA** | **API Contract Hardening Delta** | Hardening delta addressing concurrency control (`If-Match`/`ETag`), missing endpoints (`IdentityEvidence`, `CarePreference`), and BR-013 endpoint shielding. | [SPEC-003-DELTA.md](SPEC-003-DELTA.md) | — |
| **SPEC-004** | **Security, Privacy, Governance & Safeguards** | OWASP Top 10 security architecture: ABAC actor resolution, BR-013 enumeration shielding (404), IAL-2 step-up gates, CSPRNG tracking references, rate limiting, and database-engine immutable audit triggers. | [SPEC-004.md](SPEC-004-Security-Privacy-and-Governance.md) | [SPEC-004.docx](docx/SPEC-004-Security-Privacy-and-Governance.docx) |
| **SPEC-005** | **Architecture & Deployment Specification** | Node.js modular monolith backend, PostgreSQL 16 pool, Autonomous Disaster Orchestrator (Sentinel, Planner, Builder, Deployer), AI News crawler (Ollama/Gemini), and low-bandwidth (<50KB) zero-build frontend. | [SPEC-005.md](SPEC-005-Architecture-and-Deployment.md) | [SPEC-005.docx](docx/SPEC-005-Architecture-and-Deployment.docx) |
| **SPEC-006** | **UX, Interaction Models & Interface Constraints** | Trauma-informed design, dynamic event switcher (`frontend/header.partial.html`), 6-language client-side i18n, CWC river gauge monitors, boat assistance requests, damage self-reporting, and RFC 9457 error humanizer. | [SPEC-006.md](SPEC-006-UX-Interaction-and-Interface-Constraints.md) | [SPEC-006.docx](docx/SPEC-006-UX-Interaction-and-Interface-Constraints.docx) |
| **SPEC-007** | **Engineering QA, Deployment & Gate Testing** | Quality assurance gates, zero-dependency native Node.js test harness (`node --test`), 38 automated test suites, pre-seeded responder personas (ASDMA, NRCS, Red Cross), and gate certifications. | [SPEC-007.md](SPEC-007-Engineering-QA-and-Gate-Testing.md) | [SPEC-007.docx](docx/SPEC-007-Engineering-QA-and-Gate-Testing.docx) |

---

## Cloud Deployment Guides

- **[Azure Container Apps Pilot Guide](azure-container-apps-deployment-guide.md)**: Ultra-low-cost ($0–$3/mo) cloud deployment guide using Azure Container Apps (Consumption plan) and free serverless PostgreSQL (Neon.tech / Supabase).

---

## Architectural Principles Enforced by Specs

1. **Humanitarian Data Protection**: High sensitivity data (DNA tracking references, safeguarding notes, hospital mortuary logs) are classified according to ICRC Professional Standards and masked by default.
2. **Actor-Based Access Control & Shielding**: The API gateway dynamically resolves actor roles (`PUBLIC`, `FAMILY`, `PARTNER`, `CASE_WORKER`, `AUTHORITY`, `ADMIN`) via cryptographic tokens. Unauthorized discovery is blocked via uniform 404 responses (BR-013 enumeration shielding).
3. **Identity Assurance Levels (IAL)**: Operations requiring high assurance (sensitive forensic identity evidence, module deployment, GDACS feed ingestion) require IAL-2 step-up verification.
4. **Resilient Low-Bandwidth Delivery**: Clean semantic HTML/CSS/JS without heavy bundle bloat (<50KB) ensures emergency pages render reliably in disaster zones under degraded 2G/3G conditions.
5. **Deterministic Idempotency**: State-mutating citizen submissions require an `Idempotency-Key` header, preventing duplicate case creation during mobile network reconnects.
6. **Immutable Audit Engine**: Every state mutation records an audit entry in `audit_event`, where engine-level PostgreSQL triggers physically abort any attempt to `UPDATE` or `DELETE` records.
