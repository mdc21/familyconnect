# SPEC-010 — Humanitarian Intelligence, Evaluation & Continuous Learning

*disasteraassistance.life | Oxford–Erdős specification-driven artefact | v0.1 | Draft for Human Review*

| | |
|---|---|
| Status | DRAFT — proposed for human/partner review |
| Parent artefacts | SPEC-001–007 (implemented baseline, v0.4); SPEC-008 Community Recovery & Reconstruction; SPEC-009 Agentic Platform Engineering, Governance & Continuous Improvement |
| Purpose | Answer the question SPEC-009's monitoring doesn't: did an approved, deployed change actually improve the humanitarian outcome — not just "did it ship without errors." |
| Design principle | Monitoring is not learning. A change can pass every SPEC-007 test and every SPEC-009 governance gate and still not help anyone. This document is the mechanism that finds out, and turns the finding into evidence the next proposal can use. |
| Relationship to SPEC-009 | SPEC-009's `AIProposal.outcome` field is populated *by* this document's Learning Agent and Evaluation process — SPEC-009 defines the slot, SPEC-010 defines what fills it and how. |

---

## 1. Problem Statement

SPEC-009 gives the platform a governed way to propose, decide, build,
test, and deploy a change. What it doesn't give the platform is a way
to know, afterward, whether that change was actually a good idea. Today
— and this remains true even once SPEC-009 ships — a deployed change
is evaluated by whether it broke anything (SPEC-007's gates) and
whether a human approved it (SPEC-009's tiers). Neither of those checks
whether it helped an affected family, reduced time-to-assistance, or
made a real dent in an unmet need. Those are different questions, and
without a system that asks them, every future proposal is guessing
from the same starting position the previous one guessed from.

## 2. Product Outcome

A closed loop — observation through evidence through proposal through
decision through deployment through **measured outcome** through
**evaluation** through **institutional memory** — so that a future
disaster response (a different flood, a different region, a different
year) can draw on what was actually learned from this one, rather than
starting from zero or, worse, repeating a mistake nobody recorded as a
mistake.

## 3. Scope

| In scope | Out of scope |
|---|---|
| The learning graph (§5) and its entities | Re-implementing SPEC-009's proposal/decision/execution mechanics — this document consumes them |
| Outcome measurement per proposal (§6) | Platform/security/availability monitoring — already SPEC-005/SPEC-009's job; this document only cares about *humanitarian* outcome, not uptime |
| The evaluation baseline (human performance without AI assistance, §7) | Individual agent performance review (that's an operational, not specification, concern) |
| Institutional memory / precedent retrieval for future events (§8) | |

## 4. Actors

| Actor | May do | May not do |
|---|---|---|
| Learning Agent | Measure deployed-change outcomes against `expected_outcome`, record findings, surface precedent to future Planning Agent proposals | Decide that a finding justifies an action — findings feed proposals, they don't become changes on their own |
| Impact/Evaluation Lead (human) | Review Learning Agent findings, approve what enters the institutional-memory precedent set, flag findings that don't meet evidentiary bar | Suppress an inconvenient finding without recording why — that suppression is itself logged |
| Humanitarian/Recovery Lead | Set the humanitarian-outcome metrics that matter for a given event (§6) — these are domain judgment calls, not something an agent should default | |

## 5. The Learning Graph

```
Observation → Problem → Evidence → Proposal → Decision → Change →
Deployment → Outcome → Evaluation → Learning → (feeds) Future Proposal
```

The first six stages already exist once SPEC-009 ships
(`AIProposal`'s own lifecycle covers Observation through Deployment).
This document defines the last three — **Outcome, Evaluation,
Learning** — and the entity that carries them.

### 5.1 New entity: `outcome_record`

| Field | Purpose |
|---|---|
| `outcome_id` | Unique |
| `proposal_id` | FK to SPEC-009's `ai_proposal` |
| `measured_metric` | What was actually measured (§6) |
| `baseline_value` | The metric's value *before* the change |
| `post_change_value` | The metric's value after, measured over a stated window |
| `expected_value` | Restates `ai_proposal.expected_outcome` for direct comparison |
| `measurement_window` | Explicit start/end — a metric measured too early is a common false-positive source |
| `confounds_considered` | What else changed in this window that could explain the result (a second, unrelated deployment; a change in reporting volume; a holiday) — required field, not optional, because an unconsidered confound is how false "this worked" conclusions get made |
| `evaluator` | Named human, per Evaluation Lead role above |
| `evaluation_verdict` | IMPROVED / NO_CHANGE / WORSENED / INCONCLUSIVE |
| `evaluation_rationale` | Human-written |
| `enters_precedent_set` | Boolean — did this become institutional memory (§8), and if not, why not |
| `created_at` | |

### 5.2 New entity: `precedent`

The distilled, reusable form of an `outcome_record` that clears the bar
for institutional memory:

| Field | Purpose |
|---|---|
| `precedent_id` | Unique |
| `source_outcome_id` | FK to the originating `outcome_record` |
| `situation_summary` | What kind of problem this addressed (e.g., "ageing food-assistance requests in a flood-affected district") |
| `intervention_summary` | What was done |
| `result_summary` | What actually happened, including any negative or null result — a precedent that says "we tried this and it didn't help" is exactly as valuable as one that says it did |
| `applicability_conditions` | What has to be true of a future situation for this precedent to be relevant (event type, region characteristics, population scale) — prevents naive pattern-matching to a superficially similar but materially different disaster |
| `confidence` | How strong the evidence behind this precedent actually is |

## 6. Outcome Measurement

**BR-010-001**: every `AIProposal` with `impact_class` L2 or above
(per SPEC-009 §8) must have its `expected_outcome` field populated with
a metric that is actually measurable from data the platform already
collects or can be instrumented to collect — not an aspirational
statement. A proposal whose expected outcome can't be measured doesn't
get to claim it improved anything.

Illustrative metrics, matching the domains this platform already
operates in:

| Domain | Example metric |
|---|---|
| Assistance requests (existing platform capability) | Median time from request to first response; % resolved within a stated SLA |
| Recovery needs (SPEC-008, once built) | Median time from `REPORTED` to `ASSIGNED`; % of needs reaching `RESOLVED` |
| Information integrity | Time from a rumour's `REPORTED` state to a correction being published; % of disputes resolved without escalation |
| Adoption | Form completion rate; abandonment rate by device/connectivity class |
| AI proposal quality itself | % of proposals approved unmodified vs. modified vs. rejected — this is a legitimate metric of Planning Agent quality over time |

**BR-010-002**: measurement happens over a stated, pre-registered
window (`measurement_window`), decided *before* the change deploys, not
chosen after the fact to make the result look better. This is the same
discipline a pre-registered study uses, for the same reason.

**BR-010-003**: a Learning Agent finding of `IMPROVED` without a
populated `confounds_considered` field is not eligible to enter the
precedent set — this is enforced, not advisory, because an
unconsidered confound is the single most common way a mature agentic
system starts confidently learning the wrong lessons.

## 7. Evaluation Baseline

**BR-010-004**: before any `outcome_record` can claim an AI-authored
proposal "improved" an outcome, there must be a stated human-baseline
comparison — what would the metric likely have done *without* the
intervention, based on the platform's own history for comparable
situations. Without this, every deployed change looks like an
improvement simply because metrics move over time regardless of cause
— this is the specific failure mode the Agentic Model document's own
Known Unknowns section warned about ("AI should not be assumed to
improve outcomes until measured against human baseline and safety
metrics"), given a concrete mechanism here rather than left as a
caution.

## 8. Institutional Memory

**FR-010-001**: when a new disaster event is detected (the existing
Sentinel stage, per SPEC-009's grounding in the real orchestrator), the
Planning Agent queries the `precedent` table for entries whose
`applicability_conditions` match the new event's characteristics, and
surfaces them as context on any proposal it drafts for that event —
**as evidence to consider, not as an instruction to repeat.**

**BR-010-005**: a precedent's `applicability_conditions` are checked
explicitly, not fuzzily — a precedent from an earthquake response is
not silently applied to a flood response just because both are
"disasters." The Governance Agent (SPEC-009 §5) rejects any proposal
that cites a precedent whose applicability conditions don't actually
match the current event, forcing the Planning Agent to either justify
the analogy explicitly in `problem_statement` or drop the citation.

**BR-010-006**: a precedent with `result_summary` indicating the
intervention did *not* help is retained and surfaced with the same
priority as a positive precedent. Deleting or deprioritizing negative
findings would turn institutional memory into a system that only
remembers its successes — which is another way of saying it forgets
what doesn't work and is destined to try it again.

## 9. API Extensions

Same SPEC-003-conformant caveat as SPEC-008 and SPEC-009 — stated at
intent level here.

| Endpoint | Actor | Purpose |
|---|---|---|
| `POST /api/v1/learning/outcomes` | Learning Agent | Record an `outcome_record` against a completed `AIProposal` |
| `POST /api/v1/learning/outcomes/{id}/evaluate` | Evaluation Lead (human) | Attach `evaluation_verdict` and `evaluation_rationale` |
| `POST /api/v1/learning/precedents` | Evaluation Lead (human) | Promote an `outcome_record` into the `precedent` set |
| `GET /api/v1/learning/precedents?event_type=&region=` | Planning Agent, human reviewers | Query applicable precedent for a new event |

## 10. Monitoring Model Addition

Extends SPEC-009's monitoring, adding the one dimension neither
SPEC-005 nor SPEC-009 covers:

| Layer | Measures | Escalation |
|---|---|---|
| **Humanitarian outcome** *(new)* | Needs resolved vs. reported, time-to-assistance trend, precedent-set growth rate, % of L2+ proposals with a populated, honest `outcome_record` (not just a deployed one) | Humanitarian/Recovery Lead |

## 11. Acceptance Criteria / Quality Gates

| Gate | Pass condition |
|---|---|
| G-Learn-1 | Every L2+ `AIProposal` deployed in the last cycle has a corresponding `outcome_record` — no silent gaps between "deployed" and "measured" |
| G-Learn-2 | At least one demonstrated case of a `NO_CHANGE` or `WORSENED` verdict being recorded and retained, not quietly dropped — proves the system isn't structurally biased toward only keeping good news |
| G-Learn-3 | Precedent applicability-matching (BR-010-005) demonstrated to correctly reject a mismatched precedent citation in a test proposal |
| G-Learn-4 | Human-baseline comparison (BR-010-004) present and reviewable for at least one `IMPROVED` verdict, not asserted without it |

## 12. Traceability and Known Unknowns

- This document assumes SPEC-009 ships first — `outcome_record` has
  nothing to attach to without `ai_proposal` existing.
- Statistical rigor for "did this actually work" is genuinely hard at
  small sample sizes, which a single disaster event will often produce
  for any specific intervention — this document doesn't solve that, it
  requires `confounds_considered` and a stated baseline as the minimum
  discipline, not a claim that this makes the evaluation
  statistically airtight.
- The precedent set's long-term value depends on enough events
  accumulating enough evaluated outcomes — this is explicitly a
  multi-event, multi-year capability, not something that shows value
  after one deployment cycle. Worth stating plainly so it isn't judged
  against a one-event timeline it was never designed to meet.
- Who owns `applicability_conditions` taxonomy design (what counts as
  a "comparable" event) is not settled here and needs a named owner
  before §8 can be built — currently unassigned.
