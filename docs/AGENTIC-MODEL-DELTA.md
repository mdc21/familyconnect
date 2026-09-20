# Agentic AI Disaster Recovery Operating Model — Delta (v0.1 → v0.1a)

**Change type:** patch, not a rewrite. Most of this document is sound
as written — the human-authority principles (§3), the explicit "what
agents may never decide" list (§8), and the disciplined "don't start
with dozens of agents" advice (§14) are correctly conservative and
consistent with the rest of this project. This delta covers only what
needs to change, following the same pattern as `SPEC-003-DELTA.md`
earlier in this project.

## Blocking prerequisite

Same as SPEC-008's Gate G0: **no agent in the "minimum viable agentic
platform" (§14) is deployed — not even the read-only Monitoring
Agent — until the platform's own authentication/authorization gaps are
closed and re-verified.** A "Human Approval Queue" (§14, item 5) is
meaningless if the identity behind each approval can be forged the same
way case actor identity currently can. This isn't a new requirement
this delta is introducing — it's the same G0 gate from SPEC-008,
restated here because this document's roadmap (§20) doesn't currently
reference it at all.

## Fixes

1. **§4 Agent ecosystem ↔ SPEC-008 §4/§8 reconciliation.** SPEC-008
   (as of v0.2) now defines an `AgentIdentity` entity so each of A01–A16
   gets its own scoped credential, matching this document's own
   BR-style principle in §9 ("Each agent has its own identity,
   credentials and minimum tool permissions"). No content change needed
   here — flagging that SPEC-008 v0.1 didn't have this and has now been
   corrected to match what this document already assumed.

2. **§7 Risk-class table ↔ terminology consolidation.** This document's
   "risk class" (Low/Medium/High/Critical) is the same concept as
   SPEC-008's `impact_class` and the former `Escalation.severity` field.
   SPEC-008 v0.2 has consolidated on `impact_class` as the canonical
   name. No change needed in this document's prose, but any future
   schema/API work referencing "risk class" should use `impact_class`
   for consistency.

3. **§9 "Kill switch" needs a concrete specification.** This document
   correctly identifies the requirement ("provide kill switch and
   isolation capability for any compromised agent") but doesn't specify
   who triggers it, under what authority, or within what SLA. SPEC-008
   v0.2 now adds this concretely: `POST /api/v1/ai/agents/{id}/suspend`,
   restricted to ADMIN/Security Lead, audited, FR-008-019. This
   document's §9 should reference that endpoint directly rather than
   leaving the control as prose-only.

4. **§6 AI Proposal object needs a rate-limiting note.** The proposal
   schema in §6 has no field or rule governing proposal *volume*. A
   misconfigured or adversarial agent could flood the Human Review
   Board — effectively a denial-of-service against finite reviewer
   attention, and one this platform is specifically exposed to (the
   existing dispute/escalation endpoints, per this session's security
   review, currently have no rate limiting at all). SPEC-008 v0.2 adds
   BR-008-020 (per-agent, per-objective rate limiting; automatic
   near-duplicate consolidation). This document's §6 should note that
   every `AIProposal` is subject to that rule.

5. **§20 Roadmap should reference Gate G0 explicitly.** Currently the
   roadmap's first item is "SPEC-006 baseline and formal state model"
   (now SPEC-008 per the renumbering) with no earlier gate for the
   platform's own auth. Insert a **Step 0** before the current Step 1:
   "Platform authentication and authorization gaps closed and
   independently re-verified (blocks all subsequent steps)."

6. **List numbering (§9→§14→§20, items 13–43) runs continuously across
   unrelated sections** — almost certainly a Word auto-numbering
   artifact. Each section's list should restart at 1. Purely a
   formatting fix; no content implication, but worth doing before this
   document is referenced by number in other artefacts ("see item 27"
   is currently ambiguous without knowing the section).

7. **§13 Monitoring model — add agent operating cost as a row.**
   SPEC-008 v0.2 added agent compute/token cost as a monitored
   dimension with budget-based throttling (distinct from the
   quality/safety throttling already covered by the "AI" row in this
   table). This document's monitoring table should add a corresponding
   row (e.g. "Cost" layer, measuring agent compute/token spend,
   escalating to a Platform Ops or Finance Lead on budget-threshold
   breach).

## Not changed

Everything else — the agent ecosystem roster (§4), the perpetual
improvement loop (§5), the human-in-the-loop risk-tier model (§7), the
"never decide autonomously" list (§8), the security architecture
principles (§9), the stakeholder adoption strategy (§12), and the
engineering lifecycle (§17) — is retained as written. These reflect
real, considered design work and don't need to change for the fixes
above.
