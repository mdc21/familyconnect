# SPEC-008 — Reconciliation Delta (v0.2 → v0.3)

**Change type:** patch, matching the `SPEC-003-DELTA.md` pattern
already established in this repository. SPEC-008's structure, phasing,
and content are unchanged and sound. This delta reconciles it against
the real `mdc21/familyconnect` repository, which has grown
significantly since v0.2 was drafted — in a direction that turns out
not to conflict with SPEC-008's scope, but does need explicit
cross-referencing rather than silent overlap.

## What's changed since v0.2 was written

v0.2 was drafted without visibility into the current `main` branch,
which — independently verified this session, not taken on trust — now
includes response-phase capabilities that weren't part of this
project's scope when v0.2 was written: hydrological telemetry
(`water-levels.html`), relief distribution schedules (`relief.html`),
community flood-damage self-reporting (`report-damage.html`), tunnel
rescue tracking (`tunnels.html`), DNA reference-sample requests
(`dna-request.html`), and an autonomous AI News Agent with a human
verification queue.

## Fixes

1. **Parent artefact versions.** v0.2 cited the parent specs without
   version numbers. The real repository has SPEC-001 through SPEC-007
   all at v0.4, "Implemented Baseline — Synchronized with Active
   Codebase." Update the parent-artefact table accordingly.

2. **Actor model realignment.** v0.2's §4 used a nine-class actor
   model (`PUBLIC, PERSON, FAMILY, PROXY, CASE_WORKER, PARTNER,
   AUTHORITY, SYSTEM_AUDITOR, ADMIN`) inherited from earlier design
   work in this project. The real, currently-implemented actor set
   (confirmed via the repository's own OWASP/access-control
   documentation) is six classes: `PUBLIC, FAMILY, PARTNER,
   CASE_WORKER, AUTHORITY, ADMIN`. SPEC-008's actor table should be
   trimmed to match what's actually implemented — `PROXY` and
   `SYSTEM_AUDITOR` either don't exist in the current system or are
   folded into one of the six; confirm which before Phase 1 build
   rather than specifying against actors that aren't there.

3. **`report-damage.html` needs the same reconciliation treatment
   already flagged for `family_need`/`assistance_request`.**
   v0.2 already correctly identified that `RecoveryNeed` (SPEC-008's
   own new entity) needs reconciliation against the existing
   `family_need`/`assistance_request` tables before Phase 1. The same
   is now true, and more urgently, for the already-shipped
   `report-damage.html` self-reporting flow — it's conceptually very
   close to SPEC-008's M1 (Recovery Need) and M3 (Community Recovery)
   modules, but sits in the *response* phase, not the *recovery* phase
   this document targets. Before Phase 1 begins, confirm explicitly
   whether `report-damage` becomes the intake front-end for
   `RecoveryNeed`, stays a separate response-phase-only capability, or
   needs a defined handoff point between the two. Left unreconciled,
   the platform risks two parallel damage/need-reporting flows with no
   stated relationship — the same drift risk v0.2 already flagged for
   the family-need entities, now doubled.

4. **Gate G0 status language.** v0.2 stated flatly that the platform's
   authentication/authorization gaps were open, based on a security
   review of an older local snapshot. The current repository's own
   documentation *claims* those specific gaps are closed —
   `requireActor(...)` wired on administrative endpoints, tokens
   "cryptographically verified," a production startup check on
   `JWT_SECRET`, real rate limiting, database-enforced audit
   immutability. This delta changes G0's status from "open" to
   **"claimed, not independently verified"** — matching the same
   treatment given to this exact question in SPEC-009's own Gate G0.
   SPEC-008 should not proceed past Gate G0 on the strength of
   documentation alone; the verification step is identical to
   SPEC-009's and should be done once, not twice, for both documents.

5. **Cross-reference SPEC-009 and SPEC-010.** These didn't exist when
   v0.2 was written. SPEC-008's Phase 5 (AI Change & Operations,
   originally scoped as "M12") is now properly the responsibility of
   SPEC-009 in full, with SPEC-010 closing the outcome-evaluation loop
   for it. SPEC-008 v0.3 should narrow its own Phase 5 entry to a
   one-line pointer at SPEC-009/SPEC-010 rather than duplicating any of
   their content, since duplication is exactly the drift this project
   has caught and fixed twice already (SPEC-003's original gaps, and
   the SPEC-006 numbering collision this document itself was created
   to resolve).

## Not changed

The five-phase scope sequencing (§3), the M1–M12 module table, the
`AgentIdentity`-needs-reconciling-with-SPEC-009 note, the terminology
consolidation onto `impact_class`, the minimum-aggregation-threshold
rule, and the compliance gate for M9 — all retained as written in v0.2.
