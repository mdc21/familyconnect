# SPEC-003 — API Contract Delta (v0.2 → v0.3-draft)

**Status:** Proposed, applied in code during Phase 0/1 build
**Parent:** SPEC-003 v0.2 (Revised Baseline — Recommended for Approval)
**Change type:** Additive only — no existing endpoint, event, or state
transition defined in v0.2 is altered or removed.

## Purpose

During implementation, tracing every SPEC-002 MVP entity and SPEC-001
functional requirement through to a concrete endpoint surfaced seven gaps
where the domain model or UX spec assumed an API that v0.2 never
contracted. This delta closes them so the build matches the intent of
SPEC-001/002/004/006 rather than the letter of SPEC-003 v0.2's endpoint
list.

## Additions

| Gap | New surface | Rationale |
|---|---|---|
| #1 | `POST /api/v1/cases/{caseId}/updates`, `GET /api/v1/cases/{caseId}/updates` | Only write path for `InformationUpdate` (SPEC-002 §22). Without it, verified/unverified status (PRP-04, BR-012) has no way to enter the system — SPEC-003 v0.2 only ever read `lastVerifiedUpdate`. |
| #2 | `POST /api/v1/events/{eventId}/rumours`, `GET /api/v1/events/{eventId}/rumours` | v0.2 defined only the *correction* endpoint. Journey 9 step 1 ("report is captured") had no endpoint. |
| #3 | `POST /api/v1/cases/{caseId}/assignments` | `CaseAssignment` is an MVP entity (SPEC-002 §21); FR-006/FR-007 require explicit case ownership/assignment; v0.2 never exposed it. |
| #4 | `POST /api/v1/cases/{id}/actions/confirm-match`, `.../reject-match` | SPEC-002 §38 and SPEC-006 §5 both require a human confirm/reject decision on `PotentialMatchDetected`; v0.2's action-verb list omitted it. |
| #5 | `POST /api/v1/cases/{caseId}/escalations` | `CaseEscalation` is a named MVP entity and appears in the case-status diagram (`ESCALATED`) but had no endpoint. |
| #6 | `GET /api/v1/assistance-centres` | SPEC-006 §3 cites this endpoint by name; v0.2 never defined it. |
| #7 | `ADMIN` actor class added to the Actor Resolution matrix (SPEC-003 §2) | v0.2 used `ADMIN` on the handover endpoint without defining its credentials/context/permitted-surfaces row, and SPEC-001 §5.11 explicitly warns admins must not get blanket sensitive access — this build scopes `ADMIN` to governance/config actions only, never case content. |

## Structural additions (outside the API layer)

- **`GET /api/v1/audit/events`** (AUTHORITY/ADMIN only): SPEC-004 §22 and
  SPEC-007 §2.B mandate append-only audit, and SPEC-007 §3 requires a
  Humanitarian Agency Review gate, but no spec defined how that review
  reads the trail. The SPEC-003 §2 actor matrix only granted
  SYSTEM/AUDITOR *ingestion* (write), not query (read).
- **Governance configuration fields on `DisasterEvent`**
  (`data_controller`, `data_residency`, `legal_basis_registry`,
  `retention_policy`) so SPEC-004 §2's Controller/Processor/DPA workflow
  and §20's configurable retention have a concrete place to live, rather
  than being asserted as "configurable" with no schema.

## Non-changes (explicitly out of scope for this delta)

- No existing request/response schema changed shape.
- No actor's existing permitted surface was narrowed.
- No CloudEvents envelope or Problem Details type from v0.2 §5/§6 changed.

## Disposition

Recommended for fast-track approval alongside SPEC-007's existing
baseline — these are gap fills, not architectural changes, and none
requires re-running the SPEC-004 privacy/governance gate.
