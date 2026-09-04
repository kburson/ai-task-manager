# Continuous Agent Delivery Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Test own hosted verification, clean-context agent review, and
exact-head merge while making Review a collateral-only record-certification
state and adding non-blocking post-close crossover assurance.

**Architecture:** Extend #1219's GitHub-record cloud Test path with a
trusted-runtime candidate machine, canonical flow-review receipts, deterministic
finding disposition, and Test-owned merge orchestration. Bind code evidence to
the candidate SHA and Review evidence to a separate collateral digest, then add
closed-story audit records and stage-aware enrollment after a bounded pilot.

**Tech Stack:** Node.js 22 ESM, `node:test`, GitHub Actions, GitHub REST/GraphQL
adapters, AITM evidence-v2 records, canonical GitHub comments, GitHub Projects
v2, Markdown task skills.

## Global Constraints

- Normative amendment:
  `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`.
- The amendment overrides #1219 only for lifecycle, review, merge, close,
  assurance, telemetry, and migration behavior that conflicts with it.
- Before implementation, synchronize the governed #1219 branch with the
  approved current `origin/trunk`; the planning branch is currently 11 commits
  behind and must not implement against its stale legacy evidence surface.
- Preserve #1219's cloud runner topology, native Actions evidence, exact-head
  protection, integration freezes, and target-branch serialization.
- Use a trusted target-branch or installed runtime for all authorization. Never
  let candidate lifecycle code certify itself.
- Repository-tracked documentation is candidate content and freezes at merge.
  Review may mutate only GitHub issue/project collateral.
- CI and flow-review evidence are exact-candidate authority. Collateral repair
  invalidates only implementation-record evidence.
- Test may return to Develop; Review never returns to Develop under the new
  protocol.
- Full-Auto bypasses human gates only. It never bypasses CI, flow review,
  expected-head merge validation, or implementation-record validation.
- Cross-provider audits run only on closed issues and never block delivery.
- Create corrective issues only through the sanctioned `create-issue` path.
- Every mutation is idempotent, read back, and tied to a stable logical key.
- Use test-driven development and commit each task independently with `[#1219]`
  attribution until the amended WBS materializes dedicated child issues.

## Amendment Decomposition

The existing #1219 plan remains active except for Tasks 12, 13, 14, 17, 18,
and their consumers. Replace those contracts with Tasks 1-7 below. Tasks 8-9
are additive assurance and rollout units. Materialize each task as a governed
child before production implementation so a reviewer can accept or reject it
independently.

---

### Task 1: Trusted candidate and evidence identities

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/candidate.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/record-codec.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/trusted-runtime.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/candidate.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/trusted-runtime.test.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/record-schema.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/protocol.mjs`

**Interfaces:**

- Produces `createDeliveryCandidate(input)` and
  `validateDeliveryCandidate(record)` for
  `aitm.delivery-candidate/v1`.
- Produces `resolveTrustedRuntime({ targetRef, installedRuntime, git })`
  returning a frozen `{ source, identity, protocolVersion }`.
- `candidateLogicalKey(record)` returns
  `issue:<number>:candidate:<generation>`.
- Later tasks consume the canonical candidate bytes and trusted runtime without
  reconstructing either from mutable local state.

- [ ] **Step 1: Write failing candidate schema and logical-key tests**

  Test this public shape and reject extra keys, invalid SHAs, non-positive
  generations, source/base equality assumptions, and candidate-controlled
  runtime identities:

  ```js
  const candidate = createDeliveryCandidate({
    candidateId: '01K4CANDIDATE00000000000000',
    generation: 1,
    issueNumber: 1219,
    repository: 'kburson/ai-task-manager',
    sourceSha: 'a'.repeat(40),
    baseSha: 'b'.repeat(40),
    headRef: 'feature/child/1237',
    targetRef: 'cloud-test-automation',
    prNumber: 1511,
    createdAt: '2026-09-04T15:00:00.000Z',
    runtime: {
      source: 'trusted-target',
      identity: 'b'.repeat(40),
      protocolVersion: 1,
    },
  });

  assert.equal(candidateLogicalKey(candidate), 'issue:1219:candidate:1');
  assert.ok(Object.isFrozen(candidate));
  ```

- [ ] **Step 2: Run the focused tests and confirm they fail**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/candidate.test.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery/trusted-runtime.test.mjs
  ```

  Expected: FAIL because the continuous-delivery modules do not exist.

- [ ] **Step 3: Implement strict canonical records and trusted-runtime
      resolution**

  Export this stable surface:

  ```js
  export const DELIVERY_CANDIDATE_SCHEMA = 'aitm.delivery-candidate/v1';
  export function createDeliveryCandidate(input) {}
  export function validateDeliveryCandidate(record) {}
  export function candidateLogicalKey(record) {}
  export function resolveTrustedRuntime({ targetRef, installedRuntime, git }) {}
  ```

  `resolveTrustedRuntime` must accept exactly one of a verified target commit or
  immutable installed package. It must reject a runtime path or SHA supplied by
  the candidate branch.

- [ ] **Step 4: Run focused tests and evidence-v2 schema regression**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/unit/task-tracker/lib/evidence-v2/*.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 5: Commit the candidate authority unit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/lib/evidence-v2 scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/unit/task-tracker/lib/evidence-v2
  git commit -m "feat(task): add trusted delivery candidates [#1219]"
  ```

---

### Task 2: Test entry, PR creation, and hosted-CI disposition

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/test-entry.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/ci-disposition.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/test-entry.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/test-ci-flow.test.mjs`

**Interfaces:**

- Consumes Task 1 candidate and trusted-runtime records.
- Produces `planTestEntry(input)` with one of `reuse-pr`, `create-pr`, or
  `refuse` and an exact provider-action request when creation is required.
- Produces `classifyCiConclusion(input)` returning `accept`, `develop-rework`,
  or `reconcile`.
- `verbTest` owns Develop-to-Test entry, candidate persistence, awaiting-CI
  projection, CI polling, and red-to-Develop movement.

- [ ] **Step 1: Write failing entry and CI disposition tests**

  Cover unique exact-head PR adoption, duplicate PR refusal, wrong target,
  stale head, successful creation readback, red, cancelled, timed out, missing,
  and transport-ambiguous CI states. Assert:

  ```js
  assert.deepEqual(classifyCiConclusion({ conclusion: 'failure', exactHead: true }), {
    action: 'develop-rework',
    reason: 'ci-failure',
  });
  ```

- [ ] **Step 2: Run focused tests and confirm red failures**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/test-entry.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/test-ci-flow.test.mjs
  ```

  Expected: FAIL because Test does not yet own this state machine.

- [ ] **Step 3: Implement idempotent Test entry and CI recovery**

  `verbTest` must persist the candidate before releasing local occupancy,
  validate PR readback, and reconstruct awaiting-CI from durable records. Red or
  cancelled exact-head CI calls the sanctioned one-step Test-to-Develop rework
  transition. Unknown transport state remains in Test and polls live state.

- [ ] **Step 4: Run focused and existing Test-transition suites**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/test-ci-flow.test.mjs scripts/tests/unit/task-tracker/verbs/test*.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 5: Commit Test entry and hosted-CI disposition**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): make Test own hosted CI entry [#1219]"
  ```

---

### Task 3: Clean-context flow-review contract

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/flow-review.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/review-package.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/reviewer-action.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/flow-review.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/flow-review-action.test.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`

**Interfaces:**

- Produces `buildFlowReviewPackage(input)` containing canonical issue, plan,
  diff, CI, repository guidance, and candidate identities but no author
  conversation transcript.
- Emits `AITM_REVIEWER_ACTION_REQUIRED` with the review package digest.
- Produces and validates `aitm.flow-review/v1` receipts.
- Supports `pass`, `block`, `pass-with-defect`, and `uncertain` only.

- [ ] **Step 1: Write failing package-isolation and receipt tests**

  Prove deterministic package bytes, exact-SHA binding, forbidden transcript
  fields, read-only capabilities, provider/model/agent provenance, issue and
  plan digests, CI evidence IDs, and strict finding shapes.

  ```js
  assert.equal(receipt.schema, 'aitm.flow-review/v1');
  assert.equal(receipt.candidateId, candidate.candidateId);
  assert.equal(receipt.sourceSha, candidate.sourceSha);
  assert.equal(receipt.verdict, 'pass');
  ```

- [ ] **Step 2: Run focused tests and confirm red failures**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/flow-review.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/flow-review-action.test.mjs
  ```

  Expected: FAIL because no flow-review action exists.

- [ ] **Step 3: Implement package, provider handoff, and receipt readback**

  The adapter may invoke a same-provider agent but must start it with a clean
  context, read-only repository access, and no issue mutation capability. AITM
  accepts no verdict until the persisted receipt is read back and revalidated
  against the candidate and package digest.

- [ ] **Step 4: Run focused and provider-contract suites**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/flow-review-action.test.mjs scripts/tests/integration/task-tracker/lib/evidence-v2/provider-contract.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 5: Commit the flow-review contract**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): add clean-context flow review [#1219]"
  ```

---

### Task 4: Finding disposition and governed defect creation

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/finding-disposition.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/defect-handoff.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/finding-disposition.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/defect-handoff.test.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/gh/create-issue.mjs`

**Interfaces:**

- Produces `classifyFlowReview({ receipt, acceptanceCriteria })` returning
  `merge-eligible`, `develop-rework`, `adjudicate`, or `critical-stop`.
- Produces an exact `create-issue --shape defect` handoff for unrelated
  non-critical defects, including audited issue, finding ID, source SHA, merge
  target, and acceptance-impact classification.
- Uses `(candidateId, findingId)` as defect-creation idempotency authority.

- [ ] **Step 1: Write the failing decision table**

  Test every row from the specification and assert acceptance impact wins over
  provenance:

  ```js
  assert.deepEqual(
    classifyFlowReview({
      receipt: receiptWith({ provenance: 'pre-existing', impact: 'blocking' }),
      acceptanceCriteria,
    }),
    { action: 'develop-rework', reason: 'acceptance-blocked' }
  );
  ```

- [ ] **Step 2: Write failing partial defect-creation recovery tests**

  Prove that an emitted issue number is adopted after tether or link failure,
  duplicate findings do not create duplicate issues, and critical findings
  never create a quiet non-blocking handoff.

- [ ] **Step 3: Run focused tests and confirm failures**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/finding-disposition.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/defect-handoff.test.mjs
  ```

  Expected: FAIL because classification and handoff do not exist.

- [ ] **Step 4: Implement classification, bounded adjudication, and defect
      recovery**

  A first `uncertain` receipt schedules one fresh adjudicator. A second
  unresolved result parks in Test and raises attention. Non-critical unrelated
  defects must be durably created and linked before the candidate becomes
  merge-eligible.

- [ ] **Step 5: Run focused and issue-creation suites**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/defect-handoff.test.mjs scripts/tests/integration/task-tracker/lib/create-issue-*.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 6: Commit finding disposition**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/verbs/test.mjs scripts/gh/create-issue.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): route Test review findings [#1219]"
  ```

---

### Task 5: Test-owned expected-head merge and recovery

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/test-merge-machine.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/test-merge-runner.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/delivery.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/test-merge-machine.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/test-merge-flow.test.mjs`

**Interfaces:**

- Moves provider-action delivery orchestration behind Test without changing the
  sanctioned expected-head merge adapter.
- `planTestMerge(input)` requires candidate, green CI, accepted flow review,
  finding disposition, target-lane authority, and mode-appropriate repository
  approval.
- Emits the existing `github.merge-pull-request` action.
- Produces a delivery receipt before the Test-to-Review transition.

- [ ] **Step 1: Write a failing pure merge-machine transition table**

  Cover missing/red CI, stale review, blocking finding, human approval pending,
  Full-Auto bypass, stale base, lane conflict, provider timeout, already-merged
  readback, and fully converged retry.

- [ ] **Step 2: Write failing end-to-end Test merge tests**

  Prove exact action bytes, expected head, immediate target branch, squash
  attribution, source/merge SHA receipt, crash after provider success, and no
  transition to Review before receipt readback.

- [ ] **Step 3: Run focused tests and confirm failures**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/test-merge-machine.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/test-merge-flow.test.mjs
  ```

  Expected: FAIL because delivery is still Review-owned.

- [ ] **Step 4: Implement Test-owned merge orchestration**

  Keep `deliver.mjs` as a compatibility adapter during migration, but route
  enrolled issues to the Test merge runner and refuse a second Review-stage
  merge. Reconcile unknown provider results from live PR and target state before
  choosing rework or success.

- [ ] **Step 5: Run delivery, evidence-v2, and cloud Test regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/test-merge-flow.test.mjs scripts/tests/unit/task-tracker/verbs/deliver*.test.mjs scripts/tests/integration/task-tracker/lib/evidence-v2/delivery-flow.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 6: Commit Test-owned delivery**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/lib/evidence-v2 scripts/task-tracker/lib/delivery-preflight.mjs scripts/task-tracker/verbs/test.mjs scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): merge accepted candidates in Test [#1219]"
  ```

---

### Task 6: Collateral-only Review and implementation records

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/implementation-record.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/collateral-validation.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/verbs/approve.mjs`
- Modify: `skill/shared/rules/review.md`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/implementation-record.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/review-collateral-flow.test.mjs`

**Interfaces:**

- Produces and validates `aitm.implementation-record/v1`.
- `validateReviewCollateral(input)` returns exact failing validator keys and
  never spawns functional commands.
- Review requires a verified delivery receipt before entry.
- Issue/project edits change only `issueBodyDigest` or
  `projectProjectionDigest` and never retire candidate evidence.

- [ ] **Step 1: Write failing record and collateral tests**

  Prove source/merge/delivery/review binding, child receipt aggregation,
  canonical issue/project digests, validator protocol identity, and rejection
  of any Review command outside the static allowlist.

- [ ] **Step 2: Write failing lifecycle-boundary tests**

  Prove unmerged issues cannot enter Review, Review cannot demote to Develop,
  repository dirt blocks record completion, collateral repairs rerun only
  affected validators, and no Review path calls the Test executor.

- [ ] **Step 3: Run focused tests and confirm failures**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/implementation-record.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/review-collateral-flow.test.mjs
  ```

  Expected: FAIL because Review still owns code review and delivery gates.

- [ ] **Step 4: Implement collateral-only Review**

  Replace the current Agent Review Gate with implementation-record validation
  for enrolled issues. Preserve legacy behavior only until stage-aware
  enrollment. Human mode asks for record approval after validators pass;
  Full-Auto records the bypass and continues.

- [ ] **Step 5: Run focused and existing Review suites**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/review-collateral-flow.test.mjs scripts/tests/unit/task-tracker/verbs/review*.test.mjs scripts/tests/unit/task-tracker/verbs/approve*.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 6: Commit collateral-only Review**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/verbs/review.mjs scripts/task-tracker/verbs/approve.mjs skill/shared/rules/review.md scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): certify implementation records in Review [#1219]"
  ```

---

### Task 7: Full-Auto close and epic receipt aggregation

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/epic-record.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/close-machine.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/close-runner.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/lib/epic-children-gate.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/epic-record.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/full-auto-close.test.mjs`

**Interfaces:**

- `buildEpicImplementationRecord(input)` consumes terminal child receipt IDs and
  one parent candidate/delivery chain; it never revalidates child code.
- Enrolled Full-Auto issues close when implementation-record validation passes.
- Human mode requires one implementation-record approval.
- Close resumes collateral steps only and cannot call push, merge, rebase, or
  Test execution.

- [ ] **Step 1: Write failing child and epic close tests**

  Prove an unattended child reaches Done, an epic aggregates child receipts,
  missing/nonterminal children block, parent target-boundary CI remains
  required, and repeated close is a no-write success.

- [ ] **Step 2: Write failing partial-close recovery tests**

  Inject failure after timing, projection, disposition, issue close, and binding
  release. Every retry must execute only missing collateral steps and retain the
  same terminal transaction ID.

- [ ] **Step 3: Run focused tests and confirm failures**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/epic-record.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/full-auto-close.test.mjs
  ```

  Expected: FAIL because current close still couples Review authorization and
  delivery.

- [ ] **Step 4: Implement Full-Auto close and epic rollup**

  Keep delivery receipts immutable, derive the parent forest-level record from
  child terminal receipts, and record human-gate bypass separately from
  evidence satisfaction.

- [ ] **Step 5: Run close and epic regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/full-auto-close.test.mjs scripts/tests/integration/task-tracker/lib/evidence-v2/close-flow.test.mjs scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 6: Commit autonomous close and epic aggregation**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/lib/evidence-v2 scripts/task-tracker/lib/epic-children-gate.mjs scripts/task-tracker/verbs/close.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs
  git commit -m "feat(task): close Full-Auto records and epics [#1219]"
  ```

---

### Task 8: Closed-story crossover audits and integrity alarms

**Files:**

- Create: `scripts/task-tracker/lib/assurance/crossover-audit.mjs`
- Create: `scripts/task-tracker/lib/assurance/integrity-signal.mjs`
- Create: `scripts/task-tracker/verbs/audit.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Create: `skill/shared/rules/audit.md`
- Create: `scripts/tests/unit/task-tracker/lib/assurance/crossover-audit.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/assurance/audit-defect-flow.test.mjs`

**Interfaces:**

- `/task audit #N --provider <id>` requires a closed issue and emits a
  read-only provider action over the terminal evidence package.
- Produces append-only `aitm.crossover-audit/v1` records.
- Every actionable finding creates a new linked defect through Task 4's
  idempotent handoff.
- `classifyIntegritySignal(input)` alarms only for critical impact,
  contradicted claims, evidence mismatch/fabrication, or a configured repeated
  provider pattern.

- [ ] **Step 1: Write failing closed-only audit and alarm tests**

  Prove open issues refuse audit, ordinary bugs create defects without alarms,
  the four integrity-signal classes alarm, and no finding changes the audited
  issue's Done state or historical records.

- [ ] **Step 2: Run focused tests and confirm failures**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/assurance/crossover-audit.test.mjs scripts/tests/integration/task-tracker/lib/assurance/audit-defect-flow.test.mjs
  ```

  Expected: FAIL because the assurance surface does not exist.

- [ ] **Step 3: Implement the audit package, record, defect link, and alarm**

  Include issue ancestry, plan, implementation record, marked commits, PR, CI
  references, child receipts, and previous addenda. Keep provider invocation
  outside the delivery state machine.

- [ ] **Step 4: Run focused, command-surface, and issue-link tests**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/assurance/*.test.mjs scripts/tests/integration/task-tracker/lib/assurance/*.test.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 5: Commit retrospective assurance**

  ```bash
  git add scripts/task-tracker/lib/assurance scripts/task-tracker/verbs/audit.mjs scripts/task-tracker/task-tracker.mjs scripts/task-tracker/verbs/help-data.mjs skill/shared/rules/audit.md scripts/tests/unit/task-tracker/lib/assurance scripts/tests/integration/task-tracker/lib/assurance
  git commit -m "feat(task): add closed-story crossover audits [#1219]"
  ```

---

### Task 9: Pilot, telemetry, documentation, and all-open migration

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/telemetry.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/migration.mjs`
- Create: `scripts/task-tracker/verbs/continuous-delivery.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `docs/guides/workflow.md`
- Modify: `skill/shared/rules/test.md`
- Modify: `skill/shared/rules/review.md`
- Modify: `skill/shared/rules/close.md`
- Modify: `docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md`
- Modify: `docs/superpowers/plans/2026-09-02-1219-cloud-test-portfolio-wbs.md`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/migration.test.mjs`
- Create: `scripts/tests/slow/task-tracker/lib/continuous-delivery-pilot.test.mjs`

**Interfaces:**

- `/task continuous-delivery pilot #N` runs the bounded evidence bundle without
  changing the repository default.
- `/task continuous-delivery enroll-open --manifest <path>` validates a
  stage-aware migration manifest, applies idempotent enrollments, and reports
  per-issue results.
- Adds `continuousDelivery.protocol` with allowed values `legacy-body/v1` and
  `continuous-delivery/v1`; after pilot acceptance the default becomes
  `continuous-delivery/v1` for every open issue.
- Telemetry records candidates, CI attempts, reviews, demotions, merges,
  collateral repairs, close retries, audit findings, alarms, and state time.

- [ ] **Step 1: Write failing stage-aware migration tests**

  Cover Backlog-Plan, Develop, Test/open PR, Review/unmerged PR migration
  reclassification, Review/merged PR adoption, Done exclusion, duplicate run,
  unverifiable legacy evidence, and partial manifest recovery.

- [ ] **Step 2: Write the failing pilot evidence test**

  The fixture must produce one CI failure and Develop retry, one successful
  candidate, one flow-review pass, one exact-head merge in Test, one collateral
  repair that does not invalidate Test, one Full-Auto close, and one idempotent
  crash recovery. Assert telemetry reports every cycle.

- [ ] **Step 3: Run focused tests and confirm failures**

  ```bash
  node --test scripts/tests/integration/task-tracker/lib/continuous-delivery/migration.test.mjs scripts/tests/slow/task-tracker/lib/continuous-delivery-pilot.test.mjs
  ```

  Expected: FAIL because enrollment and telemetry do not exist.

- [ ] **Step 4: Implement migration, telemetry, and protocol configuration**

  Require a checked manifest of live issue number, state, PR/merge observation,
  chosen migration action, and evidence disposition. Preserve legacy records as
  history and refuse any row that would invent missing authority.

- [ ] **Step 5: Update workflow, skills, #1219 design, and portfolio WBS**

  Document Test-owned merge, Review's static allowlist, Full-Auto behavior,
  post-close assurance, rollout gates, and the replacement of conflicting
  Tasks 12, 13, 14, 17, and 18 contracts.

- [ ] **Step 6: Run focused and complete repository verification**

  ```bash
  npm run format:check
  npm run lint
  npm test
  npm run test:slow
  ```

  Expected: all commands exit 0.

- [ ] **Step 7: Execute the governed pilot and capture its immutable bundle**

  ```bash
  npx aitm continuous-delivery pilot 1237
  ```

  Expected: output identifies one accepted pilot bundle with candidate,
  trusted-runtime, CI, flow-review, merge, implementation-record, close,
  recovery, and telemetry record IDs. Issue #1237 is the existing governed
  PR-transition child and must be rehydrated from this amendment before use as
  the pilot.

- [ ] **Step 8: Review and apply the all-open migration manifest**

  ```bash
  npx aitm continuous-delivery enroll-open --manifest .tmp/aitm/continuous-delivery-open-issues.json
  ```

  Expected: every open issue reports `enrolled`, `already-enrolled`, or a
  specific refusal requiring correction; no Done issue changes.

- [ ] **Step 9: Commit rollout and documentation**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/verbs/continuous-delivery.mjs scripts/task-tracker/config.mjs scripts/task-tracker/verbs/help-data.mjs docs/guides/workflow.md skill/shared/rules docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md docs/superpowers/plans/2026-09-02-1219-cloud-test-portfolio-wbs.md scripts/tests/integration/task-tracker/lib/continuous-delivery scripts/tests/slow/task-tracker/lib/continuous-delivery-pilot.test.mjs
  git commit -m "feat(task): roll out continuous agent delivery [#1219]"
  ```

## Self-Review Checklist

- [ ] Every normative requirement in the amendment maps to Tasks 1-9.
- [ ] No task lets candidate-controlled lifecycle code authorize itself.
- [ ] No Review path runs Test or changes repository content.
- [ ] Human-gated and Full-Auto paths preserve the same evidence requirements.
- [ ] Crossover audits are closed-only and outside the delivery critical path.
- [ ] Ordinary defects stay quiet while integrity signals alert humans.
- [ ] Epic aggregation uses child receipts and one parent integration cycle.
- [ ] Migration handles every open lifecycle state without rewriting history.
- [ ] Commands, file paths, schemas, and interface names are consistent.
- [ ] The plan contains no unresolved implementation placeholder.
