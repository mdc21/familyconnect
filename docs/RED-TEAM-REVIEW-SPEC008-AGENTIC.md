# Red Team Review — SPEC-006 (Community Recovery & Reconstruction v0.1) & Agentic AI Disaster Recovery Operating Model v0.1

**Reviewed:** both documents in full, cross-referenced against the
existing SPEC-001–SPEC-007 chain and the actual state of the running
codebase (not just what earlier specs claim — what I've personally
built, tested, and found in security review this session).

**Bottom line:** the agentic vision is coherent and the human-authority
guardrails (Section 8 of the Operating Model — what agents may never
decide) are genuinely well-designed. But there's a structural collision
before content even matters, the scope is enormous and unphased, and —
most importantly — **both documents assume a platform maturity level
that doesn't exist yet.** The security review earlier this session
found the existing system has no real authentication and zero
authorization checks on several critical write endpoints. An agentic
layer whose entire trust model depends on "human reviewer approves,
decision becomes immutable audit data" cannot be meaningfully built on
top of a system where actor identity is a self-declared HTTP header.
That has to be fixed first, not in parallel.

---

## Critical — Structural

### CS1 — SPEC-006 number collision

`SPEC-006.docx` (the UX/UI Design Specification — Assistance Directory,
Timeline View, Disaster Rumour Feed, etc.) already exists in the
project and is load-bearing: SPEC-003's API contract, this session's
frontend build, and SPEC-007's test plan all reference it. The new
document claims the same identifier: **"SPEC-006 — Community Recovery &
Reconstruction Coordination."**

This isn't pedantry — the whole point of the spec-driven methodology
this project uses is that "SPEC-006" is an unambiguous pointer. Two
documents answering to it breaks every future cross-reference. Anyone
(human or agent — see CS3) who resolves "SPEC-006" gets a coin flip.

**Fix:** renumber the new document. Given SPEC-007 (Engineering QA &
Deployment) is the last assigned number, this becomes **SPEC-008**.
Applied throughout the revised document below.

### CS2 — Parent-artefact citation is inaccurate, and misses a real parent

The new document's header table lists "SPEC-004 Security/Privacy Red
Team" as a parent artefact. The actual SPEC-004 is titled "SECURITY,
PRIVACY, GOVERNANCE & SAFEGUARDS" — a baseline governance specification,
not a red-team report. (The actual red-team work on this codebase was
done ad hoc this session, not as a numbered spec artefact — see CS5.)
Separately, the parent table omits **SPEC-007 (Engineering QA &
Deployment Testing)** entirely, despite Section 11's quality gates
(G1–G9) directly overlapping SPEC-007's testing-gate structure — a
new engineering-governance document that doesn't cite the existing
engineering-governance document is a traceability gap.

**Fix:** correct the SPEC-004 title in the citation; add SPEC-007 as a
parent artefact.

### CS3 — FR/BR numbering convention silently changes

Every requirement in SPEC-001 is numbered flat and sequential — `FR-006`,
`FR-007`, `FR-012`, `FR-017`, and so on, no spec-number prefix. This new
document introduces `FR-006-001` through `FR-006-018` — a
spec-number-prefixed scheme, with **no note that the convention
changed.** Given SPEC-001 already uses numbers in this range (`FR-006`,
`FR-012`, `FR-017` are all real, already-implemented requirements from
the original spec), a careless future reference to "FR-006" is now
genuinely ambiguous between two different requirements in two different
documents.

**Fix:** the prefixed convention (`FR-008-001`, `BR-008-001`, etc.,
matching the SPEC-008 renumbering from CS1) is actually the better
long-term choice as the spec count grows — adopt it, but say so
explicitly, in the document itself, as a declared project-wide
convention change going forward, not a silent drift.

### CS4 — No API-contract-format discipline in Section 9

SPEC-003 established real engineering discipline for every endpoint:
mandatory `Idempotency-Key` on state-changing POSTs, an actor-resolution
matrix, ETag/`If-Match` concurrency control, an RFC 9457 error catalog.
Section 9 of the new document is a loose two-column table — endpoint,
one-line purpose — with none of that. If this is meant to be
implementable the way SPEC-003 was, it needs the same contract rigor,
not a product summary dressed as an API section.

**Fix:** the revised SPEC-008 below restates Section 9 requirements as
"requires a SPEC-003-conformant delta" rather than pretending the loose
table is sufficient, and flags it as follow-on work, matching how this
project handled the SPEC-003 v0.2 gap-fix delta earlier.

### CS5 — Neither document accounts for the platform's actual current state

This is the most consequential finding, so stating it plainly: **both
documents describe a mature platform being extended, when the platform
that actually exists has critical, unresolved security gaps.**
Specifically, from this session's direct review of the running code:

- Actor identity is a self-declared, unverified HTTP header (no real
  authentication exists yet — a fix is in progress but incomplete as of
  this review).
- Case status-transition, dispute, and escalation endpoints have **no
  authorization check at all** — any caller can currently trigger them.
- Case handover and safeguarding handover (releasing a minor's record)
  can currently be triggered by anyone who sets one header.

Section 5.3 of the new SPEC-008 (AI Change lifecycle) and the entire
Agentic Model depend on "human reviewer approves, decision becomes
immutable audit data" being a real, unforgeable act. **It currently
isn't.** If actor identity can be spoofed, so can an approval record —
an attacker (or a misbehaving agent under CS-adjacent finding H1 below)
could forge "Human Review Board approved this" the same way they could
currently forge "AUTHORITY confirmed this case." The entire
human-in-the-loop trust model both documents lean on has no foundation
under it yet.

**Fix:** state explicitly, as a hard prerequisite gate, that no part of
the AI Change & Operations module (M12 / the Agentic Model generally)
begins implementation until the platform's own human-authorization layer
is real — not "in progress," complete and verified. This is reflected
as Gate G0 in the revised SPEC-008.

---

## High — Content

### H1 — Scope is enormous and entirely unphased

Twelve modules (M1–M12) are presented as equally in-scope for "v0.1,"
including infrastructure/hydropower reconstruction tracking (M5), a
funding/aid pledge registry (M9), and a full AI agent operating system
(M12) — on top of a codebase that, per this session's own review, is
still MVP-stage on its *original* mission (missing-person coordination
lacks production auth). Section 13's "Known Unknowns" honestly admits
authority-of-record, data-sharing agreements, and identity-API
availability are all still unresolved — yet Section 3 doesn't sequence
around that admission at all.

**Fix:** the revised document below sequences M1–M12 into explicit
phases, with M1 (Recovery Need) and M11 (Information Integrity) as the
only true near-term scope, and M5/M9/M12 explicitly gated behind
named prerequisites (see the phased scope table in the revision).

### H2 — M9 (Funding/Aid Registry) has a compliance surface no one has scoped

Tracking pledges, commitments, and allocations — even without payment
processing — touches donor due-diligence, anti-fraud, and (depending on
jurisdiction and funding source) counter-terrorism-financing screening
obligations. This is why dedicated humanitarian financial-tracking
systems (e.g., OCHA's FTS) exist as their own specialized systems rather
than a module bolted onto a general coordination portal. Folding this
into the same "G2 Security" gate as everything else understates it.

**Fix:** M9 requires its own named legal/compliance review gate before
build begins, separate from the general security gate — added to the
revision.

### H3 — M5 (Infrastructure) authority-of-record is ambiguous

"Roads, bridges, buildings, debris/mud clearance, hydropower and access
restoration" status-tracking, given equal weight to modules like
"resource exchange," risks the platform becoming a shadow system of
record for critical national infrastructure — in tension with the
platform's own stated design principle that it doesn't replace
authorities. The document never states whether M5 is read-only
aggregation of authoritative government data, or an independently
originated tracking system.

**Fix:** the revision makes M5 explicitly read/aggregate-only over
authoritative sources, never an independent system of record, until an
explicit government data-sharing agreement exists per authority-of-record
domain.

### H4 — The two documents disagree on what "the AI actor" even is

The new SPEC-008's Section 4 (Actors and Authority Model) and Section 9
(API extensions) both treat "AI Agent" / "AI" as a single actor class.
The Agentic Operating Model's Section 4 defines **sixteen** distinct,
differently-scoped agents (A01–A16), each needing different tool and
data access under BR-006-009's own least-privilege requirement. A
single `AI` actor class cannot satisfy least-privilege across sixteen
agents with genuinely different blast radii (a Monitoring Agent reading
telemetry is not the same privilege tier as a Deployment Agent pushing
to production). This is a direct inconsistency between the two
documents, not just an omission.

**Fix:** the revision adds an `AgentIdentity` entity (agent ID, class,
scoped tool/data permissions, credential reference, owning system) to
the data model, and replaces the single `AI` role in the API table with
a reference to the specific agent classes permitted per endpoint.

### H5 — No proposal-volume governance — the Human Review Board can be DoS'd

Nothing in either document bounds how many AI Proposals or Escalations
can be generated per unit time, per agent, or per objective. A
misconfigured or adversarially-triggered agent (see the Agentic Model's
own Section 9 concern about "agent abuse") could flood the Human Review
Board with proposals, which functions as a denial-of-service against
the humans' finite review capacity — a well-documented failure mode in
agentic systems generally, and one this platform is specifically
vulnerable to given C3 from the earlier security review (the existing
dispute/escalation endpoints already have no rate limiting or
authorization at all).

**Fix:** new business rule added in the revision — proposal creation is
rate-limited per agent and per objective, and near-duplicate proposals
are auto-consolidated before reaching human review.

### H6 — "Kill switch" is a sentence, not a specification

Section 9 of the Agentic Model states agents need "kill switch and
isolation capability" — correct, and arguably the single most important
safety control in the whole document — but nothing specifies who can
trigger it, under what authority, within what SLA, or what "isolation"
concretely does to an agent mid-execution. Neither document's data
model or API section has a corresponding entity or endpoint.

**Fix:** the revision adds an explicit `POST /api/v1/ai/agents/{id}/suspend`
endpoint (ADMIN/Security Lead only, audited, effective within a stated
SLA) and a corresponding functional requirement.

---

## Medium

### M1 — Terminology drift across three severity/impact scales

`AIProposal.impact_class` (Low/Medium/High/Critical), `Escalation.severity`
(unspecified enum), and the Operating Model's own "risk class" table
(also Low/Medium/High/Critical) are three different field names for
what appears to be the same underlying concept, used inconsistently
across the two documents. This will produce real bugs the moment
someone builds a dashboard that has to join across these fields.

**Fix:** the revision consolidates onto one canonical `impact_class`
enum, used identically on `AIProposal`, `Escalation`, and anywhere else
a risk tier is recorded.

### M2 — No re-identification threshold on locality aggregation

FR-006-005 and BR-006-003 correctly say sensitive personal data isn't
shown on public dashboards, but neither document sets a minimum
population/count threshold before a locality-level aggregate is
published. A "community" of three households showing "1 safeguarding
need reported" is a re-identification risk even though no name or
coordinate was ever shown — exactly the kind of small-cell disclosure
risk the OCHA guidance this document itself cites is designed to
prevent.

**Fix:** added as an explicit rule in the revision (minimum aggregation
threshold before any locality-level count is published).

### M3 — `RecoveryNeed` isn't reconciled with the existing `family_need` /
`assistance_request` entities

The current schema already has `family_need` and `assistance_request`
tables covering conceptually overlapping ground (a family's assistance
needs). The new `RecoveryNeed` entity is introduced with no reconciliation
note — is it a supertype, a rename, a parallel concept? Left unresolved,
the platform ends up with two unreconciled "need" concepts, the same
class of drift this project caught and fixed for SPEC-003 (the
SPEC-003-DELTA document, built earlier in this project).

**Fix:** flagged in the revision as required gap-analysis work before
M1 implementation, following the same delta-document pattern already
established in this project.

### M4 — `RESTRICTED_PENDING_REVIEW` lifecycle state isn't actually modeled

The document's header table says "disputed items may enter
RESTRICTED_PENDING_REVIEW" (reusing terminology from the existing
`case_record.data_sharing_status` field — good, consistent naming) but
Section 8's `RecoveryNeed` entity only lists a generic `status` field,
with no `data_sharing_status`-equivalent to actually carry that state.

**Fix:** added `data_sharing_status` field to `RecoveryNeed` in the
revision, explicitly mirroring the existing `case_record` mechanism.

### M5 — Retention policy is a placeholder, not a rule, and ignores existing infrastructure

Section 10 says "data retention/deletion rules defined per data class
and legal/partner requirements" — a TBD, not a rule. The existing
platform already has `disaster_event.retention_policy` /
`legal_basis_registry` governance columns built for exactly this
purpose. The new document should extend that existing mechanism, not
restate the requirement as if starting fresh.

**Fix:** revision cross-references the existing governance columns
directly instead of leaving a placeholder.

### M6 — No cost/budget governance for the agents themselves

Sixteen continuously-running agents, several LLM-backed, is a real
operating cost — relevant for what's presumably a donor-funded
humanitarian deployment where operating expenses need to be justified
(the same transparency M9 demands of *other* organizations' funding
isn't applied reflexively to the platform's own AI spend).

**Fix:** added as a monitoring dimension in the revision (agent
operating cost, with budget caps and throttling on cost grounds, not
just safety/quality grounds).

### M7 — Continuous single-number auto-list across unrelated sections

The Operating Model document's list numbering runs continuously
(13–20 under "Continuous security loop," 21–32 under "Minimum viable
agentic platform," 33–43 under "Recommended roadmap") instead of
resetting per section — almost certainly a Word auto-numbering
artifact. Minor, but this document will be referenced ("see item 27")
and the numbers are currently meaningless without knowing which section
you're in.

**Fix:** flagged for correction; not carried into the SPEC-008 revision
since it's the *other* document, but worth a one-line fix pass.

### M8 — Multilingual commitment isn't cross-referenced against the known frontend gap

Section 12's "Provide Nepali and English initially" is good and
concrete. But this session's frontend review found the actual deployed
frontend has zero i18n infrastructure — hardcoded English throughout,
and copy on multiple pages that *claims* translations exist when they
don't. Neither new document acknowledges this as a known, already-
identified blocking gap.

**Fix:** cross-referenced explicitly in the revision's Known Unknowns
section.

---

## What's genuinely well-designed (for balance)

- **Section 8 of the Agentic Model — "What agents may never decide
  autonomously"** — is specific, correctly conservative, and gets the
  hardest calls right: death/identity confirmation, safeguarding
  disposition, legal entitlement, fund disbursement, public accusation.
  This is exactly the right list and matches the existing project's
  design principle (AI drafts, humans decide) precisely.
- **BR-006-001/002** (AI output is never authoritative merely for being
  AI-generated; official confirmation stays with the competent
  authority) is correct and consistent with everything upstream in this
  project.
- **The OBSERVE→...→REPLAN loop structure** is a coherent, standard
  agentic-ops pattern, not an invented one.
- **Section 14's explicit advice not to start with dozens of autonomous
  agents** — genuinely disciplined, and consistent with how this
  project's own backend was actually built (phased, tested at each
  step, not all at once).
- **Grounding data-responsibility requirements in real external
  sources** (OCHA 2025 Guidelines, IFRC) rather than generic "we'll be
  secure" language is a real strength and shows genuine domain research.

---

## Disposition

Two deliverables follow this review:

1. **`SPEC-008-COMMUNITY-RECOVERY-RECONSTRUCTION-v0.2.md`** — the
   renumbered, phased, gap-fixed replacement for the new document
   (structural fixes CS1–CS5 and content fixes H1–H6/M1–M8 applied).
2. **`AGENTIC-MODEL-DELTA.md`** — a delta patch (matching the pattern
   already used for `SPEC-003-DELTA.md` in this project) covering only
   what the Operating Model document needs changed, since most of it —
   the human-authority principles especially — is sound as written.

Neither should be treated as ready to build against until **CS5's
prerequisite is actually met**: the platform's own authentication and
authorization gaps found in this session's security review are closed
and re-verified, not just in progress.
