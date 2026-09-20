# SPEC-009 — Agentic Platform Engineering, Governance & Continuous Improvement

*disasteraassistance.life | Oxford–Erdős specification-driven artefact | v0.1 | Draft for Human Review*

**Provenance note:** this document was previously discussed under the
working title "Agentic AI Disaster Recovery Operating Model." It is
formalized here as **SPEC-009**, not SPEC-007, because SPEC-007
("Engineering QA, Deployment & Gate Testing") already exists in the
repository as an implemented baseline (v0.4, 4 gates, 38 tests) and
means something different — a testing/release-gate specification, not
a continuous-governance one. This document extends SPEC-007; it does
not replace or renumber it.

**Grounding note:** this document was written against the actual
current repository (`mdc21/familyconnect`, `main` branch), verified
directly rather than taken on trust from a secondary summary — one
claim in an earlier review of this repo cited an unrelated GitHub
project as its source, so every structural claim below was re-checked
against the real files before being relied on. Confirmed directly:

- `src/db/migration-orchestrator.sql` defines exactly five tables —
  `detected_event`, `module_registry`, `event_module_activation`,
  `generated_artifact`, `event_review` — implementing a **Sentinel →
  Planner → Builder → (human) Reviewer** pipeline for disaster-module
  generation. This is real and this document extends it.
- There is **no general change-governance entity** in the schema — no
  `AIProposal` or equivalent. The orchestrator can propose *which
  disaster-response modules to activate*; it has no mechanism for
  proposing *changes to the platform itself* (a new field, a new API,
  a workflow fix) with a human-decision record attached. That is the
  specific gap this document closes.
- SPEC-007 v0.4 is confirmed to be purely a testing/release-gate
  specification (Gates A–D, smoke/news/security/integration tests). It
  has no continuous-improvement loop concept. This document is that
  loop, built on top of SPEC-007's gates rather than duplicating them.

| | |
|---|---|
| Status | DRAFT — proposed for human/partner review |
| Parent artefacts | SPEC-001 v0.4 Product Requirements; SPEC-002 v0.4 Domain/Data; SPEC-003 v0.4 API/Events (+ SPEC-003-DELTA); SPEC-004 v0.4 Security, Privacy, Governance & Safeguards; SPEC-005 v0.4 Architecture & Deployment; SPEC-006 v0.4 UX, Interaction & Interface Constraints; SPEC-007 v0.4 Engineering QA, Deployment & Gate Testing |
| Purpose | Extend the existing Sentinel→Planner→Builder→Reviewer orchestrator into a governed, auditable control plane for changes to the platform itself — not just which disaster modules to activate. |
| Design principle | AI proposes; named humans decide. Every material AI action is traceable to evidence, an agent identity, a policy version, and a human decision record. No agent can grant itself permission, change its own approval threshold, or bypass the risk-tier gate for its own action. |
| Relationship to SPEC-007 | SPEC-007's gates (A–D) are the mandatory floor every AI-authored change must pass before human release approval — this document does not weaken or duplicate them, it routes agent-authored changes through them. |

---

## Gate G0 — Prerequisite (status: claimed, not independently verified)

The repository's own documentation states production-hardening work is
already done: `requireActor(...)` middleware guarding administrative
endpoints, reviewer/deployer identity resolved from "cryptographically
verified tokens," a production startup check that fails closed if
`JWT_SECRET` is unset, real rate limiting, and a database-enforced
audit-immutability trigger. If accurate, this materially changes the
starting position from an earlier review of a different, older local
snapshot of this codebase, which found the opposite — actor identity
resolved entirely from unverified client-supplied headers, with
several critical write endpoints carrying no authorization check at
all.

**This document treats that claim as stated, not confirmed**, and sets
the same style of blocking gate as a result: no agent in §6's minimum
rollout begins operating against production data or production
deployment credentials until an independent review confirms (a) actor
identity in the *current* `main` branch is genuinely unforgeable
end-to-end, not just checked at the login boundary, and (b) the
specific endpoints an agent would call under this document (module
registry writes, artifact generation, deployment approval) carry real
authorization, not just the general claim that "administrative
endpoints" are guarded. Given how much of this document's trust model
depends on human-decision records being unforgeable, this verification
is cheap relative to what it protects and should happen before, not
during, Phase 1 below.

---

## 1. Problem Statement

The platform already does something genuinely hard well: given a
detected disaster event, it can autonomously ingest the alert, decide
which response modules apply, generate the staging artifacts, and hold
for human review before deployment. That is a real, working, narrow
form of agentic operation.

What it cannot yet do is apply that same discipline to *itself*. There
is no mechanism today for an agent — or a human, structured the same
way — to propose "this workflow has a usability problem, here is
evidence, here is a fix, here is the risk, here is who needs to
approve it" and have that proposal tracked from evidence through
decision through deployment through measured outcome. Every
improvement to the platform outside the disaster-module orchestrator
happens off-system, with no structured record of why it was made, who
approved it, or whether it worked.

## 2. Product Outcome

A single, auditable pipeline — extending the existing
Sentinel→Planner→Builder→Reviewer pattern rather than running a
parallel one — through which any proposed platform change, whether
authored by a human or an agent, moves through evidence, risk
classification, the correct human decision authority, execution,
SPEC-007's test gates, deployment, monitoring, and a recorded outcome
that feeds the next cycle. See SPEC-010 for how that recorded outcome
becomes institutional memory rather than a closed ticket.

## 3. Scope

| In scope for this document | Explicitly out of scope |
|---|---|
| The `AIProposal` entity and its full lifecycle (§7) | Disaster-module selection logic itself — already built, unchanged |
| Agent identity and least-privilege credentialing (§5) | New disaster-response *content* modules (that's SPEC-008 territory) |
| The six-tier human-decision-authority model (§8) | Replacing or re-litigating SPEC-007's existing test gates |
| Extending `detected_event`/`module_registry`/etc. with governance fields, not replacing them (§9) | A learning/evaluation graph — that's SPEC-010 |
| Kill switch / agent suspension (§7.4) | |

## 4. Actors

Extends the platform's existing six actor classes (`PUBLIC`, `FAMILY`,
`PARTNER`, `CASE_WORKER`, `AUTHORITY`, `ADMIN`, per the current
README's OWASP section) with agent- and governance-specific roles.
Note this platform's real actor set is narrower than an earlier draft
of this document assumed (which listed nine classes including `PROXY`
and `SYSTEM_AUDITOR`) — this revision aligns to what's actually
implemented.

| Actor | May do | May not do |
|---|---|---|
| AI Agent (any class, §5) | Observe, analyse, draft proposals, execute within its own scoped credential, test in isolated environments, monitor, escalate | Approve its own proposal; change its own risk tier or permissions; act against production without a passed human gate at its tier |
| Human Decision Owner (role varies by tier, §8) | Approve, reject, modify, or defer any proposal at or below their authority tier | Delegate their decision to an agent; approve a tier above their authority without escalation |
| ADMIN / Security Lead | Suspend any agent identity immediately (§7.4); review the agent action ledger | Bypass the tier model for their own changes — an ADMIN's own platform changes go through the same proposal lifecycle as an agent's |
| Governance Board (standing, cross-functional) | Set and change approval thresholds, retention rules, agent permission boundaries (Tier L5, §8) | Operate the platform day-to-day; that remains ADMIN/AUTHORITY's job |

## 5. Agent Identity and Least Privilege

**New entity, `agent_identity`** — every agent operating under this
document has its own row, its own scoped credential, and its own
status. No agent operates under a shared "AI" identity.

| Field | Purpose |
|---|---|
| `agent_id` | Stable identifier |
| `agent_role` | One of the 13 roles in §6 |
| `scoped_permissions` | Explicit allow-list of tables/endpoints this agent may touch |
| `credential_ref` | Reference to the actual credential (not the credential itself) |
| `status` | ACTIVE / SUSPENDED |
| `suspended_by`, `suspended_at` | Populated only via §7.4 |
| `max_proposal_rate` | Per BR-009-011 — this agent's proposal-volume ceiling |

Roles, deliberately consolidated to thirteen rather than a larger
roster, because the real orchestrator today implements something
closer to four stages (Sentinel, Planner, Builder, human Reviewer) —
thirteen is the next realistic step, not a leap to a much larger
number the platform has no operating history to justify:

| Role | Extends | Responsibility |
|---|---|---|
| Observation Agent | (new) | Platform telemetry, user behaviour, external signals |
| Source/Knowledge Agent | The existing AI News Agent | Source ingestion, provenance, freshness scoring |
| Needs Intelligence Agent | (new) | Detects unmet/ageing/duplicated needs from operational data |
| Planning Agent | The existing "Planner" stage | Produces `AIProposal` records (§7) — for module activation *and* platform changes |
| Architecture Agent | (new) | Converts an approved proposal into a spec delta and implementation plan |
| Build Agent | The existing "Builder" stage | Implements approved changes in an isolated environment |
| Test Agent | (new — routes into existing SPEC-007 gates) | Runs Gates A–D against the change before it's eligible for release |
| Security Agent | (new) | Continuous vulnerability/anomaly/agent-abuse detection |
| Release Agent | The existing "Deployer" stage | Promotes approved, tested artifacts with rollback capability |
| Monitoring Agent | (new) | Runtime health, availability, error rate |
| Adoption Agent | (new) | Completion/abandonment/usability signals |
| Learning Agent | (new — feeds SPEC-010) | Determines whether a deployed change produced its expected outcome |
| Governance Agent | (new) | Checks every agent action against policy, role boundary, and approval-tier rules before it executes |

## 6. Minimum Rollout

Not all thirteen roles activate at once. Order matters, and each step
requires the previous one operating with real data, not synthetic
data, before the next begins:

1. Governance Agent + `agent_identity` table + the tier model (§8) —
   this is infrastructure everything else depends on, so it goes
   first, alone.
2. Monitoring, Security, and Adoption agents — read-only observers,
   lowest risk, and they start generating the evidence base everything
   downstream needs.
3. Planning Agent, in recommendation-only mode (Tier L2 minimum on
   anything it proposes — see §8 — it cannot self-execute anything at
   this stage).
4. Architecture, Build, Test agents, in isolated environments only,
   still behind mandatory human gates at every tier.
5. Release Agent, with the mandatory human gate from §8 enforced, not
   optional.
6. Learning Agent, closing the loop into SPEC-010.

## 7. The `AIProposal` Entity

This is the core new entity this document introduces — the thing the
orchestrator currently lacks.

| Field | Requirement |
|---|---|
| `proposal_id` | Unique, immutable |
| `agent_id` | FK to `agent_identity` — never a bare "AI" label |
| `trigger` | What caused this proposal (an observation, an escalation, a scheduled review) |
| `problem_statement` | Evidence-backed description |
| `evidence_refs` | Citations/record IDs — never asserted without a reference |
| `affected_capability` | Which module/endpoint/workflow this touches |
| `proposed_change` | What the agent recommends |
| `alternatives` | At least one, where material |
| `expected_outcome` | Measurable — feeds SPEC-010's evaluation |
| `uncertainty` | Agent's own confidence, stated, not hidden |
| `impact_class` | L0–L5, per §8 — canonical field name, matching SPEC-008's terminology consolidation |
| `risk_assessment` | Security, privacy, safeguarding, operational, social |
| `dependencies` | Systems, organisations, data, approvals required |
| `test_plan` | What Gate(s) from SPEC-007 this must pass |
| `rollback_plan` | Mandatory, not optional, for anything above L0 |
| `human_decision_owner` | Named role per §8, not "a reviewer" |
| `decision` | Pending / Approved / Rejected / Modified |
| `decision_rationale` | Human-written, not agent-generated |
| `execution_refs` | Links into `generated_artifact` — reuses the existing table rather than duplicating it |
| `outcome` | Populated post-deployment by the Learning Agent; feeds SPEC-010 |
| `audit_ref` | FK into the existing `audit_event` table |
| `created_at`, `expires_at` | A proposal that sits unreviewed past `expires_at` auto-escalates (BR-009-012), it doesn't silently expire into nothing |

### 7.1 Relationship to the existing orchestrator tables

`AIProposal` does not replace `detected_event` /
`event_module_activation` / `generated_artifact` / `event_review` —
those remain exactly as they are for the disaster-module-selection use
case they already handle well. `AIProposal` is the general case;
module-activation proposals are one *kind* of `AIProposal`
(`affected_capability = 'module_activation'`), and the existing
`detected_event`-driven pipeline becomes the reference implementation
for how an `AIProposal` moves through the lifecycle, not a separate
system running in parallel.

### 7.2 Proposal-volume governance

**BR-009-011**: every `agent_identity` has a `max_proposal_rate`.
Proposal creation beyond that rate is rejected, not queued. Near-
duplicate proposals (same `affected_capability` + overlapping
`evidence_refs`) are automatically consolidated into one before
reaching a human. This exists specifically because the Human Decision
Owner's attention is a finite, protectable resource — an agent (or an
adversary manipulating one) flooding the queue is a denial-of-service
against governance itself, not a hypothetical.

### 7.3 `AIExecutionRun`

Unchanged in concept from the earlier draft of this idea: an execution
may not begin until its `approval_ref` resolves to an `AIProposal`
with `decision = Approved` (**BR-009-013**, an explicit, enforced
invariant — not an assumption).

### 7.4 Agent suspension (the kill switch, specified)

`POST /api/v1/ai/agents/{agent_id}/suspend` — ADMIN or Security Lead
only. Effective within 60 seconds: the agent's `credential_ref` is
revoked at the source, `agent_identity.status` flips to `SUSPENDED`,
and any `AIExecutionRun` currently attributed to that agent is halted
at its next checkpoint (not mid-transaction — in-flight database writes
complete or roll back cleanly, they don't get torn mid-write). This
action is itself an audited event with no exception.

## 8. Human Decision Authority — Six Tiers

This replaces the four-tier (Low/Medium/High/Critical) model from the
earlier draft of this idea with a more specific six-tier model, because
"Medium risk, needs approval" was doing too much work — a cache refresh
and a new user-facing workflow are not the same decision, and treating
them the same either over-burdens reviewers or under-protects real
risk.

| Tier | Examples | AI may | Human control |
|---|---|---|---|
| **L0** — informational | Documentation correction, internal analytics note | Execute within policy | Post-review only |
| **L1** — low-risk operational | Cache refresh, restart a failed non-critical worker, adjust an already-approved monitoring threshold | Execute within pre-authorised policy | Pre-authorised automation; logged, not gated |
| **L2** — material product change | New user journey, new API field, new module | Prepare and test | Named product/architecture owner approval before production |
| **L3** — humanitarian high-impact | Safeguarding, identity matching, death status, public emergency communication, vulnerable-person prioritisation | Analyse and recommend only | Mandatory named human decision — never automated, no exception |
| **L4** — security/production-critical | Access control, authentication, production data policy, agent permission changes, security containment | Detect and recommend | Security/technical authority required |
| **L5** — governance | Changing approval thresholds, changing authority-of-record, changing retention rules, changing what agents are permitted to do | Nothing autonomously | Governance Board only |

**BR-009-014**: an agent cannot self-assign a tier below what its
`proposed_change`'s `affected_capability` requires. The Governance
Agent (§5) checks this on every proposal before it's visible to a
human reviewer — an agent mislabeling a safeguarding-adjacent change as
L1 to avoid review is exactly the failure mode this check exists to
catch.

## 9. Data Model Additions

Additive only — extends `disaster_event` and the five existing
orchestrator tables; replaces nothing.

| Entity | Key fields | Relationship to existing schema |
|---|---|---|
| `agent_identity` | §5 fields above | New |
| `ai_proposal` | §7 fields above | New; `execution_refs` FKs into existing `generated_artifact` |
| `ai_execution_run` | id, proposal_id (FK), plan, tools, outputs, test_results, deployment_ref, outcome | New; `deployment_ref` FKs into existing `event_review` pattern |
| `escalation` | id, trigger, impact_class (matches §8/SPEC-008 terminology), rationale, assigned_reviewer, sla, decision, resolution | New, general-purpose — the existing `event_review.action` field only captures decisions already made, not open escalations awaiting one |

## 10. API Extensions

Stated at intent level, same caveat as SPEC-008: this requires full
SPEC-003-conformant contract treatment (`Idempotency-Key`, actor
resolution against real `agent_identity` records, RFC 9457 errors —
this codebase already does this well per SPEC-003/SPEC-003-DELTA, this
extension should match that existing discipline, not improvise a new
style) before implementation.

| Endpoint | Actor | Purpose |
|---|---|---|
| `POST /api/v1/ai/proposals` | Specific `agent_identity` | Create a proposal, subject to BR-009-011 rate limiting |
| `POST /api/v1/ai/proposals/{id}/decision` | Named human decision owner per tier | Approve/reject/modify/defer |
| `GET /api/v1/ai/proposals/{id}` | Role-appropriate | Retrieve proposal + full decision trail |
| `POST /api/v1/ai/agents/{id}/suspend` | ADMIN/Security Lead | §7.4 |
| `GET /api/v1/ai/agents/{id}/actions` | ADMIN/AUTHORITY | The agent action ledger — every action this agent has taken, unfiltered |
| `GET /api/v1/ops/ai-runs/{id}` | OPS/AUDITOR | Execution trace for a given `ai_execution_run` |

## 11. Security Requirements

- Each `agent_identity` has its own credential — never a shared "AI"
  service account (this is what makes least-privilege enforceable at
  all; a shared credential makes every permission the union of every
  agent's needs).
- Agent-to-agent tool invocation goes through the Governance Agent's
  policy check; no agent calls another agent's tools directly and
  unmediated.
- Build-stage credentials never have production access; Release-stage
  credentials are the only ones that do, and only within a deployment
  window with an approved `AIProposal` behind it.
- Every agent output (a proposal, a generated artifact, a test result)
  is treated as untrusted input to the next stage until the Governance
  Agent's policy check clears it — this includes treating agent-
  generated text itself as a potential prompt-injection vector if it's
  ever fed back into another agent's context.
- The agent action ledger (`GET .../agents/{id}/actions`) is append-
  only, same enforcement mechanism as `audit_event` (database trigger,
  not application-layer promise).

## 12. Acceptance Criteria / Quality Gates

Extends, rather than duplicates, SPEC-007's Gates A–D — every change
an agent proposes still has to pass those. This document adds:

| Gate | Pass condition |
|---|---|
| **G0** (blocking, see above) | Independent re-verification of the platform's own auth claims |
| G-Agent-1 | Every `agent_identity` has scoped, least-privilege permissions — no agent's `scoped_permissions` is a superset of what its role in §5 needs |
| G-Agent-2 | Tier-mislabeling check (BR-009-014) demonstrated to actually catch a deliberately mislabeled test proposal |
| G-Agent-3 | Kill switch (§7.4) demonstrated end-to-end: suspend an agent mid-execution, confirm the in-flight run halts cleanly and the credential is dead within the stated SLA |
| G-Agent-4 | Proposal-rate limiting (BR-009-011) demonstrated against a simulated flood of near-duplicate proposals from one agent |

## 13. Traceability and Known Unknowns

- G0's underlying claim (real auth already shipped) needs independent
  verification, not just documentation trust — see the Gate G0 section
  above.
- The existing `detected_event` pipeline's `AI_PLANNER` string literal
  (seen in `event_module_activation.activated_by DEFAULT
  'AI_PLANNER'`) should migrate to a real `agent_id` FK once
  `agent_identity` exists, rather than leaving two parallel patterns
  (a string literal and a proper FK) for the same concept.
- This document assumes SPEC-008's `impact_class` terminology
  consolidation; if SPEC-008 isn't adopted as written, this document's
  §7/§8 field naming needs to be reconciled separately.
- Cost governance for running thirteen agent roles (several plausibly
  LLM-backed) is out of scope here and belongs in SPEC-010's monitoring
  model or a dedicated operations addendum — flagged, not solved, by
  this document.
