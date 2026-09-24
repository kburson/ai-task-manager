# Close Readiness and Guarded Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The accepted #1558 WBS Task 17 remains normative.

**Goal:** Explain all currently supported close requirements without effects, and make ordinary execution independently refresh those requirements before terminal effects.

**Architecture:** Add a read-only close collector that uses current issue, board, lineage, delivery, review, child, and projected DoD authority. Route Review close through it, preserving Done as terminal and special mutation lanes as explicit only. Extract pure close predicates where necessary so the executable close saga re-reads the same requirements under its existing lock; explanation never becomes a grant or a stored input.

**Tech Stack:** Node.js ESM, `node:test`, AITM action-decision and observation contracts, GitHub issue/project records, local Git object graph.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS Task 17 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`.

## Story Intent

- **Beneficiary:** release operator
- **Capability:** inspect current close readiness and retain guarded execution
- **Need:** close combines read-side approval, delivery, child, and DoD checks with finalization effects
- **Value or failure prevented:** an advisory ready result cannot bypass delivery or approval or close on changed authority

## Global Constraints

- The seven-field decision is advisory. Preserve full evidence identities and source digests internally; never use a prior decision as executable authorization.
- Ordinary, epic, incorporated/no-commit, and evidence-v2 close requirements retain their distinct current guards. Explicit force, supersede, and recovery mutations cannot be selected from free text or normal remediation.
- Use read-only exact remote-tip and object-completeness checks for attribution; no fetch, ref update, issue mutation, timing flush, or provider call in explanation.
- Project Functional DoD without writing; persistence is execution-only after readiness, with fresh read-back and changed-authority refusal.
- Keep all typed simultaneous blockers, warnings, human requests and args. A missing required read is indeterminate, never ready.
- Preserve the close saga’s idempotent retry and order: board transition before GitHub issue close, then finalization/labels/timing as already governed.
- #1670 owns aggregate seven-action certification and authority-cost ceilings. Do not claim those results here.
- Keep `[#1669]` commit attribution and integrate into `feature/epic/1558`, not trunk.

## Decomposition review

The estimate remains 16 focused human hours, the accepted WBS allocation: close readiness plus read-only attribution/object completeness (10h), and close navigation plus close-specific execution parity (6h). The 16h review threshold is met; the 24h/four-independent-unit split threshold is not. These two units share one authority boundary and cannot be released independently without risking a ready explanation that execution contradicts. Revisit decomposition if a third substantive unit or a forecast above 24h emerges; the #1668 waiver does not apply.

## File map

- Create `scripts/task-tracker/lib/action-decision/close.mjs`: read-only observation collector, close-specific predicates, typed result.
- Modify `scripts/task-tracker/lib/action-decision/evaluate.mjs` and `navigation.mjs`: route Review close and Review→Done promotion through the close collector; Done remains terminal.
- Modify `scripts/task-tracker/verbs/close.mjs`: fresh shared readiness at existing pre-effect boundaries without changing special-lane behavior.
- Modify `scripts/task-tracker/lib/close-gates.mjs`, `trunk-ref.mjs`, `commit-attribution.mjs`, `review-exit-close-gates-guard.mjs`, `close-delivery-receipt.mjs`, and `evidence-v2/{close-machine,close-runner}.mjs` only for pure/read-only authority seams required by paired tests.
- Create `scripts/tests/integration/task-tracker/lib/action-close.test.mjs`; extend `scripts/tests/unit/task-tracker/lib/guard-parity-review-done.test.mjs` and `close-gate-order.test.mjs` without weakening existing expectations.

### Task 1: Read-only close authority (10h)

**Interfaces:** `collectCloseReadiness({ issue, attempt, ports })` returns `{ status, blockers, warnings, normalizations, humanDecision, selectedAction, observations }`; `ports` supplies fresh readers, `cfg`, `scope`, and injected guard/delivery predicates. It never writes or calls a provider.

- [ ] **Step 1 — Add failing paired tests.** In `action-close.test.mjs`, build a Review fixture with issue body, board state, worktree/head, children, delivery receipt, approval, and local/remote lineage. Assert ordinary and epic ready/blocked/indeterminate results; missing approval/DoD/delivery; dirty workspace; incomplete graph; incorporated/no-commit/evidence-v2 lanes; multiple child/promote requests; and zero effect calls. Example contract: `assert.equal(result.status, 'blocked'); assert.deepEqual(effects, []); assert.ok(result.blockers.some(({code}) => code === 'review-approval-missing'));`.
- [ ] **Step 2 — Run VC1 to RED.** Run `node --test scripts/tests/integration/task-tracker/lib/action-close.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-review-done.test.mjs scripts/tests/unit/task-tracker/lib/close-gate-order.test.mjs`. Confirm the failure is missing close routing/readiness, not a fixture error.
- [ ] **Step 3 — Implement the collector.** Create `collectCloseReadiness` with command-local `attempt.observe` reads. Reuse `evaluateCompleteGuards({ fromState:'review', toState:'done', ... })`, `projectFunctionalDod`, delivery receipt and close-gate predicates; map refusal IDs into registered typed blockers. Use `evaluateExactTrunkAttribution` for exact remote/local tip and complete graph. Missing or conflicting observations yield indeterminate causes. No mutating fallback.
- [ ] **Step 4 — Verify the collector.** Route `close` in `evaluateCompletedAction`, retain full observation provenance in the snapshot, and run focused tests until ordinary, epic, and alternate-lane explanations are green without effects.

### Task 2: Navigation and fresh execution parity (6h)

**Interfaces:** `resolveActionNavigation({actionId:'close',state:'review'})` selects the sanctioned close path; Review→Done promote delegates to it. `refreshCloseReadiness` (or a narrower shared predicate, chosen from the existing close command shape) must run after fresh reads at each existing terminal effect boundary; no action-decision snapshot crosses that boundary.

- [ ] **Step 1 — Add failing navigation/drift tests.** Require Review close selection, delivery-first remediation, Done terminal result, multiple child/promote requests with exact subject IDs, and no inferred force/recovery/supersede selection. A ready explanation followed by changed approval, delivery record, child state, HEAD, or object completeness must refuse before the next terminal effect. Post-ready transport/write failures remain execution failures.
- [ ] **Step 2 — Run focused tests to RED.** Run the issue-local VC1 and inspect the failing assertion names. Keep existing `guard-parity-review-done` and `close-gate-order` tests green once implementation lands.
- [ ] **Step 3 — Implement fresh boundaries.** Update navigation and the normal close path to re-collect current authority under the existing lock. Persist projected DoD only when current guards are ready; read back and re-evaluate before terminal transition. Leave timing flush, finalization, cascade, board write, and `gh issue close` on the execution side in their current safe order. Special human-only options remain explicit and unreachable from guidance.
- [ ] **Step 4 — Verify parity.** Run VC1 to GREEN and check that tests demonstrate explanation/execution agreement on unchanged authority and refusal on changed authority. Preserve existing saga idempotence tests.

### Verification and handoff

- [ ] Run `npm run lint`, `npm run format:check`, `npm test`, `npm run test:integration`, and `npm run test:slow` at the final commit; inspect the exact changed-path diff and refusal inventory. The governed Test verb reruns declared commands in its sandbox.
- [ ] Commit with `[#1669]`; record the commit trail, individually stamp the three root ACs, complete Test and Review gates, then fast-forward into `feature/epic/1558`, verify the integrated branch, push, and close #1669 through AITM Full-Auto.
