# #1665 Session and Early-Promote Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This issue-local plan refines accepted #1558 WBS Task 13 only; the pinned spec and WBS remain authoritative.

**Goal:** Make read-only bind, resume, and early-promotion decisions predict the same knowable refusals that fresh execution enforces.

**Architecture:** A session collector observes configuration, binding, worktree, board, marker, and ownership authority without calling a mutator. An early-promotion collector combines that session preflight with the canonical lifecycle policy and complete guard evaluation. Navigation selects only these ready-tested routes and never treats a prior explanation as execution authority; executing seams refresh under their existing lock.

**Tech Stack:** Node.js ESM, `node:test`, AITM `aitm.action-decision/v2`, attempt-scoped authority observations, existing lifecycle policy and guard registry.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md` Task 13; baseline plan `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md` Task 6.

## Global Constraints

- Scope is #1665's three root acceptance criteria and VC1. Test, Review, deliver, close, public explanation command, and catalog admission stay with later children.
- `bind` covers cold numeric binding and switching through supported start/resume routes. `rebind` remains a cursor trigger, not an action, public verb, or alias; an explanation request for it returns `unknown-vocabulary`.
- A read-only decision cannot bind, write timing, move a card, acquire an execution lock, heal evidence, or call a provider. Full authority identities and HEAD remain internal; a returned decision is never an executable grant.
- Required board/body/marker authority skipped by `TT_SKIP_NETWORK=1` or unavailable yields `indeterminate` with `authority-read-skipped` or `authority-read-failed`. `gateAssigneeMatch=false` makes only the optional assignee-match predicate inapplicable; it does not remove other reads.
- Preserve migration-freeze executor exit 14, existing transition exit codes, and compatibility text. `REFUSAL_ID_TO_STATUS` is presentation mapping, not a filter on the complete internal refusal set.
- Extend the closed v2 snapshot resource vocabulary with explicit local configuration, session, and worktree observations before producing those snapshots; never label local facts as `issue-body` or `project-board`. Include their digests in the normal snapshot digest and keep full values internal. The change is additive to pre-release v2 vocabulary, not a new public action or evidence field.
- Use `actionPolicyFor` and `forwardTarget`; do not implement a second state walk or mark a later delegated action explain-ready.

## Story Intent

- **Beneficiary:** task lifecycle operator
- **Capability:** inspect session and early-transition readiness without rebinding or moving an issue
- **Need:** current refusals surface only through side-effect-capable paths
- **Value or failure prevented:** I can choose a valid next action without an explanatory query changing the session or misreporting a blocked transition as ready

## Implementation Tasks

### Task 13: Share bind, resume, and early promotion readiness

#### Story Intent

- **Beneficiary:** task lifecycle operator
- **Capability:** inspect session and early-transition readiness without rebinding or moving an issue
- **Need:** current refusals surface only through side-effect-capable paths
- **Value or failure prevented:** I can choose a valid next action without an explanatory query changing the session or misreporting a blocked transition as ready

#### Unit A — Session authority and paired bind/resume tests (6 h)

**Files:** Create `scripts/task-tracker/lib/action-decision/session.mjs`; modify `scripts/task-tracker/lib/action-decision/contract.mjs` and `observations.mjs` for explicit local-source IDs, `scripts/task-tracker/lib/verb-preflight.mjs`, `scripts/task-tracker/task-tracker.mjs`, and `scripts/task-tracker/verbs/resume.mjs` at the existing preflight/bind seams; extend the test-only transport/fixture helper under `scripts/tests/helpers/` that owns real injected CLI/verb execution; create the bind/resume sections of `scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs` and extend `scripts/tests/unit/task-tracker/lib/action-decision-contract.test.mjs`.

**Interface:** `collectSessionReadiness({ actionId, issue, stateBefore, config, attempt, ports }) -> { status, blockers, effectiveConfig, observations }`. `actionId` is `bind` or `resume`. `ports` are read-only and correspond to existing preflight's injected board/body/marker/assignee/worktree readers; no `saveState`, timing, board writer, lock, or provider port is accepted. Add `local-config`, `session-state`, and `worktree` to the closed internal observation resource IDs, using issue-qualified identities and the normal digest path. `effectiveConfig.gateAssigneeMatch` is a boolean carried in the `local-config` observation, so its digest enters the bundle and snapshot. A separate execution adapter calls the same shared predicates on freshly read authority before any effect.

- [ ] **A1 — Write RED paired tests.** In `action-session-promote.test.mjs`, compare production evaluation with actual injected bind/resume execution for cold numeric bind, switch/rebind via `bind`, explicit resume, wrong worktree, wrong binding, foreign/multiple ownership, migration freeze, and missing board/marker. Assert the explanation effect ledger is `[]`, `migration-freeze` is blocked while execution exits 14, and `rebind` is not an action.
- [ ] **A2 — Write skipped/inapplicable authority tests.** Inject `TT_SKIP_NETWORK=1` and assert required authority yields `indeterminate`/`authority-read-skipped`; inject a board or marker read error and assert `authority-read-failed`. With `gateAssigneeMatch=false`, a complete board/body/marker observation may still be ready, while a missing one remains indeterminate. Test enabled assignee-match with an unreadable assignee source separately. Assert `local-config`, `session-state`, and `worktree` snapshots validate with issue-qualified identities and alter the snapshot digest when the observed value changes; unknown source IDs still fail closed.
- [ ] **A3 — Run RED.** Run `node --test scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs`; expected failure is the missing `collectSessionReadiness` seam or a known legacy permissive case, never a fixture import/syntax error.
- [ ] **A4 — Implement and GREEN.** Extract pure refusal classification from `runPreflight` while leaving `preflightVerb` as the same process-exit formatter. Bind execution to fresh reads at the existing execution boundary; preserve its exit code and timing behavior. Run the focused test and `node --test scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs scripts/tests/integration/task-tracker/lib/action-evaluator.test.mjs`; commit only Unit A with `[#1665]` attribution.

#### Unit B — Early promotion parity and fresh execution (7 h)

**Files:** Create `scripts/task-tracker/lib/action-decision/promote.mjs`; modify `scripts/task-tracker/verbs/promote.mjs` only at preflight/complete-guard entry seams; extend `scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs`; update directly affected early-stage guard producers only if the paired inventory proves a missing typed refusal.

**Interface:** `collectEarlyPromoteReadiness({ issue, fromState, body, attempt, ports }) -> { status, blockers, target, delegate }`. It derives the target from `actionPolicyFor('promote', fromState)` and `forwardTarget(fromState)`, invokes the existing complete guard evaluator, and preserves every refusal. `delegate` remains non-executable/pending unless its own later action adapter is complete. The executor recomputes after explanation and after acquiring its normal lock.

- [ ] **B1 — Write RED parity tests.** Cover Backlog→Refine, Refine→Ready for Planning, Ready for Planning→Plan, Plan→Develop, unknown/conflicting state, terminal Done, missing fields/parent/dependencies/contiguity/deep dive/plan approval/metadata/estimate, and an unmapped guard refusal. Compare shared status and all blocker codes with the actual injected promotion refusal; keep legacy CLI output/exit assertions separately.
- [ ] **B2 — Write drift tests.** Evaluate ready, then change a dependency or activate migration freeze before execution; assert execution refuses after fresh reads with no transition effect. Conversely a successful fresh run still uses the original normal lock and preserves existing transition behavior.
- [ ] **B3 — Run RED.** Run the root VC1 command. An expected missing adapter or parity assertion must fail while the three pre-existing lifecycle/guard-parity suites remain green.
- [ ] **B4 — Implement and GREEN.** Reuse `evaluateCompleteGuards` and current `runGuards` with the same observed body and workflow-policy authority. Never filter the internal refusal list through `REFUSAL_ID_TO_STATUS`; only apply that map at the old CLI formatter. Run VC1, the affected promote tests, and commit with `[#1665]` attribution.

#### Unit C — Canonical navigation and final conformance (5 h)

**Files:** Create `scripts/task-tracker/lib/action-decision/navigation.mjs`; integrate it into `scripts/task-tracker/lib/action-decision/evaluate.mjs` only for `bind`, `resume`, and early `promote`; extend `scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs` and `scripts/tests/unit/task-tracker/lib/lifecycle-policy.test.mjs`.

**Interface:** `resolveActionNavigation({ actionId, state }) -> { status, target, delegate, blocker }`. It imports `actionPolicyFor` and `forwardTarget`; unknown/conflicting state is indeterminate, Done is terminal, and a selected Test/Review/close delegate remains pending until its later child provides a complete evaluator. `evaluateAction` still validates the full v2 decision and calls `attempt.finish` exactly once.

- [ ] **C1 — Write RED navigation tests.** Assert supported early state edges match the canonical policy, `rebind` is `unknown-vocabulary`, unknown/conflicting state is `state-unavailable`, Done has no forward edge, and later delegates are not advertised ready. Assert an empty `effectAttempts()` ledger for all explanation cases.
- [ ] **C2 — Run RED.** Run VC1 and confirm only the new navigation assertions fail.
- [ ] **C3 — Implement and GREEN.** Route only the three #1665 actions to completed collectors, retain pending verdicts for later actions, and validate the returned v2 decision. Run VC1 and affected action-decision tests.
- [ ] **C4 — Verify and commit.** Run `npm run lint`, `npm run format:check`, `npm test`, `npm run test:slow`, and `git diff --check`; review the exact diff and commit with `[#1665]`. Obtain independent code review before the governed exact-SHA Test gate.

**Acceptance:** The three root #1665 criteria remain the sole issue criteria. The focused VC1 exercises production read-only evaluation and real injected execution seams, including authority drift and missing-read fail-closed cases. No public explanation CLI or later action adapter is claimed complete by this child.
