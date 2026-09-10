**SPEC-005 — ARCHITECTURE & DEPLOYMENT SPECIFICATION**

**FamilyConnect: Disaster Family Assistance, Reconnection & Coordination Platform**

**Version:** 0.4

**Status:** Implemented Baseline — Synchronized with Active Codebase

**Parent Specifications:** SPEC-001 v0.4, SPEC-002 v0.4, SPEC-003 v0.4, SPEC-004 v0.4

**Date:** 10 September 2026

**Methodology:** Spec-Driven Development

## 1. Purpose and Scope

### SPEC-005 defines the Minimum Viable Product (MVP) architecture and deployment model for FamilyConnect. It establishes the technical blueprint required to enforce the security, privacy, and operational controls defined in SPEC-001 through SPEC-004, ensuring the platform can withstand the degraded telecommunications and high-stress environments characteristic of disaster zones like the 2015 Nepal earthquake.

## 2. Architecture Principles

- **Authoritative-Source Principle:** FamilyConnect is a coordination layer, not the system of record. Police, hospitals, and humanitarian organizations retain their authoritative records.
- **Privacy by Design & Minimum Necessary Disclosure:** Systems must cryptographically restrict access to only the data fields required for a verified purpose.
- **Zero Trust & ABAC:** No user or network is implicitly trusted. Access requires dynamic evaluation of identity, role, and context.
- **Human-in-the-Loop:** AI and automated systems are strictly assistive. They cannot legally close cases, confirm identities, or authorize safeguarding handovers.
- **Offline-First Capability:** Field operations must survive intermittent connectivity, leveraging local queuing and synchronization.
- **Event-Driven Audit:** Every state transition must generate an immutable audit trail.
- **Graceful Degradation:** The system must queue and retry requests when upstream partner agencies are offline.
## 3. MVP Deployment Model

The MVP enforces a single disaster-event deployment with logical tenant isolation to minimize complexity.

Plaintext

FamilyConnect Platform └── Disaster Event: Nepal/Tibet Border      ├── Public Services      ├── Family Services      ├── Agency Services      └── Operations

## 4. Channel Architecture

To deploy rapidly and accommodate users without high-end devices or connectivity, the MVP supports:

- **Responsive Web:** Yes
- **Mobile Browser / PWA:** Yes
- **Agency Portal:** Yes
- **SMS:** Yes (Critical for low-bandwidth notifications)
- **Email:** Yes
- **VHF / Radio:** Operational process mapped to manual digital ingestion
- **Native Mobile App:** No (Deferred to Phase 2)
- **WhatsApp / Voice IVR:** No (Deferred to Phase 2)
## 5. Core MVP Services

The MVP utilizes a modular application architecture with strictly bounded contexts rather than a fragmented microservices sprawl:

- Identity & Access
- Case Management
- Person & Family
- Safety Declaration & Missing Person
- Assistance & Agency Coordination
- Information & Rumour Management
- Notification & Audit
- Search & Matching
- Offline Synchronization
## 6. Identity Architecture

The Identity Provider (IdP) manages three distinct populations, enforcing the escalating Identity Assurance Levels (IAL-0 to IAL-4) established in the security governance baseline:

- **Public:** Anonymous users or basic contact-verified individuals submitting safety declarations or missing reports.
- **Authenticated Family/Proxy:** Relatives tracking authorized cases and receiving notifications.
- **Verified Organisations:** Police, hospitals, embassies, and authorized humanitarian organizations requiring multi-factor, organizationally bound credentials.
## 7. Authorisation Architecture

Role-Based Access Control (RBAC) is insufficient for disaster privacy. The API Gateway and Application Layer must implement Attribute-Based Access Control (ABAC). Access requests evaluate:

**Actor Identity** + **Organization** + **Role** + **Assurance Level** + **Case Relationship** + **Access Purpose** + **Data Classification** + **Geographic Restrictions** + **Active Disputes/Holds**.

Only upon successful evaluation of this matrix does the system grant ALLOW, DENY, or LIMITED DISCLOSURE.

## 8. Data Architecture

The domain is highly relational, requiring strict transactional integrity.

- **Primary Store:** A relational SQL database (e.g., PostgreSQL) serves as the authoritative transactional store for Person, Case, FamilyAuthorisation, SafeguardingHandover, and AuditEvent entities.
- **Search Engine:** A separate, eventually consistent search index is utilized for aliases, approximate matching, physical descriptors, and locations. The search index must never be treated as the authoritative database.
## 9. AI / Matching Architecture

AI services operate behind a strict security boundary. Authoritative Data → Matching Service → PotentialMatch → Human Review → Confirmed/Rejected. The system technologically prohibits AI from confirming identities, declaring deaths, closing missing-person cases, or authorizing family access.

## 10. Event Architecture

The system utilizes an asynchronous event bus/queue (e.g., Kafka or RabbitMQ) utilizing the CloudEvents v1.0 specification. Core events include SafetyDeclarationSubmitted, PotentialMatchDetected, and AuthorisationDisputed. The bus guarantees asynchronous processing, idempotency, and retry capabilities for integrations and notifications.

## 11. Offline Architecture

Offline capability is a first-class requirement for field workers operating in disconnected mountain regions or damaged infrastructure zones. Online → Local Encrypted Queue → Network Failure → Continued Operation → Connectivity Restored → Synchronization → Idempotency Check → Conflict Resolution → Authoritative Update. All state-altering payloads must carry a UUID Idempotency-Key to prevent duplicate record generation upon reconnection.

## 12. Notification Architecture

Notifications execute via an event-driven pipeline: Case Event → Notification Policy → Recipient Eligibility → Data Minimization → Channel Selection (SMS/Email) → Delivery Status. *Crucial Security Rule:* Sensitive medical, forensic, or safeguarding data must not be transmitted in plain text via SMS simply because the recipient is authorized. Notifications must serve as secure prompts (e.g., "An important update is available on your dashboard").

## 13. Security Architecture

The MVP relies on managed cloud security services to accelerate deployment:

- TLS encryption in transit and AES-256 encryption at rest.
- Web Application Firewall (WAF) and DDoS protection at the edge.
- Rate limiting to prevent unauthorized case enumeration.
- MFA enforcement for privileged agency users and system administrators.
- Immutable, append-only storage for the AuditEvent ledger.
## 14. Observability

Telemetry is partitioned into three distinct operational views:

- **Platform Telemetry:** API health, database metrics, queue depth, and infrastructure uptime.
- **Operational Telemetry:** Volume of missing reports, unresolved cases, assistance requests, and pending verifications.
- **Security Telemetry:** Failed logins, unusual access patterns, break-glass emergency disclosures, and rate-limit triggers.
## 15. Deployment Architecture

Plaintext

Internet   │ CDN / WAF   │ API Gateway (Enforcing token validation & idempotency)   │ Application (Modular Bounded Contexts)   │ ├── Relational DB (Primary Case & Identity Data) ├── Search Index (Approximate Matching) ├── Queue/Event Bus (Asynchronous domain events) ├── Object Storage (Photographs, Evidence) ├── Notification Gateway (SMS/Email routing) └── Immutable Audit Store (Append-only logs)

## 16. Resilience Targets

- **Public Service Availability:** 99.9% target
- **Case Data Durability:** Multi-zone replication
- **Recovery Point Objective (RPO):** ≤ 15 minutes
- **Recovery Time Objective (RTO):** ≤ 60 minutes
- **Offline Field Operation:** Mandatory
- **API Idempotency:** Mandatory
- **Backup & Restore:** Automated with mandatory pre-production testing
## 17. Geographic & Data-Residency Model

Data localization is governed by the Controller's legal assessment, not hard-coded defaults. The Deployment Configuration must explicitly define:

- Data Controller
- Processing Location & Backup Location
- Approved Jurisdictions & Cross-Border Transfer Rules
- Approved Agencies
- Data Retention Policies
## 18. Out of Scope for MVP

To ensure rapid deployment, the following are explicitly deferred: Native iOS/Android apps, sophisticated facial recognition, automated forensic identification, blockchain, full hospital/police system integration, automated embassy integration, and multilingual voice IVR.

## 19. MVP Critical Path

### SPEC-004 PASS → SPEC-005 Architecture → Architecture Gate → SPEC-006 UX + Interaction Specification → SPEC-007 Implementation + Test Specification → Build MVP → Security / Privacy Testing → Operational Pilot → Humanitarian Agency Review → Controlled Deployment.

## 20. Architectural Acceptance Test (The Kathmandu Scenario)

The architecture is only deemed successful if it flawlessly executes the following scenario:

*A distressed family member arrives in Kathmandu with only a name, a photograph, and poor connectivity. They have no understanding of Nepal's agencies or whether their relative is in a hospital, shelter, or mortuary.*

FamilyConnect must seamlessly transition this user from "I don't know where to go" to "I have a verified case, I know who is coordinating it, I know what has been confirmed, and I know my exact next physical action," without exposing unrelated families to privacy breaches or overwhelming local authorities with duplicate data entry.

Appendix

You do not need to procure any paid third-party enterprise software licenses to build and deploy the FamilyConnect MVP. Every component specified in SPEC-001 through SPEC-005—including the event bus, relational persistence, search matching, and authentication—can be built entirely on permissive open-source software (MIT, Apache 2.0, PostgreSQL License).

### *Component-by-Component Licensing & Cost Breakdown*


| Architectural Component DOCX | High-End Enterprise (Avoid for MVP) | Zero-License / Open-Source Alternative (Recommended) | Estimated MVP Cost |
| --- | --- | --- | --- |
| Relational Database | Oracle / Microsoft SQL Server | PostgreSQL | $0 (Free/Open Source) |
| Event Architecture | Confluent Cloud / AWS MSK ($150–$300+/mo) | Transactional Outbox Pattern (Postgres) or Redis + BullMQ | $0 (Runs inside DB/VPS) |
| Search & Matching | Elasticsearch Enterprise / Algolia | PostgreSQL (pg_trgm / fuzzystrmatch) or Typesense / Meilisearch | $0 (Free/Open Source) |
| Identity & Access (IdP) | Okta / Auth0 B2B ($100–$500+/mo) | Zitadel, Keycloak, or In-App JWT + WebAuthn/TOTP | $0 (Free/Open Source) |
| Object Storage (Evidence) | AWS S3 with standard egress | Cloudflare R2 (Zero egress fees, 10 GB free) or MinIO | $0 (Within free tier) |
| Edge / WAF / CDN | Cloudflare Enterprise / AWS Shield Advanced | Cloudflare (Free Plan) + Caddy / Nginx (Auto-SSL) | $0 |
| Immutable Audit Store | Amazon QLDB / Private Blockchain | Append-Only PostgreSQL Table with Cryptographic SHA-256 Hash Chaining | $0 (Zero extra tooling) |

### *Where Real Costs Exist (Pay-As-You-Go Usage)*

***The only unavoidable costs are pay-as-you-go utility services:***

- ***SMS Gateway (Unavoidable Telecom Cost):****** SMS delivery is required for low-connectivity regions. ***
- ***Providers:****** AWS SNS, Twilio, or local Nepal providers (e.g., Sparrow SMS).***
- ***Cost:****** ~$0.015 to $0.05 per SMS depending on destination country (budget ~$10–$30 for testing/pilot).***
- ***Transactional Email:***
- ***Providers:****** Resend (3,000 emails/month free), AWS SES ($0.10 per 1,000 emails), or SendGrid (free tier).***
- ***Cost:****** ******$0****** during development.***
- ***AI Assistive Matching (Optional):***
- ***Cloud LLM:****** OpenAI / Anthropic / Google Gemini API (pennies per 1,000 tokens for duplicate detection/summaries). ***
- ***Zero-Cost Alternative:****** Use ******pgvector****** inside PostgreSQL with open-source Hugging Face embedding models (e.g., ******all-MiniLM-L6-v2******) running directly on the server.***
### *Recommended Zero-License MVP Tech Stack*

***Application & API Layer***

- ***Framework:****** Node.js/TypeScript (NestJS or Fastify) or Python (FastAPI).***
- ***Modular Monolith:****** Deploy all bounded contexts (Case Management, Safety Declarations, Assistance, Disputes) in a single service container to avoid microservice orchestration overhead. ***
- ***Authorization (ABAC):****** Implement ABAC logic directly in application middleware using open-source libraries like CASL (TypeScript) or Casbin (Go/Python). ***
***Data & Event Backbone***

- ***PostgreSQL as Universal Workhorse:***
- ***Primary Data:****** Stores canonical entities (******Case******, ******Person******, ******FamilyAuthorisation******, ******SafeguardingHandover******). ***
- ***Search Index:****** Use native ******pg_trgm****** and ******tsvector****** for phonetic, fuzzy, and alias matching. ***
- ***Event Bus:****** Use the ******Transactional Outbox Pattern******. When a case status changes, insert the CloudEvents payload into an ******outbox_events****** table within the exact same database transaction. A lightweight background worker polls the table and executes asynchronous notifications, eliminating the need to procure Kafka or RabbitMQ clusters. ***
***Deployment & Hosting***

- ***Cloud Infrastructure:****** A single Virtual Private Server (VPS) on Hetzner, DigitalOcean, Linode, or AWS Lightsail (4 vCPU, 8 GB RAM, NVMe SSD).***
- ***Orchestration:****** Docker Compose behind a Caddy reverse proxy (which handles automated Let’s Encrypt TLS certificates).***
### *Total Monthly Cost Projection for Development & Pilot*

- ***Hosting / Compute (VPS):****** $20 – $40 / month***
- ***Domain & DNS:****** $10 – $15 / year***
- ***Cloudflare Edge / CDN / DDoS:****** $0 / month (Free tier)***
- ***Email & Object Storage:****** $0 / month (Free tiers)***
- ***SMS Testing Balance:****** $20 (One-time top-up)***
- ***Total Initial Outlay:****** ******~$40 – $60 total***
***You do not need commercial licenses or upfront cloud commitments to build the full SPEC-001 through SPEC-005 capability. Starting with a PostgreSQL-centric modular architecture allows you to scale out to dedicated event brokers (Kafka) or standalone search clusters (OpenSearch) later when institutional deployment funding is granted. ***

---

# 10. Implemented System Architecture & Multi-Agent Infrastructure (v0.4)

The implemented FamilyConnect production platform is built on an ultra-resilient, open-source modular architecture:

### 10.1 Modular Monolith Backend
- **Framework**: Node.js (v18+) with Express 4.
- **Domain Modules**: Structured in strictly decoupled domains (`src/modules/*`):
  - `cases`, `submissions`, `assistance`, `news`, `orchestrator`, `tunnels`, `dna`, `rumours`, `events`, `safeguarding`, `families`, `organisations`, `auth`, `audit`.
- **Database Connection Pooling**: PostgreSQL 16 managed via `pg.Pool` with automatic transaction management.
- **Error Standard**: RFC 9457 `application/problem+json` with humanized empathetic copy.

### 10.2 Autonomous Multi-Agent Disaster Orchestrator
The platform features an autonomous multi-agent disaster coordination system (`src/services/orchestrator/`):
```
  [ Sentinel Agent ] ──► [ Planner Agent ] ──► [ Builder Agent ] ──► [ Deployer Agent ]
  Polls GDACS Feeds      Recommends Modules    Compiles Staging       Enforces 2-Person
  Hazard Detection       Disaster Geometry     Preview Slots          Governance Gate
```
1. **Sentinel Agent**: Ingests disaster alerts from Global Disaster Alert and Coordination System (GDACS).
2. **Planner Agent**: Evaluates coordinates, population density, and hazard type to select relevant portal modules from `portal_module_registry` (`MOD-WATER-LVL`, `MOD-DAMAGE`, `MOD-RELIEF`, `MOD-TUNNEL`, `MOD-DNA`).
3. **Builder Agent**: Compiles HTML/CSS templates into isolated staging preview slots.
4. **Deployer Agent**: Promotes staging slots to production following two-person administrative authorization with Identity Assurance Level 2 (IAL-2).

### 10.3 Autonomous AI News Agent Pipeline
- **Hybrid LLM Pipeline**: Supports both local offline-capable models (Ollama running `llama3` or `mistral`) and cloud AI (Google Gemini 1.5 Flash).
- **Feed Harvesters**: Scrapes official RSS/APIs from disaster response agencies (ASDMA, CWC, NDRF, NDRRMA, NRCS, Police).
- **Dual Crawling Cadence**:
  - Emergency Burst Mode (6h): Active during rapid-onset phases.
  - Routine Monitoring Mode (24h): Active during recovery/monitoring phases.
- **Verification Queue**: Extracted articles enter a human-in-the-loop review queue (`src/modules/news/routes.js`) before reaching the public portal.

### 10.4 Low-Bandwidth Zero-Build Frontend (<50KB Payload)
- **Zero-Build Architecture**: Vanilla HTML5, CSS3 custom properties, and native ES6 JavaScript without Node build steps, Webpack, or large client-side frameworks.
- **Emergency Bandwidth Footprint**: Initial page load is < 50 KB, ensuring instant rendering over degraded 2G/3G cellular data in disaster areas.
- **Runtime Partial Injection**: `header.partial.html` is injected at build and dynamically synchronized at runtime (`frontend/js/app.js`), maintaining consistent disaster event and language context.
- **Client-Side i18n**: Real-time localization dictionary supporting 6 languages (`en`, `ne`, `hi`, `bn`, `as`, `zh`) with zero additional server roundtrips.
- **PWA Offline Resilience**: Service Worker (`frontend/sw.js`) caches emergency guides, safe declarations, and shelters for offline use.

### 10.5 Deployment & Database Provisioning
- **Docker Compose**: Containerized PostgreSQL 16 with automatic volume entrypoint mounts executing all baseline schemas, orchestrator migrations, and multi-event seeds.
- **Automated Seeder (`scripts/seed.js`)**: Single-command provisioning runner executing all migrations and seeding initial disaster data for both Nepal and Assam events.

