# SPEC-007 — ENGINEERING QA, DEPLOYMENT & GATE TESTING
**FamilyConnect: Disaster Family Assistance, Reconnection & Coordination Platform**
- **Version:** 0.4
- **Status:** Implemented Baseline — Synchronized with Active Codebase
- **Parent Specifications:** SPEC-001 v0.4, SPEC-002 v0.4, SPEC-003 v0.4, SPEC-004 v0.4, SPEC-005 v0.4, SPEC-006 v0.4
- **Date:** 10 September 2026

This specification establishes the engineering, quality assurance, automated test harnesses, and deployment testing gates certifying FamilyConnect for live disaster operations. It ensures architectural resilience and privacy controls perform under degraded conditions.

### 1. Implementation Methodology

- **Modular Monolith:** Deploy bounded contexts (Identity, Case Management, Offline Sync, Autonomous Orchestrator, AI News Agent) within a single scalable application boundary to minimize network overhead and orchestration complexity.
- **Database First:** Utilize PostgreSQL 16 for relational state management, pg_trgm for approximate matching, and database engine triggers for audit immutability.
- **Zero-Dependency Native Testing:** Test runner utilizes Node.js native test harness (`node --test`), eliminating third-party testing dependency vulnerabilities and bloat.

### 2. Testing Gates & Quality Assurance

The platform enforces four mandatory testing gates prior to production promotion:

#### Gate A: Core Smoke & Contract Suite (`test/smoke.test.js` — 21 Tests)
- **Idempotency Validation**: Automated verification of `Idempotency-Key` headers preventing duplicate safety submissions or missing person cases during mobile reconnection.
- **RFC 9457 Problem Details Contracts**: Verifies that 400, 404, 409, 412, and 429 errors strictly conform to `application/problem+json` schemas.
- **Endpoint Shielding (BR-013)**: Proves unpermitted actor classes (`PUBLIC`, `FAMILY`) probing sensitive endpoints receive uniform 404 responses rather than leaking topology.
- **Rate Limiting Protection**: Validates token-bucket rate limiters return 429 with `Retry-After` upon exceeding burst thresholds.

#### Gate B: Autonomous AI News Ingestion (`test/news.test.js` — 9 Tests)
- **Crawler Execution**: Verifies authorized triggering of automated news harvester cycles.
- **Verification Hub Lifecycle**: Tests pending news items entering coordinator queue and publishing only upon authoritative human verification.
- **Schedule Mode Switching**: Verifies dynamic cadence shifts between 6-hour emergency burst mode and 24-hour routine monitoring mode.

#### Gate C: OWASP Top 10 Security Controls (`test/security.test.js` — 8 Tests)
- **Identity Assurance Level 2 (IAL-2) Gates**: Validates that high-risk administrative operations (GDACS scan, module deployment) reject callers lacking IAL-2.
- **Database Audit Immutability**: Proves engine-level trigger on `audit_event` aborts any `UPDATE` or `DELETE` attempt.
- **Cryptographic CSPRNG Generation**: Tests that forensic DNA kit references conform to unguessable CSPRNG hex patterns (`DNA-XXXXXX`).
- **Brute Force & Account Enumeration Logging**: Confirms failed login attempts against unknown accounts record normalized security audit events.

#### Gate D: Integration & Live Database Harness (`test/integration/`)
- Live database schema initialization, module registry validation, and cross-event isolation verification.

---

### 3. Pre-Seeded Responder Personas & Test Credentials

For evaluation and automated integration testing, the following test personas are pre-seeded:

| Persona | Role | Email | Password | Scope & Operational Context |
| :--- | :--- | :--- | :--- | :--- |
| **ASDMA Authority** | `AUTHORITY` | `coordinator@asdma.assam.gov.in` | `Coord@2026!` | Assam State Disaster Management Authority |
| **Indian Red Cross** | `CASE_WORKER` | `caseworker@redcross.org.in` | `Coord@2026!` | Assam Branch Family Tracing Caseworker |
| **NDRRMA Authority** | `AUTHORITY` | `coordinator@ndrrma.gov.np` | `Coord@2026!` | Nepal National Disaster Management Authority |
| **Nepal Red Cross** | `CASE_WORKER` | `caseworker@nrcs.org` | `Coord@2026!` | NRCS Family Links Caseworker |
| **System Admin** | `ADMIN` | `admin@familyconnect.org` | `Coord@2026!` | Full Platform Governance & Audit Oversight |

---

### 4. Test Execution Commands

```bash
# Execute entire test suite (38 passing tests)
npm test

# Execute integration gates against live database
npm run test:integration
```

### 5. Certification Status

**SPEC-007 STATUS:** Certified & Baselined (v0.4). All 38 automated test suites pass synchronously against the active codebase.

