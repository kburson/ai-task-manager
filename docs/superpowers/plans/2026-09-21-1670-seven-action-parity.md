# Seven-Action Parity and Authority-Cost Certification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The accepted #1558 WBS Task 18 remains normative.

**Goal:** Certify all seven lifecycle action explanations together against their guarded execution boundaries and record bounded authority cost without conflating fixture and live timing.

**Architecture:** Use one aggregate integration gate that consumes explicit per-action conformance metadata and the existing action-level tests, then validates exact operational-result vocabulary, effect-free explanations, named post-ready execution failures, and residual manual dispositions. Keep deterministic authority read counts and controlled live read-only service timing in separate evidence records. Mark v1/A2 complete only when this gate and all required suites pass.

**Tech Stack:** Node.js ESM, `node:test`, AITM action-decision contracts and fixtures, GitHub CLI for controlled read-only timing.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS Task 18 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`.

## Story Intent

- **Beneficiary:** lifecycle maintainer
- **Capability:** inspect one aggregate certification for all seven action explanations and guarded execution boundaries
- **Need:** individual action suites can pass while cross-action parity, authority cost, or a residual refusal remains unproven
- **Value or failure prevented:** local close success cannot be mistaken for complete A2 parity or release readiness

## Global Constraints

- The catalog and an earlier decision never authorize execution; execution refreshes authority through existing guarded boundaries.
- Preserve exact typed operational fields and args; unknown migrated refusals and warnings fail conformance.
- No explanation path performs network mutation, lock acquisition, issue/session mutation, guard effect, or provider action.
- Separate deterministic request counts from controlled live service median/p95. Record exact input, source, schema, runner/runtime, sample count, and observation time.
- Compare against WBS 4 using a declared equivalence mapping; retain at least 20 percent unused headroom in fixed CI ceilings.
- The evidence-v2 close lane remains indeterminate where production read-only ports are absent; never certify it ready by fixture substitution.
- Do not alter #1669 close semantics or claim A2 complete until the aggregate gate passes.
- Keep `[#1670]` commit attribution and integrate only into `feature/epic/1558`.

## Decomposition review

The accepted WBS allocates 16 focused human hours in two units: aggregate conformance/registry (8h) and authority-cost/manual-disposition certification (8h). This reaches the review threshold but not the 24-hour/four-unit mandatory split threshold. The unit boundary is testable, while the final certification depends on both. Revisit only if a third substantive unit or a forecast above the split threshold emerges.

## File map

- Create `scripts/tests/integration/task-tracker/lib/action-parity.test.mjs`: deterministic aggregate gate for all seven actions, typed outcomes, effect-free explanations, and post-ready failure cases.
- Create `scripts/tests/fixtures/1558/action-parity-matrix.json`: each required action/scenario with existing test provenance and typed/manual disposition.
- Create `scripts/tests/fixtures/1558/action-authority-cost.json`: deterministic request counts, WBS 4 comparison mapping, fixed ceilings and headroom, plus separately identified controlled service samples.
- Create `scripts/tests/fixtures/1558/residual-legacy-review.json`: reviewed manual legacy refusals/warnings and exact disposition.
- Modify `scripts/task-tracker/lib/action-decision/legacy-refusals.json` or adjacent conformance metadata only for verified completion; no weakening of unknown-code validation.

### Task 1: Aggregate action and execution parity (8h)

**Interfaces:** `action-parity-matrix.json` maps each of `bind`, `resume`, `promote`, `test`, `review`, `deliver`, and `close` to required `ready`, `blocked`, `indeterminate`, `changedAuthority`, and `postReadyFailure` evidence. `action-parity.test.mjs` validates the matrix against the actual action-specific test inventory and registered operational result contract.

- [ ] **Step 1 — Build the evidence matrix.** Inspect the seven action test files and name the exact cases covering each required scenario. Mark a gap as `open`, never `pass`, until a test exists. Record explicit typed or inventoried manual dispositions.
- [ ] **Step 2 — Write RED aggregate tests.** Assert exactly seven IDs, complete scenario keys, existing test provenance, no effects in explanation fixtures, valid seven-field result shape, full typed blockers/warnings/requests, and a refusal for an unknown migrated code. Require named post-ready execution cases; a passing action-level explanation alone does not satisfy that column.
- [ ] **Step 3 — Run RED.** Run VC10 and confirm failures identify missing aggregate evidence, not malformed JSON or missing imports.
- [ ] **Step 4 — Fill real gaps.** Add an action-specific failing test before any production correction. Re-run its action suite; update the matrix only after the exact case passes. Keep evidence-v2 close read-only unavailability as typed indeterminate.
- [ ] **Step 5 — Run GREEN and commit.** Run VC10 and the seven action-specific suites. Commit aggregate evidence with `[#1670]` attribution.

### Task 2: Authority cost and residual legacy certification (8h)

**Interfaces:** `action-authority-cost.json` names a deterministic count methodology and per-action counts/ceilings plus a separate `liveService` block. `residual-legacy-review.json` maps each remaining legacy refusal/warning to `typed`, `manual`, or `out-of-scope` with rationale and source fingerprint. The aggregate test rejects absent records, unrecognized statuses, unknown migrated codes, ceiling breaches, and less than 20 percent headroom.

- [ ] **Step 1 — Add RED budget/disposition tests.** Check the WBS 4 baseline digest/source identity, explicit old-to-new read equivalence, exact count sum, `actual <= 0.8 * ceiling`, service sample count and recomputed median/p95, and `mutations: 0`. Fail if fixture timing is labeled live service. Reject residual entries without a source and reviewed disposition.
- [ ] **Step 2 — Measure deterministic reads.** Count `attempt.observe` resource requests using fixed per-action scenarios and record the exact scenario IDs and method. Compare to WBS 4 `authority-baseline.json` and the frozen legacy transport observations without inventing a request schedule.
- [ ] **Step 3 — Capture service samples.** Run a controlled read-only `gh issue view` query at least five times; record command, runtime version, UTC observation time, every sample in milliseconds, median and nearest-rank p95, and zero mutations. Do not make the CI test fail on future live jitter; it validates this captured evidence and fixed count ceilings.
- [ ] **Step 4 — Review residuals.** Compare current `legacy-refusals.json` sites with the action matrix. Assign an explicit typed/manual/out-of-scope disposition and rationale to each residual; leave incomplete sites open rather than marking the registry complete.
- [ ] **Step 5 — Certify and commit.** Run VC10, full fast/slow/lint/format lanes, inspect the diff, update completion metadata only if all gates pass, and commit with `[#1670]` attribution.

### Verification and handoff

- [ ] Run the issue's exact VC1 including `action-close.test.mjs`, `action-parity.test.mjs`, `guard-parity-review-done.test.mjs`, and `close-gate-order.test.mjs`, then `npm test`, `npm run test:slow`, `npm run lint`, and `npm run format:check` at the final commit.
- [ ] Record commit trail, stamp the three root ACs individually, pass Test/Review/Full-Auto approval, fast-forward into `feature/epic/1558`, push the epic branch, and close #1670 through AITM.
