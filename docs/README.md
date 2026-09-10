# FamilyConnect — System Specifications (SPEC-001 to SPEC-007)

This directory contains the foundational specifications that govern the architecture, data models, security controls, API contracts, user experience, and deployment gates for the **FamilyConnect** crisis response platform.

Specifications are available in both **Markdown (`.md`)** for immediate browser reading on GitHub, and original **Word (`.docx`)** formats under [`docs/docx/`](docx/).

---

## Specification Index

| Spec ID | Title | Summary | Markdown | Word Document |
| :--- | :--- | :--- | :--- | :--- |
| **SPEC-001** | **Product Requirements Specification** | High-level humanitarian mission requirements, stakeholder definitions, functional priorities, and multi-disaster operational scope. | [SPEC-001.md](SPEC-001-Product-Requirements.md) | [SPEC-001.docx](docx/SPEC-001-Product-Requirements.docx) |
| **SPEC-002** | **Domain Model & Data Specification** | Canonical entity dictionary (31 core entities), entity-relationship rules, state machine transitions, and data privacy classifications. | [SPEC-002.md](SPEC-002-Domain-Model-and-Data.md) | [SPEC-002.docx](docx/SPEC-002-Domain-Model-and-Data.docx) |
| **SPEC-003** | **API Contract & Event Specification** | REST/JSON endpoint schemas, cryptographic actor resolution, RFC 9457 Problem Details error catalog, mandatory headers, and domain event envelopes. | [SPEC-003.md](SPEC-003-API-Contract-and-Events.md) | [SPEC-003.docx](docx/SPEC-003-API-Contract-and-Events.docx) |
| **SPEC-003-DELTA** | **API Contract Hardening Delta** | Hardening delta addressing concurrency control (`If-Match`/`ETag`), missing endpoints (`IdentityEvidence`, `CarePreference`), and endpoint shielding. | [SPEC-003-DELTA.md](SPEC-003-DELTA.md) | — |
| **SPEC-004** | **Security, Privacy, Governance & Safeguards** | Attribute-Based Access Control (ABAC), Identity Assurance Levels (IAL-0, IAL-1, IAL-2), cryptographic CSPRNG references, and immutable audit trails. | [SPEC-004.md](SPEC-004-Security-Privacy-and-Governance.md) | [SPEC-004.docx](docx/SPEC-004-Security-Privacy-and-Governance.docx) |
| **SPEC-005** | **Architecture & Deployment Specification** | Modular monolith design, low-bandwidth zero-build frontend principles (<50KB), horizontal scalability, and multi-disaster event isolation. | [SPEC-005.md](SPEC-005-Architecture-and-Deployment.md) | [SPEC-005.docx](docx/SPEC-005-Architecture-and-Deployment.docx) |
| **SPEC-006** | **UX, Interaction Models & Interface Constraints** | Trauma-informed design standards, progressive disclosure, 2G/3G network resilience, offline caching, and accessibility guidelines. | [SPEC-006.md](SPEC-006-UX-Interaction-and-Interface-Constraints.md) | [SPEC-006.docx](docx/SPEC-006-UX-Interaction-and-Interface-Constraints.docx) |
| **SPEC-007** | **Engineering QA, Deployment & Gate Testing** | Quality assurance gates, automated test matrices, zero-dependency Node.js test suites, and compliance verification checkpoints. | [SPEC-007.md](SPEC-007-Engineering-QA-and-Gate-Testing.md) | [SPEC-007.docx](docx/SPEC-007-Engineering-QA-and-Gate-Testing.docx) |

---

## Architectural Principles Enforced by Specs

1. **Humanitarian Data Protection**: High sensitivity data (DNA tracking references, safeguarding notes, hospital mortuary logs) are classified according to ICRC Professional Standards and masked by default.
2. **Actor-Based Access Control & Shielding**: The API gateway dynamically resolves actor roles (`PUBLIC`, `FAMILY`, `PARTNER`, `CASE_WORKER`, `AUTHORITY`, `ADMIN`) via cryptographic tokens. Unauthorized discovery is blocked via uniform 404 responses (BR-013 enumeration shielding).
3. **Identity Assurance Levels (IAL)**: Operations requiring high assurance (sensitive forensic identity evidence, module deployment, GDACS feed ingestion) require IAL-2 step-up verification.
4. **Resilient Low-Bandwidth Delivery**: Clean semantic HTML/CSS/JS without heavy bundle bloat ensures pages render reliably in disaster zones under degraded network conditions.
5. **Deterministic Idempotency**: State-mutating citizen submissions require an `Idempotency-Key` header, preventing duplicate case creation during network reconnects.
