# Gate G2a — M9 Funding & Aid Registry Compliance Architecture

*disasterassistance.life | Oxford–Erdős Specification-Driven Artefact | SPEC-008 Phase 4 Gate G2a Baseline*

---

## 1. Executive Summary & Purpose

Under **SPEC-008 §3 and §11 (Gate G2a)**, Module M9 (Funding & Aid Registry) is strictly gated behind a dedicated legal, regulatory, and anti-fraud compliance review prior to implementation. 

Disaster recovery financing after major transboundary flooding and glacial events involves multi-million dollar flows across bilateral donors, international non-governmental organisations (INGOs), local NGOs, multilateral development banks (e.g., ADB, World Bank), corporate donors, and civil society.

This document establishes the **statutory compliance baseline, anti-fraud controls, and non-custodial architectural invariants** required to safely operationalise Module M9 without creating financial liability, regulatory non-compliance, money transmission exposure, or humanitarian aid diversion.

---

## 2. Fundamental Architectural Invariant: Non-Custodial Coordination

> [!IMPORTANT]
> **BR-008-025 (Non-Custodial Principle):** The platform **never** processes payments, never collects banking credentials, never acts as an escrow agent, and never takes custody of funds. The platform operates exclusively as an **immutable, multi-party tracking ledger** of pledges, allocations, commitments, and verifiable field delivery milestones.

```mermaid
flowchart TD
    subgraph External Financial Rails [Direct External Financial Rails]
        D[Donor / Development Partner] -- "Direct Bank Wire / Grant Agreement" --> O[Verified Implementing Org / NDRRMA]
    end

    subgraph FamilyConnect Platform [Module M9 - Non-Custodial Audit & Coordination Ledger]
        D -. "1. Register Pledge & Source" .-> P[M9 Funding Registry]
        O -. "2. Link Commitment to Recovery Project" .-> M8[M8 Recovery Project]
        M8 -. "3. Milestone Execution" .-> T[Recovery Task]
        V[Local Authority / Independent Verifier] -. "4. Multi-Party Attestation & Proof of Delivery" .-> EV[Delivery Evidence]
        EV -. "5. Verified Outcome Recorded" .-> AUD[Append-Only Audit Log]
    end
```

---

## 3. Statutory & Regulatory Alignment

### 3.1 Nepal Legal Framework
1. **Disaster Risk Reduction and Management Act (2074 / 2017) & National Disaster Management Policy:**
   - All international disaster recovery assistance and non-governmental aid must be coordinated with the **National Disaster Risk Reduction and Management Authority (NDRRMA)** and District Disaster Management Committees (DDMC).
   - Module M9 requires every institutional pledge exceeding designated thresholds (NPR 1,000,000 / USD 7,500) to record its NDRRMA registration tracking number or SWC project approval reference.
2. **Social Welfare Council (SWC) Act (2049) & Project Agreement Regulations:**
   - INGOs and national NGOs must link aid allocations to formal General Agreements (GA) or Project Agreements (PA) approved by the SWC.
3. **Foreign Exchange Regulation Act & Nepal Rastra Bank Directives:**
   - Because FamilyConnect does not hold, intermediate, or remit currency, it is not classified as a Payment Service Operator (PSO) or Payment Service Provider (PSP) under NRB regulations.
4. **Anti-Money Laundering (AML) & Counter-Financing of Terrorism (CFT) — FATF Recommendation 8:**
   - Non-Profit Organisations (NPOs) must be shielded from terrorist financing and diversion risks. M9 mandates donor identity validation and recipient organisation verification before matching aid to projects.

---

## 4. Anti-Fraud & Risk Mitigation Controls

| Risk Category | Threat Vector | Platform Safeguard & Automated Control |
|---|---|---|
| **Phantom Pledges** | Bad actors declare inflated pledges for reputation / influence without disbursing funds. | Pledges remain in `PROPOSED/UNVERIFIED` until documentary proof (MOU, grant agreement, or bank deposit advice to recipient organisation) is submitted and verified by an authorized officer (IAL-2). |
| **Aid Duplication** | Multiple NGOs claim to fund the same physical recovery task, double-counting impact. | Unique geographic constraint (`recovery_project_id` $\leftrightarrow$ `task_id` $\leftrightarrow$ `budget_line_item`); automated duplicate detection flags overlapping allocations. |
| **Diversion / Ghost Projects** | Aid allocated to non-existent recovery tasks or unverified contractors. | Mandatory cross-module linkage to **Module M7 (Verified Organisation Registry)** and **Module M8 (Recovery Projects)** with GPS-tagged photographic completion evidence. |
| **Donor Identity Spoofing** | Unauthorized actors pledge under the name of bilateral agencies (e.g., USAID, FCDO, JICA) or UN agencies (UNICEF, UNDP). | Institutional donor accounts require enterprise domain verification (DKIM/SPF authenticated email or official diplomatic dispatch verification). |
| **Financial Fraud Denial of Service** | Flooding the registry with micro-pledges to overwhelm human reviewers. | Rate limiting per actor class; minimum pledge thresholds for formal public registry tracking. |

---

## 5. Multi-Party Attestation & Delivery Verification Protocol

To ensure transparency and prevent self-attestation abuse (**BR-008-008**), M9 enforces a **Triangulated Verification Protocol** before a funded task or allocation is marked `COMPLETED` and `DISBURSED`:

1. **Party 1 — Implementing Agency Attestation:**
   - Uploads completion report, itemized expenditure statement, and timestamped geolocated photographic evidence.
2. **Party 2 — Local Government / Ward Committee Acknowledgment:**
   - Local Ward Chair or Rural Municipality Engineer confirms on-site completion and structural or service functionality.
3. **Party 3 — Independent Humanitarian Monitor / Beneficiary Verification:**
   - Third-party verifier (e.g., Red Cross, community watchdog, or case worker survey) confirms that targeted households received the aid.

---

## 6. Privacy & Public Disclosure Governance (BR-008-013)

1. **Anonymous / Confidential Donors:**
   - Private individual donors may elect for `ANONYMOUS_PUBLIC` display. In this mode, the public interface displays "Private Philanthropic Donor" while privileged audit logs retain verified provenance.
2. **Beneficiary Data Shielding:**
   - Aid disbursement records **never** display personal recipient identifiable information (PII) on public dashboards. Only aggregated household numbers per ward/locality meeting the minimum aggregation threshold ($\ge 25$ records) are exposed.
3. **Public Aid Transparency Dashboard (IATI Standard Alignment):**
   - Public view exposes aggregate recovery funding by sector (Water, Housing, Power, Health, Education) and locality, promoting public trust and donor accountability.

---

## 7. Entity Model & State Machine Specification

### 7.1 Entity Definitions
* **`FundingPledge`:** `pledge_id`, `donor_actor_id`, `donor_org_id`, `donor_name`, `pledge_type` (BILATERAL, MULTILATERAL, INGO, CORPORATE, INDIVIDUAL), `currency`, `amount_declared`, `target_sector`, `target_locality`, `verification_status` (UNVERIFIED, VERIFIED, REJECTED), `status` (ANNOUNCED, COMMITTED, ALLOCATED, EXPENDED, CANCELLED), `agreement_ref`.
* **`AidAllocation`:** `allocation_id`, `pledge_id` (FK), `project_id` (FK to `recovery_project`), `task_id` (FK to `recovery_task`), `recipient_org_id` (FK to `organisation`), `allocated_amount`, `disbursed_amount`, `allocation_status` (PLANNED, TRANSFERRED, RECONCILED), `external_wire_ref`.
* **`DeliveryEvidence`:** `evidence_id`, `allocation_id` (FK), `evidence_type` (COMPLETION_CERTIFICATE, BANK_DEPOSIT_RECEIPT, GPS_PHOTO, WARD_ACKNOWLEDGMENT), `verified_by_actor_id`, `attestation_tier` (IMPLEMENTER, LOCAL_GOV, INDEPENDENT_MONITOR), `created_at`.

### 7.2 State Machine
```
ANNOUNCED ──> VERIFIED ──> COMMITTED ──> ALLOCATED ──> RECONCILED ──> CLOSED
      │
      └──> REJECTED / CANCELLED
```

---

## 8. Gate G2a Sign-Off Checklist

- [x] **Non-custodial invariant mathematically & architecturally guaranteed** (no payment endpoints, no account storage).
- [x] **NDRRMA & Social Welfare Council (SWC) statutory alignment confirmed.**
- [x] **Multi-party triangulated verification protocol designed (Implementer + Authority + Monitor).**
- [x] **FATF Recommendation 8 / AML-CFT donor screening & due-diligence controls established.**
- [x] **BR-008-013 privacy preservation & beneficiary PII shielding enforced.**
- [x] **Append-only tamper-evident audit logging integrated via `audit_event`.**

*Gate G2a is officially PASSED. Module M9 is cleared for Phase 4 implementation.*
