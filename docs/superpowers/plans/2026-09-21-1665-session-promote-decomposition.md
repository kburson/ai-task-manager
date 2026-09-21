# #1665 Session and Early-Promote Readiness Decomposition Plan

This is the Plan-exit decomposition of the approved [#1665 implementation plan](2026-09-21-1665-session-promote-readiness.md). The converged human Plan estimate is 24.5 hours and XL, so the accepted #1558 WBS Task 13 mandatory split threshold applies. These three serial children preserve #1665's three acceptance criteria and the focused VC1 while staying inside the original bind/resume/early-promote boundary. Public explanation, Test, Review, delivery, and close adapters remain later WBS work.

## Story Intent

- **Beneficiary:** task lifecycle operator
- **Capability:** inspect session and early-transition readiness without rebinding or moving an issue
- **Need:** current refusals surface only through side-effect-capable paths
- **Value or failure prevented:** I can choose a valid next action without an explanatory query changing the session or misreporting a blocked transition as ready

## Implementation Tasks

### Task 1: Collect session authority and share bind/resume preflight

#### Story Intent

- **Beneficiary:** task lifecycle operator
- **Capability:** inspect bind and resume prerequisites without changing a session or timing record
- **Need:** numeric binding and explicit resume currently reveal some refusals only after entering their effectful paths
- **Value or failure prevented:** cold bind, switch/rebind, and resume can be planned from current authority without an explanatory side effect

#### Scope

Create `scripts/task-tracker/lib/action-decision/session.mjs`; extend `scripts/task-tracker/lib/action-decision/contract.mjs` and `observations.mjs` with honest local-config, session-state, and worktree resource IDs and issue-qualified digest identities. Modify only the bind/resume seams of `scripts/task-tracker/lib/verb-preflight.mjs`, `scripts/task-tracker/task-tracker.mjs`, and `scripts/task-tracker/verbs/resume.mjs`. Extend the existing test-only transport/fixture helper under `scripts/tests/helpers/` and create `scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs` with the bind/resume paired cases. Keep the plan's Unit A interface and RED/GREEN order.

Test cold numeric bind, switching through semantic `bind`, explicit resume, worktree/binding/ownership mismatch, migration freeze with unchanged executor exit 14, missing config/board/marker, `TT_SKIP_NETWORK=1`, and `gateAssigneeMatch=false` with otherwise complete and incomplete authority. Execution re-reads required facts before effects; explanation causes no session, timing, GitHub, lock, or provider effect. An intentionally disabled assignee-match check is inapplicable, not observed or failed. Unknown local resource IDs continue to fail closed. `rebind` remains a cursor trigger, never a public action.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs scripts/tests/unit/task-tracker/lib/action-decision-contract.test.mjs
```

### Task 2: Share early-promotion complete guard readiness

#### Story Intent

- **Beneficiary:** task lifecycle operator
- **Capability:** see every knowable early forward-edge refusal before initiating promotion
- **Need:** legacy compatibility output can filter or defer guard causes that complete shared readiness must retain
- **Value or failure prevented:** an apparently ready promotion does not conceal a parent, dependency, metadata, plan, or state-contiguity blocker

#### Scope

Depends on Task 1 being merged into #1665. Create `scripts/task-tracker/lib/action-decision/promote.mjs`; modify `scripts/task-tracker/verbs/promote.mjs` only at its preflight and complete-guard entry seams. Extend the paired integration cases and directly affected early-stage guard producers/tests if the refusal inventory proves necessary. Preserve `REFUSAL_ID_TO_STATUS` for legacy CLI text and exit only, not as a filter on the internal decision. Keep the approved plan's Unit B interface and RED/GREEN sequence.

Use canonical `actionPolicyFor`, `forwardTarget`, and `evaluateCompleteGuards`. Test Backlog→Refine through Plan→Develop, unknown/conflicting state, terminal Done, plan approval/deep-dive/field/parent/dependency/contiguity/metadata/estimate refusals, and an unmapped guard refusal. Evaluate ready, then change a dependency or activate migration freeze before actual injected execution; the normal lock and fresh reads must refuse the stale grant. Later Test/Review/close delegates remain pending.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-early-stages.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-plan-develop.test.mjs
```

### Task 3: Route canonical early navigation and certify paired conformance

#### Story Intent

- **Beneficiary:** task lifecycle operator
- **Capability:** navigate only to actions whose current state and complete adapter make them explainable
- **Need:** a second state walk or an unfinished delegated adapter could otherwise advertise an executable recommendation too early
- **Value or failure prevented:** navigation stays consistent with lifecycle policy and never turns pending Test, Review, or close work into a false grant

#### Scope

Depends on Task 2 being merged into #1665. Create `scripts/task-tracker/lib/action-decision/navigation.mjs`; integrate the completed bind/resume/early-promote adapters in `scripts/task-tracker/lib/action-decision/evaluate.mjs`; extend `scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs` and `scripts/tests/unit/task-tracker/lib/lifecycle-policy.test.mjs`. Keep the approved plan's Unit C interface and RED/GREEN order. No public explanation command is introduced.

Import canonical `actionPolicyFor` and `forwardTarget`; reject `rebind` as `unknown-vocabulary`, report unknown/conflicting state as `state-unavailable`, keep Done terminal, and leave delegated Test/Review/close adapters pending. Run paired production evaluation and real injected execution against all root VC1 cases with an independent no-effect ledger. Preserve full v2 validation and ensure execution refreshes after any prior explanation.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs scripts/tests/unit/task-tracker/lib/lifecycle-policy.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-early-stages.test.mjs scripts/tests/unit/task-tracker/lib/guard-parity-plan-develop.test.mjs
```

Every child also runs `npm run lint`, `npm run format:check`, `npm test`, and `npm run test:slow` before merge. Merge and close children in Task 1→2→3 order, then verify aggregate #1665 acceptance and merge nested `feature/epic/1665` into `feature/epic/1558` before starting WBS rank 14 (#1666).
