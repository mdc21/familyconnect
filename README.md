# FamilyConnect — Crisis Response, Tracing & Humanitarian Intelligence Platform

[![Node.js Tests](https://img.shields.io/badge/tests-38%20passing-brightgreen.svg)](#running-tests)
[![OWASP Top 10](https://img.shields.io/badge/security-OWASP%20Hardened-blue.svg)](#security-architecture--owasp-top-10)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](LICENSE)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL%2016-336791.svg)](#database-architecture)
[![Low Bandwidth Optimized](https://img.shields.io/badge/frontend-Zero--Build%20Vanilla%20JS-orange.svg)](#low-bandwidth-frontend-design)

**FamilyConnect** is a humanitarian crisis response platform designed to trace missing persons, verify ground-truth intelligence, distribute emergency relief, and coordinate multi-agency operations during sudden-onset disasters.

Engineered under strict humanitarian data protection principles (SPEC-001 through SPEC-007), FamilyConnect functions as a resilient, low-bandwidth modular monolith that connects affected families, local authorities, first responders, and relief agencies.

---

## 🌍 Active Disaster Operations

FamilyConnect supports concurrent, strictly isolated multi-disaster event operations:

1. **Nepal–Tibet Border Glacial Outburst Flood (`EVENT-NP-TIBET-2026`)**
   - High-altitude flash flood, landslips, and mudslides across the Bhotekoshi and Trishuli river valleys.
   - Deep-shaft hydropower tunnel rescue monitoring (Upper Trishuli 3A and Rasuwagadhi).
   - Forensic DNA sample tracking, hospital matching, and cross-border consular repatriation desks.
   - Responders: NDRRMA, Nepal Red Cross Society, Nepali Army, APF.

2. **Assam Brahmaputra Basin Flooding (`EVENT-IN-FL-2026-1187`)**
   - Widespread monsoon inundation across 15 districts (Barpeta, Dhubri, Goalpara, Morigaon, Dhemaji).
   - Real-time Central Water Commission (CWC) river gauge monitoring and IWT ferry advisories.
   - Multi-agency relief camps, char (river island) air-drops, and SDRF ration scales.
   - Community flood damage assessment portal for residential, embankment, and agricultural loss.
   - Responders: ASDMA, NDRF 1st Battalion Guwahati, SDRF Assam, Indian Red Cross (Assam Branch).

---

## ⚡ Key Capabilities

### 1. Citizen & Family Journeys
- **"I'm Safe" Check-In**: Instant personal safety declaration requiring no account creation.
- **Report Missing Person**: Guided intake collecting physical descriptors, last known GPS coordinates, and contact details with cryptographic idempotency (`Idempotency-Key`) preventing double-submission over flaky mobile data.
- **Self-Service Case Tracking**: Public lookups via case reference (e.g. `FC-IN-2026-10492`) without exposing sensitive internal forensic notes.
- **Assistance Requests**: Urgent requests for evacuation boats, food rations, clean water, and medical care with live status notifications.
- **DNA Reference Sample Requests**: Relatives can apply for reference DNA buccal swab kits to assist forensic matching of unidentified remains before burial.

### 2. Verified Disaster Intelligence & Misinformation Shield
- **Autonomous AI News Agent**: Scheduled crawler ingesting credible crisis reports from government disaster agencies, police bureaus, and relief organizations every 6 or 24 hours.
- **Coordinator Verification Queue**: Human-in-the-loop review workflow allowing caseworkers and authorities to verify, edit, or reject news before broadcast.
- **Rumour Debunking**: Real-time rumor reporting and official fact-checking statements to dispel hazardous misinformation (e.g. false dam collapse claims).

### 3. Relief Operations & Damage Assessment
- **Hydrological Telemetry**: Live water level tracking against Danger Levels across major river stations.
- **Relief Distribution Schedules**: Verified operating hours, ration entitlement standards, and air-drop coordinates.
- **Damage Assessment**: Self-reporting tool for villagers and local leaders to document structural, road, and agricultural damage for Revenue Circle Officers.
- **Shelter & Water Point Directory**: Geocoded directory of operational relief camps and potable water taps with accessibility indicators.

### 4. Agentic AI Disaster Orchestrator
- **Autonomous GDACS Ingestion**: Scans Global Disaster Alert and Coordination System feeds.
- **Autonomous Module Planner**: Evaluates disaster geometry, terrain, and affected population to recommend relevant portal modules (`MOD-WATER-LVL`, `MOD-TUNNEL`, `MOD-DNA`, `MOD-RELIEF`, `MOD-DAMAGE`).
- **Portal Generator & Staging Preview**: Automatically generates localized portal views, routes, and navigation.
- **Governance Gate**: Enforces two-person review and IAL-2 step-up verification before one-click deployment.

---

## 🏗️ Architecture & Technology Stack

```
                                  [ Edge / WAF / CDN ]
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
          [ Public Humanitarian Web ]                   [ Coordinator Console ]
          Zero-Build Vanilla HTML/CSS/JS                Role-Gated Ops & Tracing
          Offline-Resilient / Multilingual              Audit Log / Source Queue
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           │
                                 [ Express REST API ]
                                   Modular Monolith
                       ┌───────────────────┼───────────────────┐
                       ▼                   ▼                   ▼
                 [ Core Tracing ]     [ News Agent ]    [ Orchestrator ]
                 ABAC & IAL Gates     AI Ingestion      Module Generator
                 RFC 9457 Errors      Ollama / Gemini   Staging Preview
                       │                   │                   │
                       └───────────────────┼───────────────────┘
                                           ▼
                                 [ PostgreSQL 16 DB ]
                             - 31 Core Entities (SPEC-002)
                             - pg_trgm Fuzzy Matching
                             - Immutable Audit Trigger (SPEC-007)
```

- **Backend**: Node.js (CommonJS), Express 4, PostgreSQL 16 (`pg` pool).
- **Frontend**: Zero-build Vanilla HTML5, CSS3, and ES6 JavaScript. Kept deliberately lightweight (< 50 KB initial payload) so all emergency pages load instantly over degraded 2G/3G networks in disaster zones.
- **Error Standard**: RFC 9457 `application/problem+json` with humanized empathetic copy.
- **Internationalization (i18n)**: Native client-side translation across 6 languages:
  - English (`en`)
  - Nepali (`ne`)
  - Hindi (`hi`)
  - Bengali (`bn`)
  - Assamese (`as`)
  - Tibetan / Mandarin (`zh`)

---

## 🛡️ Security Architecture & OWASP Top 10

The platform is hardened against OWASP Top 10 vulnerabilities:

1. **Broken Access Control (A01:2021)**:
   - Six discrete actor classes: `PUBLIC`, `FAMILY`, `PARTNER`, `CASE_WORKER`, `AUTHORITY`, and `ADMIN`.
   - `requireActor(...)` middleware guards all administrative, verification, and deployment endpoints.
   - Endpoint shielding (BR-013 enumeration protection): unauthorized callers receive uniform 404 responses instead of leaking system topology.
   - Reviewer and deployer identities are resolved from cryptographically verified tokens (`req.actor.actorId`).
2. **Cryptographic Failures (A02:2021)**:
   - DNA tracking references generated via CSPRNG (`crypto.randomBytes(3).toString('hex')`).
   - Production startup check fails immediately if `JWT_SECRET` is unset or left on development default.
3. **Insecure Design & Concurrency (A04:2021)**:
   - Idempotency validation (`Idempotency-Key`): atomic insert-or-replay pattern prevents race conditions during mobile network reconnects.
   - Concurrency control: `ETag` and `If-Match` headers protect against lost updates.
4. **Security Logging & Monitoring (A09:2021)**:
   - Database-level trigger on `audit_event` rejects any `UPDATE` or `DELETE` statement at the engine level.
   - Failed authentication attempts against nonexistent accounts are recorded with normalized email and client IP.
5. **Rate Limiting (A05:2021)**:
   - Token-bucket rate limiting (`express-rate-limit`) applies tighter bounds on mutations (20 req/min) than public reads (120 req/min).

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18.x, v20.x, or v22.x)
- Docker & Docker Compose (or local PostgreSQL 16)

### Option A: Running with Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/familyconnect.git
   cd familyconnect
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Start PostgreSQL with all schemas and seeds**:
   ```bash
   docker compose up -d
   ```

4. **Install dependencies and start server**:
   ```bash
   npm install
   npm start
   ```

5. **Open FamilyConnect**:
   - Public Portal: `http://localhost:3000`
   - Assam Flood Event: `http://localhost:3000?event=EVENT-IN-FL-2026-1187`
   - Coordinator Console: `http://localhost:3000/console.html`

---

### Option B: Local PostgreSQL Setup

1. **Create local database**:
   ```bash
   createdb familyconnect
   ```

2. **Seed all schemas and initial disaster events**:
   ```bash
   npm run db:seed
   ```

3. **Start the application**:
   ```bash
   DATABASE_URL=postgres://localhost:5432/familyconnect npm start
   ```

---

## 🧪 Running Tests

The test suite runs with zero third-party testing dependencies using Node's native test runner (`node --test`).

```bash
# Run unit, integration, news crawler, and OWASP security tests (38 tests)
npm test

# Run SPEC-007 integration gate tests against a live PostgreSQL instance
npm run test:integration
```

### Verified Test Suite
- `test/smoke.test.js`: Core journeys, idempotent submissions, and RFC 9457 error contracts.
- `test/news.test.js`: AI news collector, schedule phase switches (6h vs 24h), and verification queue.
- `test/security.test.js`: OWASP Top 10 access control, IAL-2 step-up gates, audit immutability, CSPRNG validation, and brute force audit logging.

---

## 🔐 Coordinator & Responder Credentials (Test Environment)

For local evaluation and testing, the following responder personas are pre-seeded:

| Role | Email | Password | Persona & Scope |
| :--- | :--- | :--- | :--- |
| **ASDMA Authority** | `coordinator@asdma.assam.gov.in` | `Coord@2026!` | Assam State Disaster Management Authority |
| **Indian Red Cross** | `caseworker@redcross.org.in` | `Coord@2026!` | Assam State Branch Caseworker |
| **NDRRMA Authority** | `coordinator@ndrrma.gov.np` | `Coord@2026!` | Nepal National Disaster Authority |
| **Nepal Red Cross** | `caseworker@nrcs.org` | `Coord@2026!` | NRCS Family Tracing Caseworker |
| **System Admin** | `admin@familyconnect.org` | `Coord@2026!` | Platform Oversight & Audit Trail |

*Tip: You can use the 1-Click Persona buttons on the [Coordinator Sign-In](http://localhost:3000/console.html) page to authenticate instantly.*

---

## 📂 Repository Structure

```
familyconnect/
├── frontend/                   # Client-side static application (<50KB payload)
│   ├── css/styles.css          # Design system & responsive layout
│   ├── js/
│   │   ├── api.js              # Shared API client & RFC 9457 error humaniser
│   │   └── app.js              # Header injection, i18n, and event switcher
│   ├── index.html              # Disaster portal homepage
│   ├── safe.html               # "I'm Safe" check-in
│   ├── missing.html            # Report missing person intake
│   ├── track.html              # Self-service case tracking
│   ├── assistance.html         # Assistance request submission
│   ├── water-levels.html       # Real-time CWC hydrological gauges
│   ├── relief.html             # Relief distribution & ration schedules
│   ├── report-damage.html      # Community flood damage assessment
│   ├── tunnels.html            # Hydropower tunnel rescue tracking
│   ├── dna-request.html        # Reference DNA sample kit application
│   ├── information.html        # Verified public situation updates
│   ├── partner-updates.html    # Agency & responder bulletin feed
│   └── console.html            # Coordinator verification & operations hub
├── src/
│   ├── app.js                  # Express application root & middleware setup
│   ├── db/
│   │   ├── index.js            # PostgreSQL connection pool & audit writer
│   │   ├── schema.sql          # 31 MVP entities & immutable triggers
│   │   ├── migration-orchestrator.sql  # Autonomous orchestrator schema
│   │   ├── seed-modules.sql    # Dynamic module registry
│   │   ├── seed.sql            # Nepal-Tibet initial seed data
│   │   └── seed_assam.sql      # Assam Brahmaputra initial seed data
│   ├── middleware/             # Actor, assurance (IAL), rate-limiting, RFC 9457
│   ├── modules/                # Domain routers (cases, news, tumours, tunnels, etc.)
│   └── services/               # News AI agent, notifications, LLM integrations
├── scripts/
│   └── seed.js                 # Automated full database provisioning script
├── test/                       # 38 automated test suites
├── docker-compose.yml          # PostgreSQL 16 container with automatic seeding
├── .env.example                # Safe environment configuration template
├── .gitignore                  # Security-hardened git ignore patterns
└── README.md                   # Platform documentation
```

---

## 📜 License & Compliance

Licensed under the **Apache License, Version 2.0**.

FamilyConnect is built to comply with international humanitarian data protection standards (ICRC Professional Standards for Protection Work, UN OCHA Information Security Principles, and GDPR / Digital Personal Data Protection guidelines).
