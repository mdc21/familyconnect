# ADR-001 — RecoveryNeed vs `family_need`/`assistance_request` Reconciliation

**Status:** ACCEPTED  
**Date:** 2026-09-20  
**Decided by:** Platform owner  
**Implements:** SPEC-008 v0.2 §8 reconciliation gate; SPEC-008 DELTA v0.3 Fix #3

---

## Context: The Two-Phase Disaster Model

A disaster event has two fundamentally different operational phases:

| Phase | When | Goal | Primary actors |
|---|---|---|---|
| **Response** | Disaster has just struck | Save lives, extract people from danger, establish immediate safety | Emergency services, rescue teams, Red Cross/RC, military, affected families |
| **Recovery** | Emergency phase passed | Rebuild lives and communities: housing, livelihoods, documentation, essential services | Humanitarian orgs, government, NGOs, affected families as active participants |

### The Conflict

SPEC-008 introduced `RecoveryNeed` (recovery phase) while the platform already had `family_need` + `assistance_request` (response phase). SPEC-008 §8 flagged this as a mandatory reconciliation gate before Phase 1 build.

---

## Decision: Option B — Parallel flows, explicitly related at the phase boundary

- `family_need` + `assistance_request` = **Response phase** intake  
  Triggered by `POST /cases/:caseId/assistance` — linked to a specific `case_record`

- `recovery_need` = **Recovery phase** intake  
  Triggered by `POST /submissions/recovery-needs` — linked to a disaster `event_id`

- **Bridge**: `recovery_need.originating_request_id` (nullable soft FK) links a recovery need back to the response-phase assistance request that preceded it.

## Consequences

- Clean domain boundary — no data migration risk
- BR-008-013 aggregation threshold applies only to `recovery_need`
- Future M2 (Family Recovery Journey) joins across both tables via `originating_request_id`
- Case workers need clear guidance: response flow = emergency still active; recovery flow = rebuilding phase

## Implementation Status

✅ Already implemented — `recovery_need.originating_request_id` exists in the schema.  
This ADR documents and formalises the decision. No schema change required.
