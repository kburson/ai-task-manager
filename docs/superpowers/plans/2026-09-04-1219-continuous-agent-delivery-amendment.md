# Continuous Agent Delivery Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Test own exact-head hosted verification, canonical flow review,
optional exact-head human PR approval, and delivery to the immediate target;
make Review certify collateral only; and add trusted activation, hierarchical
receipt aggregation, migration, and retrospective assurance.

**Architecture:** Extend the existing evidence-v2 journal and GitHub-record
delivery primitives with a continuous-delivery protocol selected by a digested,
stage-aware enrollment manifest. A runtime-capability-v3 process outside the
candidate worktree is the only gate evaluator and mutation coordinator. The
same target-aware Test delivery service serves root, nested-epic, and child
boundaries; Review and Done consume its immutable receipts without rerunning
code verification.

**Tech Stack:** Node.js 22 ESM, `node:test`, GitHub Actions, GitHub REST and
GraphQL adapters, AITM evidence-v2 journals and projections, provider actions,
GitHub Projects v2, and Markdown workflow skills.

## Planning Authority and Snapshot

- Normative specification:
  `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
  at trunk commit `c6e0ab5f21d469496ae83d85de93c3c48ba2189a`, patch-identical
  to accepted pre-rebase commit `1375edfd4b29c98e407ae428a15f992dbdff2cd6`.
- Specification co-review protocol:
  `c1655cdd-f0c8-48fd-95e3-57af190d9f0c`; reviewer consensus accepted that
  exact spec commit.
- Current implementation snapshot: `origin/trunk` at
  `07984e5137ba53f56fe062a351e5dd4111fb87bd`, including completed #1512.
- The governed `cloud-test-automation` branch is intentionally not rewritten by
  this planning turn. Before production implementation, synchronize it with the
  then-current `origin/trunk` through the governed branch procedure and repin
  the implementation baseline. Do not use this snapshot as authority after
  trunk advances.
- The original #1219 design and portfolio plan remain authoritative except
  where the accepted amendment explicitly overrides lifecycle, review, merge,
  close, assurance, migration, or receipt boundaries.

## Global Constraints

- Test owns required CI, canonical spawned-agent flow review, finding
  disposition, optional human PR approval, expected-head merge, live readback,
  and the delivery receipt. Review owns collateral validation only.
- The canonical flow reviewer runs in every mode after required CI is green. It
  is read-only, sees an immutable clean-context package, and never supplies
  human PR approval.
- Preserve #1512 exactly: `analysisToDevelopment`, `pullRequestReview`, and
  `reviewToDone` remain independent; all default to disabled in Full-Auto.
- When `pullRequestReview=true`, request an eligible non-author, non-bot human
  only after CI and flow review pass. Require that human's latest applicable
  server-authored `APPROVED` review for the exact candidate head. Assignment,
  Agent Review Gate evidence, flow-review evidence, and stale approval are not
  merge authority.
- Candidate-controlled bytes may define product code, fixtures, and declared
  verification commands, but may not evaluate a gate, validate a receipt,
  select a provider mutation, enroll an issue, activate a runtime, or close an
  issue.
- Resolve symlinks before comparing runtime and source roots. Refuse when either
  resolved root contains the other, not only when the paths are equal.
- `aitm.runtime-capability/v2` and `aitm.delivery-receipt/v1` remain readable by
  closed legacy validators. Never extend them in place or accept them as
  authority for an enrolled candidate.
- A new source SHA or tested base SHA creates a new candidate generation and
  retires that candidate's CI, flow-review, human-approval, and merge authority.
- Resolve non-trunk branches only from the latest valid, unambiguous
  `aitm-worktree-location` record. Never synthesize a branch for enrollment.
- Treat literal target refs as opaque. Before enrollment, require PR
  enforcement, strict exact-head required checks, deletion protection, and
  non-fast-forward protection on every real target boundary.
- Enrolled target refs are append-only. Never rebase or force-update the target;
  refresh only the candidate head.
- `merge-back.mjs` remains the child-to-parent entry surface. For enrolled
  issues it delegates to the shared Test service; for legacy issues it preserves
  its current local behavior.
- A collapsed shared-ref epic tier creates no candidate, PR, or delivery
  receipt. It closes only from terminal child receipts plus one bound
  `aitm.no-commit-delivery/v1` authorization.
- Every mutation uses a stable idempotency key, performs live readback, and
  resumes from the first missing durable step. Ambiguous transport stays in the
  current state until live observations resolve it.
- Review may modify GitHub issue and project collateral only. It cannot modify
  repository files, run functional tests, create a candidate, or demote an
  enrolled issue to Develop.
- Crossover audits are human-initiated, closed-only, append-only, and outside
  delivery. They create linked corrective defects without rewriting history.
- #1486 is advisable adapter consolidation, not a prerequisite. This plan must
  work against the current five adapters and the later consolidated form.
- If #1486 is scheduled, its cheapest placement is after A2 establishes the
  recorded-branch contract and before A8 adds two more consumers; it remains
  advisory and does not gate either task.
- Use the sanctioned issue and provider-action paths; no direct use of
  `gh issue create`, shell merge, or fallback mutation may bypass them.
- Use TDD. Each materialized task gets its own governed issue and commits. The
  `[#1219]` commit subjects below are the root-plan fallback; replace that token
  with the materialized child issue number before executing a child plan.

## Decomposition and Post-Acceptance WBS Migration

The amendment is thirteen reviewable units. In this section, `O1` through
`O22` mean tasks in the original cloud Test plan and `A1` through `A13` mean
tasks in this amendment. Do not implement two units in one child merely because
they touch the same orchestration verb.

The live graph checked for this plan has six sub-epics and 22 existing stories.
Issue #1226 is already in Review with accepted work at
`ed9ae834d43fda0b3abf2a8c52cc6394befb1c22`; its body, branch, worktree,
receipts, and approval evidence are immutable migration inputs. Its lifecycle
state is not immutable, but this plan does not enroll #1226 before the protected
pilot. #1226 must finish its already-started legacy Review/delivery path and
reach Done before #1244 enters the pilot; preserve its reviewed O1 work and
evidence throughout that completion. The stage-aware classifier evaluates live
state only during the post-pilot migration; it does not retroactively assign
Issue #1226's planning-time snapshot to `review-to-test`. If #1226 is still
Review with an unmerged PR at the pilot gate, stop and amend the execution
schedule rather than using it as an enrolled delivery before the pilot. The six
reusable stories below are still unused in Backlog. Revalidate those facts
immediately before migration; if any reusable story has acquired implementation
or moved out of Backlog, stop and amend this mapping instead of overwriting its
work.

| Original contract | Exact disposition                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| O1-O11            | Retain #1226-#1236; O11's Actions receipt is validation evidence, not the new delivery receipt |
| O12 / #1237       | Replace in place with A3, candidate generation, Test entry, PR adoption, and hosted CI         |
| O13 / #1238       | Replace in place with A4, canonical clean-context flow review                                  |
| O14 / #1239       | Replace in place with A5, finding disposition, adjudication, and governed defects              |
| O15 / #1240       | Retain; A8 extends its literal-ref protection contract                                         |
| O16 / #1241       | Retain; its freezes consume A3's immediate-target candidate identity                           |
| O17 / #1242       | Replace in place with A7, Test-owned expected-head merge and delivery receipt v2               |
| O18 / #1243       | Replace in place with A8, hierarchical delivery, protected opaque refs, and merge-back         |
| O19-O21           | Retain #1244-#1246; consume A7 delivery observations and A12 telemetry                         |
| O22 / #1247       | Replace in place with A13, protected pilot evidence, documentation, and default rollout        |

### Acceptance-to-implementation migration gate

This gate is root-orchestrator planning work, not A13 implementation. Run it
only after this plan has independent accepted review evidence and before any
A1-A12 implementation begins. The planning review itself authorizes no issue,
project, branch, or remote mutation.

1. Record the accepted amendment-plan commit as `PLAN_SHA`, refresh the live
   #1219 graph and all 29 intended child contracts, and re-prove the reuse and
   #1226 invariants above.
2. Create exactly seven new governed sub-issues with the sanctioned issue
   creator. For each A1, A2, A6, and A9-A12 row, prepare
   `.scratch/aitm/1219-amendment-migration/<amendment-task>/` containing
   `user-story.md`,
   `scope.md`, `acceptance-criteria.md`, `story-origin.md`,
   `plan-metadata.md`, and `verification-commands.md`. Populate `TITLE` and
   `PARENT` from the Seven new children table, then render and create each body
   through the exact CLI contract:

   ```bash
   A_TASK=A1
   FRAGMENTS=".scratch/aitm/1219-amendment-migration/$A_TASK"
   npx aitm preflight-issue --shape sub-issue --user-story-file "$FRAGMENTS/user-story.md" --scope-file "$FRAGMENTS/scope.md" --ac-file "$FRAGMENTS/acceptance-criteria.md" --story-origin-file "$FRAGMENTS/story-origin.md" --plan-metadata-file "$FRAGMENTS/plan-metadata.md" --verification-commands-file "$FRAGMENTS/verification-commands.md" --parent "$PARENT" > "$FRAGMENTS/body.md"
   npx aitm create-issue --title "$TITLE" --body-file "$FRAGMENTS/body.md" --parent "$PARENT"
   ```

   Capture the emitted issue number after every successful create before
   proceeding. Creation deliberately leaves Priority, Size, Estimate, and start
   time unset while each new child remains in Backlog. Before work begins on a
   new child, refine it through the sanctioned
   `npx aitm refine <created-id> --size <XS|S|M|L|XL> --estimate <hours> --priority <p0|p1|p2> --rank <N> --reason "<approved reason>"`
   path using then-current, human-approved values; do not invent estimates in
   this migration gate. Its Backlog-to-Refine transition stamps Start Time
   through the existing governed entry hook. Do not run generic
   `split-plan --confirm`, because it would try to materialize all thirteen
   amendment sections instead of preserving the six mapped issues.

3. After the seven issue numbers exist, update the portfolio WBS with those
   exact IDs. Replace the affected contiguous child ranges with explicit child
   ID enumerations because the seven new issues will not be contiguous with
   #1226-#1247. Commit the WBS-only migration with `[#1219]` and record that
   commit as `WBS_SHA`.
4. Through fresh-base governed issue-body operations, repoint #1219, the
   affected sub-epics, the six reused stories, the seven new stories, and the
   retained stories whose dependency contract changes to `PLAN_SHA` and
   `WBS_SHA`. Preserve every issue's history, parent edge, labels, estimation
   evidence, and current state during this WBS/body migration. Do not alter
   #1226's body, branch, worktree, receipts, approval evidence, or accepted
   implementation bytes.
5. Record the stable relative rank order below, preserving the relative order
   of all 22 existing stories while inserting each new prerequisite immediately
   before its first dependent. Assign each new child's actual numeric Rank when
   that child enters Refine, using its required `npx aitm refine` transaction
   and the then-current live board. Replace every title reference with the
   created issue number before persisting dependencies.
6. Run the root decomposition check, validate each sub-epic's child bijection,
   and prove there are six unique sub-epics and 29 uniquely owned stories:

   ```bash
   npx aitm decompose-check 1219 --plan docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md --json
   ```

   A1 may begin only after all checks pass, the issue bodies read back exactly,
   and A1 has completed Refine with approved Priority, Size, Estimate, Rank, and
   start time. Apply the same Refine prerequisite to each later new child.

### Existing-story reuse and dependency rewrite

| Issue | New owner | Parent | Exact direct dependencies after migration            |
| ----- | --------- | ------ | ---------------------------------------------------- |
| #1237 | A3        | #1223  | A1, A2, #1234, #1235, #1236                          |
| #1238 | A4        | #1223  | #1237                                                |
| #1239 | A5        | #1223  | #1238                                                |
| #1242 | A7        | #1224  | A1, A2, #1237, #1238, #1239, A6                      |
| #1243 | A8        | #1224  | A2, #1240, #1241, #1242                              |
| #1247 | A13       | #1225  | current #1226-#1244 set plus all seven new issue IDs |

A13 intentionally does not depend on #1245 or #1246: their O20/O21 measurement
outcomes remain measurement-gated follow-ons and do not block protocol-default
rollout. Their ranks remain before #1247 so their original relative order is
preserved without turning their results into A13 prerequisites.

Every direct dependency in the A13 row means terminal Done/closed, not merely
enrolled or reclassified. Consequently #1226 completes through its existing
legacy path before the pilot, #1244 reaches Done through the accepted pilot
bundle, and Task 13's all-open migration sees #1226 as `done-noop` rather than
using it as a pre-pilot `review-to-test` candidate.

The following retained contracts also lose an old semantic dependency and must
be rewritten. #1241 replaces its O13 dependency on #1238 with A3 at #1237;
Issue #1244 replaces its O13 dependency on #1238 with A12 while retaining #1230;
issue #1245 retains #1242 and adds A12; and #1246 retains #1242, adds #1226's fresh
baseline and A12, and keeps its measurement gate. No other retained story
dependency changes. #1244 also becomes the named non-foundational pilot: after
A12 activation, its preserved O19 implementation is the first enrolled
delivery and must exercise the deliberate failure/retry and accepted-bundle
path before A13 starts.

### Seven new children

| Amendment task | Exact title                                              | Parent | Direct dependencies                                   |
| -------------- | -------------------------------------------------------- | ------ | ----------------------------------------------------- |
| A1             | Runtime capability v3 and isolated execution root        | #1223  | #1512 present in the synchronized implementation base |
| A2             | Stage-aware enrollment and literal target authority      | #1223  | A1                                                    |
| A6             | #1512-compatible human PR approval bridge                | #1224  | #1237, #1238, #1239                                   |
| A9             | Collateral-only Review and implementation record         | #1224  | #1242, #1243                                          |
| A10            | Review authorization, idempotent close, epic aggregation | #1224  | #1243, A9                                             |
| A11            | Closed-story crossover assurance and integrity alarms    | #1225  | #1239, A10                                            |
| A12            | Stage-aware migration, runtime activation, telemetry     | #1225  | A1, A2, #1237-#1239, A6, #1242, #1243, A9, A10        |

### Root and sub-epic contract changes

- #1219 continues to own the same six ranked sub-epics, but its WBS and child
  count change from 22 to 29 stories and its authority becomes the original
  plan plus this accepted amendment.
- #1220 retains O1-O3 exactly. In particular, #1226 completes its existing
  legacy Review/delivery path before the protected pilot without invalidating
  or reopening its completed and reviewed O1 work.
- #1221 retains O4-O6 and O9-O10 exactly; #1222 retains O7-O8 exactly.
- #1223 changes from O11-O14 to O11 plus A1-A5: #1236 remains O11, #1237-#1239
  become A3-A5, and new A1-A2 are attached here.
- #1224 changes from O15-O18 to O15-O16 plus A6-A10: #1240-#1241 remain
  O15-O16, #1242-#1243 become A7-A8, and new A6, A9, and A10 are attached here.
- #1225 changes from O19-O22 to O19-O21 plus A11-A13: #1244-#1246 remain
  O19-O21, #1247 becomes A13, and new A11-A12 are attached here.

The rank order is #1226-#1236, A1, A2, #1237-#1239, #1240, #1241, A6,
then #1242, #1243, A9, A10, A11, A12, and #1244-#1247. This is topological for every
declared edge and keeps every existing story in its current relative order.

```text
1 trusted runtime
  -> 2 enrollment and literal target authority
     -> 3 candidate, PR, CI, and parking
        -> 4 flow review
           -> 5 finding disposition
              -> 6 #1512 human-code-review bridge
                 -> 7 Test merge and delivery receipt
                    -> 8 hierarchy and merge-back
                       -> 9 collateral Review
                          -> 10 close and epic aggregation
                             -> 11 crossover assurance
1-10 -> 12 migration, activation, and telemetry
1-12 -> 13 protected pilot evidence, docs, and default rollout
```

---

### Task 1: Runtime capability v3 and isolated execution root

**Prerequisites:** The implementation branch is synchronized with the pinned
`origin/trunk` snapshot so #1512's three independent gate controls are present.

**Files:**

- Modify: `scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/execution-context.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/runtime-adapter.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/runtime-root.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/runtime-root.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/runtime-capabilities.test.mjs`

**Interfaces:**

- Preserve `buildRuntimeCapability()` and `validateRuntimeCapability()` as the
  closed v2 compatibility surface.
- Produce `buildRuntimeCapabilityV3(input)`,
  `validateRuntimeCapabilityV3(value, expectations)`, and
  `validateRuntimeCapabilityAny(value, expectations)`.
- Produce `resolveContinuousDeliveryRoot({ toolRoot, sourceRoot,
authorityRoot, materializationPolicy })` returning resolved non-overlapping
  roots plus `executionRootDigest`.

- [ ] **Step 1: Write failing v2/v3 and root-containment tests**

  ```js
  const capability = buildRuntimeCapabilityV3({
    authorityHostId,
    providerMode: 'live',
    toolDigest,
    commandCatalogDigest,
    executionRootDigest,
    materializationPolicyDigest,
    entries: ['approve', 'close', 'deliver', 'evidence', 'reopen', 'review', 'test', 'verify'],
    protocolVersions: ['continuous-delivery/v1'],
    schemaVersions: [
      'aitm.delivery-candidate/v1',
      'aitm.flow-review/v1',
      'aitm.delivery-receipt/v2',
      'aitm.implementation-record/v1',
      'aitm.runtime-activation/v1',
      'aitm.crossover-audit/v1',
    ],
  });
  assert.equal(capability.schema, 'aitm.runtime-capability/v3');
  assert.throws(
    () => resolveContinuousDeliveryRoot({ toolRoot: sourceRoot, sourceRoot, authorityRoot }),
    /runtime-root-overlap/
  );
  assert.equal(validateRuntimeCapabilityAny(legacyV2).schema, 'aitm.runtime-capability/v2');
  ```

  Also build a hostile candidate fixture that plants a modified lifecycle-
  authorization module beneath `sourceRoot`. Assert that
  `resolveContinuousDeliveryRoot()` and `runtime-adapter.mjs` load the trusted
  `toolRoot` module, never execute the candidate copy, and reject a capability
  or authority receipt minted by that candidate copy under
  `validateRuntimeCapabilityV3()`.

- [ ] **Step 2: Run the focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/runtime-root.test.mjs scripts/tests/integration/task-tracker/lib/runtime-capabilities.test.mjs
  ```

  Expected: FAIL because v3 and resolved containment validation do not exist.

- [ ] **Step 3: Implement the strict successor without widening v2**

  V3 must digest the immutable root manifest, materialization policy, command
  catalog, and continuous-delivery schema inventory. `runtime-adapter.mjs`
  builds v3 only from the trusted tool root; it must never import candidate
  modules to decide authority.

- [ ] **Step 4: Run focused plus evidence-v2 compatibility tests**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/runtime-root.test.mjs scripts/tests/unit/task-tracker/lib/evidence-v2/*.test.mjs scripts/tests/integration/task-tracker/lib/runtime-capabilities.test.mjs
  ```

  Expected: PASS, including unchanged v2 fixtures.

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/task-tracker/lib/evidence-v2 scripts/task-tracker/lib/continuous-delivery/runtime-root.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery/runtime-root.test.mjs scripts/tests/integration/task-tracker/lib/runtime-capabilities.test.mjs
  git commit -m "feat(runtime): add isolated delivery capability v3 [#1219]"
  ```

---

### Task 2: Stage-aware enrollment and literal target authority

**Prerequisites:** Task 1.

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/enrollment-manifest.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/target-authority.mjs`
- Modify: `scripts/task-tracker/lib/issue-worktree-location.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/migration.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/enrollment.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/enrollment-manifest.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/enrollment-authority.test.mjs`

**Interfaces:**

- Produce `resolveRecordedBranch(body)` that returns the latest unique valid
  branch record or refuses; it has no canonical fallback.
- Produce `buildEnrollmentManifest(observation)` and
  `validateEnrollmentManifest(manifest, liveObservation)` for
  `aitm.continuous-delivery-enrollment/v1`.
- Produce `classifyDeliveryBoundary({ issueBranch, parentBranch, trunkRef })`
  returning `real-boundary` or `collapsed-shared-ref` and the literal target.

- [ ] **Step 1: Write failing recorded-branch and boundary tests**

  Cover no marker, malformed marker, same-timestamp ambiguity, an opaque
  `cloud-test-automation` ref, child-to-parent targeting, nested epic targeting,
  root-to-trunk targeting, and equal nested/parent refs.

  ```js
  assert.deepEqual(
    classifyDeliveryBoundary({
      issueBranch: 'cloud-test-automation',
      parentBranch: 'cloud-test-automation',
      trunkRef: 'trunk',
    }),
    {
      kind: 'collapsed-shared-ref',
      headRef: 'cloud-test-automation',
      targetRef: 'cloud-test-automation',
    }
  );
  assert.throws(() => resolveRecordedBranch(bodyWithoutMarker), /recorded-branch-missing/);
  ```

- [ ] **Step 2: Write failing manifest freshness tests**

  Pin issue/parent bodies, lifecycle state, PR observation, target head and
  protection digest, runtime capability digest, migration action, and evidence
  disposition. Prove byte-different manifests for one generation conflict and
  later collateral cannot reclassify an existing generation. At enrollment,
  independently remove PR enforcement, strict exact-head required checks,
  deletion protection, and non-fast-forward protection from a literal target;
  assert that each missing protection produces a stable refusal before any
  enrollment record or projection is written. Task 8 later audits the same
  protections across the hierarchy but is not the first enforcement point.

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/enrollment-manifest.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/enrollment-authority.test.mjs
  ```

- [ ] **Step 4: Implement fail-closed enrollment**

  `enrollIssue()` must reread live predicate sources under the authority lock,
  compare the digest immediately before each write, append the enrollment
  record before its projection, and use only runtime capability v3. Preserve
  legacy evidence as imported history, never as new authority.

- [ ] **Step 5: Run focused and legacy-enrollment regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/enrollment-manifest.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/enrollment-authority.test.mjs scripts/tests/integration/task-tracker/lib/evidence-v2/legacy-enrollment.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/lib/issue-worktree-location.mjs scripts/task-tracker/lib/evidence-v2/migration.mjs scripts/task-tracker/lib/evidence-v2/enrollment.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): pin continuous-delivery enrollment authority [#1219]"
  ```

---

### Task 3: Candidate generation, Test entry, PR adoption, and hosted CI

**Prerequisites:** Tasks 1-2 and the original #1219 plan's production-CI and
Actions-receipt work (original Tasks 9-11).

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/candidate.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/test-entry.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/ci-disposition.mjs`
- Create: `scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/candidate.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/test-entry-ci.test.mjs`

**Interfaces:**

- Produce and validate `aitm.delivery-candidate/v1` exactly as specified.
- `candidateLogicalKey({ issueNumber, generation })` returns
  `issue:${issueNumber}:candidate:${generation}`.
- `planTestEntry(input)` returns `reuse-pr`, `create-pr`, or `refuse`.
- `classifyCiConclusion(input)` returns `accepted`, `develop-rework`, or
  `reconcile-live`.

- [ ] **Step 1: Write failing candidate and PR-transition tests**

  ```js
  const candidate = createDeliveryCandidate({
    candidateId,
    generation: 3,
    issueNumber: 1219,
    repository: 'kburson/ai-task-manager',
    sourceSha: 'a'.repeat(40),
    baseSha: 'b'.repeat(40),
    headRef: 'feature/child/1237',
    targetRef: 'cloud-test-automation',
    prNumber: 1511,
    createdAt: '2026-09-04T15:00:00.000Z',
    runtime: {
      schema: 'aitm.runtime-capability/v3',
      capabilityDigest,
      executionRootDigest,
      protocol: 'continuous-delivery/v1',
    },
  });
  assert.equal(candidateLogicalKey(candidate), 'issue:1219:candidate:3');
  ```

  Cover clean committed tree, governed refresh before freeze, push-with-lease,
  unique exact-head PR reuse, PR creation/readback, wrong target, duplicate PR,
  source/base changes, and collapsed-tier refusal from the PR lane.

- [ ] **Step 2: Write failing CI and parking recovery tests**

  Prove exact-head green, red, cancelled, stale, missing, and transport-unknown
  behavior. A red/cancelled result clears the awaiting-CI lease, appends a
  structured failure, and uses the sanctioned Test-to-Develop transition. An
  unknown result stays in Test and polls live state.

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/candidate.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/test-entry-ci.test.mjs
  ```

- [ ] **Step 4: Implement Test entry and generation-scoped recovery**

  Persist the candidate before releasing local occupancy. Adopt a PR only when
  its source and target exactly match. A new source or base creates the next
  generation and retires all prior candidate-bound authority; it does not
  overwrite prior receipts.

- [ ] **Step 5: Run focused plus Test routing regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/test-entry-ci.test.mjs scripts/tests/unit/task-tracker/verbs/test*.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): open exact-head candidates in Test [#1219]"
  ```

---

### Task 4: Canonical clean-context flow review

**Prerequisites:** Task 3.

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/flow-review-package.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/flow-review-receipt.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/flow-review-action.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/flow-review-receipt.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/flow-review-action.test.mjs`

**Interfaces:**

- `buildFlowReviewPackage(input)` emits deterministic immutable bytes and a
  digest; it excludes author transcript and chain-of-thought.
- `buildFlowReviewReceipt(input)` and `validateFlowReviewReceipt(value,
candidate, reviewPackage)` own `aitm.flow-review/v1`. The validator recomputes
  the expected `issueBodyDigest` and `planDigest` from the immutable package; the
  receipt does not invent a `packageDigest` field.
- `requestFlowReview(input)` emits one read-only fresh-agent provider action for
  every candidate generation.

- [ ] **Step 1: Write failing package isolation and receipt tests**

  Assert the package contains canonical issue and plan revisions, candidate and
  base SHAs, PR metadata/diff, hosted-CI evidence references, repository
  guidance, and protocol version. Reject transcript fields, write capabilities,
  wrong source SHA, wrong digests, duplicate IDs, extra keys, and verdicts
  outside `pass|block|pass-with-defect|uncertain`.

  ```js
  assert.deepEqual(
    Object.keys(receipt).sort(),
    [
      'agentId',
      'candidateId',
      'ciEvidenceIds',
      'completedAt',
      'findings',
      'issueBodyDigest',
      'issueNumber',
      'model',
      'planDigest',
      'protocolVersion',
      'provider',
      'reviewId',
      'schema',
      'sourceSha',
      'verdict',
    ].sort()
  );
  ```

- [ ] **Step 2: Write failing provider-boundary tests**

  Prove the authoring provider spawns a fresh agent with read-only repository
  access, no issue/provider mutation capability, and no inherited conversation.
  Prove the pre-amendment ad hoc implementation reviewer is not also spawned.

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/flow-review-receipt.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/flow-review-action.test.mjs
  ```

- [ ] **Step 4: Implement package, action, receipt readback, and retry**

  Retry a crashed reviewer from the same package digest without changing the
  candidate. Accept no verdict until trusted runtime readback validates exact
  persisted bytes. Store agent/provider/model provenance but make no claim of
  cross-provider independence.

- [ ] **Step 5: Run focused and provider-contract suites**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/flow-review-receipt.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/flow-review-action.test.mjs scripts/tests/integration/task-tracker/lib/evidence-v2/provider-contract.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): add mandatory exact-candidate flow review [#1219]"
  ```

---

### Task 5: Finding disposition, adjudication, and governed defects

**Prerequisites:** Task 4.

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/finding-disposition.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/defect-handoff.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/gh/create-issue.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/finding-disposition.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/defect-handoff.test.mjs`

**Interfaces:**

- `classifyFinding({ finding, acceptanceCriteria })` returns
  `develop-rework`, `linked-defect`, `observation`, `critical-stop`, or
  `adjudicate`.
- `planFindingDisposition(receipt, policy)` returns one deterministic action for
  every finding and the candidate-level merge eligibility.
- `ensureLinkedDefect({ candidateId, finding })` uses logical key
  `(candidateId, findingId)` and the sanctioned defect creator.

- [ ] **Step 1: Write the complete failing decision table**

  Acceptance impact wins over provenance. Test story-introduced blockers,
  pre-existing acceptance blockers, inadequate automated evidence, unrelated
  non-critical defects, optional observations, critical safety/security, and
  uncertain classification.

  ```js
  assert.deepEqual(
    classifyFinding({
      finding: { provenance: 'pre-existing', impact: 'acceptance-blocking' },
      acceptanceCriteria,
    }),
    { action: 'develop-rework', reason: 'acceptance-blocked' }
  );
  ```

- [ ] **Step 2: Write failing adjudication and partial-create recovery tests**

  One uncertain receipt schedules a fresh adjudicator with the immutable
  package plus the structured first finding, not free-form reasoning. Exhausted
  ambiguity parks in Test and alerts; it never silently merges. Recover an
  emitted issue number after tether/link failure and never create duplicates.

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/finding-disposition.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/defect-handoff.test.mjs
  ```

- [ ] **Step 4: Implement dispositions and bounded recovery**

  Blocking findings retire current candidate authority and use the sanctioned
  return to Develop. A linked non-critical defect must be durably created,
  tethered, and linked before merge eligibility. Critical findings block and
  emit the human alarm in the same durable disposition.

- [ ] **Step 5: Run focused plus issue-creation regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/finding-disposition.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/defect-handoff.test.mjs scripts/tests/unit/task-tracker/lib/create-issue-*.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/verbs/test.mjs scripts/gh/create-issue.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): disposition Test review findings [#1219]"
  ```

---

### Task 6: #1512-compatible human PR approval bridge

**Prerequisites:** Tasks 3-5 and #1512's implementation on the synchronized
trunk baseline.

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/merge-authorization.mjs`
- Modify: `scripts/task-tracker/lib/manual-code-review.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/merge-authorization.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs`
- Consume unchanged: `scripts/task-tracker/lib/gate-resolve.mjs`
- Consume unchanged: `scripts/task-tracker/lib/session-store.mjs`
- Consume unchanged: `scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs`

**Interfaces:**

- `resolveMergeAuthorization({ candidate, ciReceipt, flowReviewReceipt,
pullRequestReview, pullRequest, reviewerLogin })` returns `authorized`,
  `request-human`, `wait-human`, or `refused`.
- Reuse #1512's `resolveManualCodeReviewer()` and
  `evaluateManualCodeReview()` as the only human PR-review policy.
- Record a stable `humanApprovalId` only for the eligible human's exact-head
  server review; flow-review IDs remain separate.

- [ ] **Step 1: Write failing ordering and independence tests**

  Cover all eight combinations of the three human gates. Prove the Plan gate
  affects only Plan-to-Develop, the code gate affects only pre-merge Test, and
  the task gate affects only Review-to-Done. All combinations retain CI and
  flow review.

- [ ] **Step 2: Write failing human-review freshness tests**

  ```js
  assert.deepEqual(resolveMergeAuthorization(fullAutoInput), {
    status: 'authorized',
    mode: 'full-auto',
    humanApprovalId: null,
  });
  assert.equal(
    resolveMergeAuthorization({ ...manualInput, flowReviewReceipt: null }).status,
    'refused'
  );
  assert.equal(resolveMergeAuthorization(staleApprovalInput).status, 'wait-human');
  ```

  Also reject assignment-only evidence, PR author, bots, dismissed/latest
  changes-requested review, wrong head, unreadable pagination, flow-review
  substitution, and Agent Review Gate substitution.

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/merge-authorization.test.mjs scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs
  ```

- [ ] **Step 4: Move the #1512 bridge into Test without redefining it**

  Request the reviewer only after required CI and flow review are both valid.
  Emit no delivery intent or merge action while awaiting approval. On re-entry,
  reread live reviews and bind approval to the current candidate; a new
  generation retires it. `deliver.mjs` remains a compatibility entry and may
  not reintroduce a Review-stage request.

- [ ] **Step 5: Run focused and existing gate regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/merge-authorization.test.mjs scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs scripts/tests/unit/task-tracker/lib/auto-mode.test.mjs scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery/merge-authorization.mjs scripts/task-tracker/lib/manual-code-review.mjs scripts/task-tracker/verbs/test.mjs scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery/merge-authorization.test.mjs scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs
  git commit -m "feat(task): preserve exact-head human code review in Test [#1219]"
  ```

---

### Task 7: Test-owned expected-head merge and delivery receipt v2

**Prerequisites:** Tasks 1-6.

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/delivery-receipt-v2.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/delivery-service.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/test-merge-machine.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/delivery.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/record-schema.mjs`
- Modify: `scripts/task-tracker/lib/delivery-provider-action.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/delivery-receipt-v2.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/test-merge-flow.test.mjs`

**Interfaces:**

- `planTestMerge(input)` requires candidate, exact-head CI, exact-head flow
  review, completed dispositions, optional exact-head human approval, literal
  target authority, and runtime capability v3.
- `runEnrolledDelivery(input, ports)` emits the existing sanctioned
  `github.merge-pull-request` provider action and reconciles live readback.
- `buildDeliveryReceiptV2(input)` and `validateDeliveryReceiptV2(value)` own
  `aitm.delivery-receipt/v2` with logical key `candidateId`.

- [ ] **Step 1: Write failing strict receipt-schema tests**

  ```js
  const receipt = buildDeliveryReceiptV2({
    receiptId,
    candidateId,
    issueNumber: 1219,
    sourceSha,
    testedBaseSha,
    headRef,
    targetRef,
    targetHeadShaBeforeMerge,
    expectedTargetHeadSha,
    mergeSha,
    mergeMethod: 'squash',
    prNumber: 1511,
    ciEvidenceIds,
    flowReviewId,
    humanApprovalId: null,
    runtimeCapabilityId,
    mergedAt,
    readBackAt,
  });
  assert.equal(receipt.schema, 'aitm.delivery-receipt/v2');
  ```

  Reject omitted/extra fields, wrong source/base/target/pre-head/expected-head,
  stale evidence, invalid runtime, and a v1 receipt offered as enrolled
  authority.

- [ ] **Step 2: Write failing merge and ambiguity recovery tests**

  Prove exact provider-action bytes, expected head, target pre-head, merge
  method, attribution, already-merged convergence, stale target, conflict,
  expected-head rejection, timeout with unknown result, and crash after provider
  success but before receipt append.

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/delivery-receipt-v2.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/test-merge-flow.test.mjs
  ```

- [ ] **Step 4: Implement the Test transaction**

  Append intent before mutation. After the provider action, reread the PR,
  literal target ref, and resulting commit; append the receipt only when every
  observed field matches. Commit trailers are corroboration only. Transition
  to Review only after receipt readback. Conflict or proven stale authority
  returns to Develop; ambiguous transport remains in Test.

- [ ] **Step 5: Run focused and current delivery regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/*.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/test-merge-flow.test.mjs scripts/tests/integration/task-tracker/lib/evidence-v2/delivery-flow.test.mjs scripts/tests/unit/task-tracker/lib/delivery-*.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/lib/evidence-v2 scripts/task-tracker/lib/delivery-provider-action.mjs scripts/task-tracker/verbs/test.mjs scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): merge exact candidates and issue receipt v2 in Test [#1219]"
  ```

---

### Task 8: Hierarchical delivery, protected opaque refs, and merge-back

**Prerequisites:** Tasks 2 and 7 plus the original #1219 plan's target
protection and freeze work (original Tasks 15-16).

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/hierarchical-delivery.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/collapsed-tier.mjs`
- Modify: `scripts/task-tracker/merge-back.mjs`
- Modify: `scripts/task-tracker/lib/resolve-epic-lineage.mjs`
- Modify: `scripts/task-tracker/lib/no-commit-delivery-record.mjs`
- Create: `scripts/gh/audit-ci-rulesets.mjs`
- Create: `docs/operations/cloud-test-ruleset-migration.md`
- Create: `scripts/tests/unit/gh/audit-ci-rulesets.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/hierarchical-delivery.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/merge-back.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/enrolled-merge-back.test.mjs`

**Interfaces:**

- `resolveImmediateTarget(enrollment)` returns only the literal target and
  boundary classification already frozen in enrollment.
- `runEnrolledMergeBack(input, ports)` delegates to Task 7's
  `runEnrolledDelivery`; it does not duplicate Git, test, or merge policy.
- `validateCollapsedTier({ enrollment, childReceipts,
noCommitDeliveryRecord })` returns an aggregation input or refuses.

- [ ] **Step 1: Write failing nested-boundary tests**

  Cover child to recorded epic, nested epic to recorded parent, root to trunk,
  opaque `cloud-test-automation`, same-ref collapsed tier, missing child head
  branch, target advance, sibling isolation, and a later issue-body branch edit
  that cannot change the enrolled generation.

- [ ] **Step 2: Write failing merge-back compatibility tests**

  Enrolled merge-back must use PR, hosted CI, flow review, optional human
  approval, expected-head merge, and receipt readback; it runs no local
  functional suite and performs no cleanup until receipt persistence succeeds.
  Legacy merge-back retains its existing rebase/test/fast-forward path.

- [ ] **Step 3: Write failing literal protection tests**

  Audit each literal target for PR enforcement, strict exact-head required
  checks, deletion protection, and non-fast-forward protection. Prove pattern
  coverage alone does not authorize an opaque ref. The audit remains read-only;
  exported deltas require explicit authenticated-maintainer approval before
  application.

- [ ] **Step 4: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/hierarchical-delivery.test.mjs scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/enrolled-merge-back.test.mjs scripts/tests/unit/gh/audit-ci-rulesets.test.mjs
  ```

- [ ] **Step 5: Implement the shared service and collapsed lane**

  Enrolled targets advance only by merge/fast-forward and are never rebased or
  force-updated. A collapsed tier emits no candidate/PR/delivery receipt; it
  validates terminal child receipts targeting the shared ref and an existing
  no-commit authorization. Implement against current adapters; #1486 may later
  consolidate them without changing this interface.

- [ ] **Step 6: Run focused plus epic-tree regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/hierarchical-delivery.test.mjs scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/enrolled-merge-back.test.mjs scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/merge-back.mjs scripts/task-tracker/lib/resolve-epic-lineage.mjs scripts/task-tracker/lib/no-commit-delivery-record.mjs scripts/gh/audit-ci-rulesets.mjs docs/operations/cloud-test-ruleset-migration.md scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/unit/task-tracker/merge-back.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery scripts/tests/unit/gh/audit-ci-rulesets.test.mjs
  git commit -m "feat(task): preserve target-aware nested delivery [#1219]"
  ```

---

### Task 9: Collateral-only Review and implementation-record receipt

**Prerequisites:** Tasks 7-8.

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/implementation-record.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/collateral-validation.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/verbs/approve.mjs`
- Modify: `scripts/task-tracker/lib/review-preflight.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/implementation-record.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/review-collateral-flow.test.mjs`

**Interfaces:**

- `buildImplementationRecord(input)` and
  `validateImplementationRecord(value, enrollment)` own
  `aitm.implementation-record/v1`.
- `validateReviewCollateral(input)` returns stable failing validator keys and
  an issue/project digest; it exposes no functional command runner.
- Real boundaries and collapsed tiers use the exclusive field variants from
  the specification.

- [ ] **Step 1: Write failing strict record-variant tests**

  Real-boundary records require source SHA, merge SHA, delivery receipt ID, and
  flow-review ID with a null no-commit ID. Collapsed records require those four
  fields null, a non-null no-commit ID, and non-empty terminal child receipt
  IDs. Reject hybrid or empty variants.

- [ ] **Step 2: Write failing Review boundary tests**

  Prove Review requires verified immediate-target delivery, rejects repository
  changes, cannot demote an enrolled issue to Develop, cannot run Test commands,
  and replaces code-oriented Agent Review Gate work with structural collateral
  validators. A collateral repair invalidates only the implementation-record
  receipt and reruns only affected static validators.

  ```js
  assert.deepEqual(validateReviewCommand(['npm', 'test']), {
    allowed: false,
    reason: 'review-functional-command-forbidden',
  });
  ```

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/implementation-record.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/review-collateral-flow.test.mjs
  ```

- [ ] **Step 4: Implement record-only Review**

  Permit issue/project projection repair, citations, outcomes, estimates,
  exceptions, ancestry, and child rollups only. If repository work is needed,
  preserve the truthful delivered record and create a linked corrective defect;
  do not reopen the candidate loop.

- [ ] **Step 5: Run focused and existing Review regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/implementation-record.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/review-collateral-flow.test.mjs scripts/tests/unit/task-tracker/lib/review-*.test.mjs scripts/tests/unit/task-tracker/verbs/review*.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/verbs/review.mjs scripts/task-tracker/verbs/approve.mjs scripts/task-tracker/lib/review-preflight.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): certify collateral implementation records [#1219]"
  ```

---

### Task 10: Review authorization, idempotent close, and epic aggregation

**Prerequisites:** Tasks 8-9.

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/epic-record.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/close-machine.mjs`
- Modify: `scripts/task-tracker/lib/evidence-v2/close-runner.mjs`
- Modify: `scripts/task-tracker/lib/epic-children-gate.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/epic-record.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/close-flow.test.mjs`

**Interfaces:**

- `resolveImplementationRecordAuthorization({ reviewToDone, humanEvidence,
bypassEvidence, record })` preserves #1512's task-review gate.
- `buildEpicImplementationRecord(input)` aggregates immutable terminal child
  receipt IDs and either a real parent delivery chain or collapsed-tier
  no-commit authorization.
- Close consumes only durable delivery/implementation records and collateral
  transaction state.

- [ ] **Step 1: Write failing Full-Auto and manual-task-review tests**

  `reviewToDone=false` closes after record validation without a prompt;
  `reviewToDone=true` requires existing exact-record human task approval. Code
  approval never satisfies task review, and task approval never satisfies code
  approval.

- [ ] **Step 2: Write failing epic and partial-close recovery tests**

  Prove missing/nonterminal children block; child suites are never replayed;
  a real upward boundary requires its own delivery receipt; a collapsed tier
  requires child receipts plus no-commit authority. Inject failure after every
  collateral step and prove retry resumes with the same transaction ID.

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/epic-record.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/close-flow.test.mjs
  ```

- [ ] **Step 4: Implement record-only terminal convergence**

  Close must not push, merge, rebase, run tests, or manufacture a missing
  receipt. Persist each completed collateral effect before advancing and make a
  fully converged retry a no-write success.

- [ ] **Step 5: Run close and epic regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/epic-record.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/close-flow.test.mjs scripts/tests/integration/task-tracker/lib/evidence-v2/close-flow.test.mjs scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery/epic-record.mjs scripts/task-tracker/lib/evidence-v2/close-machine.mjs scripts/task-tracker/lib/evidence-v2/close-runner.mjs scripts/task-tracker/lib/epic-children-gate.mjs scripts/task-tracker/verbs/close.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery/epic-record.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/close-flow.test.mjs
  git commit -m "feat(task): close delivery records and aggregate epics [#1219]"
  ```

---

### Task 11: Closed-story crossover assurance and integrity alarms

**Prerequisites:** Tasks 5 and 10.

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

- `/task audit #1512 --provider claude` requires a closed issue and a human
  initiation record.
- `buildCrossoverAudit(input)` produces append-only
  `aitm.crossover-audit/v1` evidence without mutating historical records.
- `classifyIntegritySignal(input)` alarms only for critical safety/security,
  contradicted acceptance/test claims, fabricated/missing/wrong-SHA evidence,
  or a configured repeated-provider pattern.

- [ ] **Step 1: Write failing closed-only and evidence-package tests**

  Cover open refusal, closed story and epic packages, ancestry, accepted plan,
  implementation record, source/merge commits, PR/CI evidence, child receipts,
  and earlier addenda.

- [ ] **Step 2: Write failing defect and alarm tests**

  Every actionable finding creates one governed defect linked to audited issue,
  finding ID, source SHA, and merge SHA. Ordinary escaped defects remain quiet;
  each of the four integrity conditions emits an evidence-specific alarm that
  does not infer intent.

- [ ] **Step 3: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/assurance/crossover-audit.test.mjs scripts/tests/integration/task-tracker/lib/assurance/audit-defect-flow.test.mjs
  ```

- [ ] **Step 4: Implement the out-of-band audit transaction**

  Use Task 5's idempotent defect handoff. Never change the audited issue's Done
  state, implementation record, or delivery receipt. Provider failure preserves
  the audit request for bounded retry.

- [ ] **Step 5: Run focused and command-surface regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/assurance/*.test.mjs scripts/tests/integration/task-tracker/lib/assurance/*.test.mjs scripts/tests/integration/task-tracker/verbs/help.test.mjs
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/task-tracker/lib/assurance scripts/task-tracker/verbs/audit.mjs scripts/task-tracker/task-tracker.mjs scripts/task-tracker/verbs/help-data.mjs skill/shared/rules/audit.md scripts/tests/unit/task-tracker/lib/assurance scripts/tests/integration/task-tracker/lib/assurance
  git commit -m "feat(task): add closed-story crossover assurance [#1219]"
  ```

---

### Task 12: Stage-aware migration, runtime activation, and telemetry

**Prerequisites:** Tasks 1-10.

**Files:**

- Create: `scripts/task-tracker/lib/continuous-delivery/migration.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/runtime-activation.mjs`
- Create: `scripts/task-tracker/lib/continuous-delivery/telemetry.mjs`
- Create: `scripts/task-tracker/verbs/continuous-delivery.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/routing.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/continuous-delivery/runtime-activation.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/command-manifest.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/migration.test.mjs`
- Create: `scripts/tests/integration/task-tracker/lib/continuous-delivery/telemetry.test.mjs`
- Create: `scripts/tests/integration/task-tracker/continuous-delivery-pilot.test.mjs`

**Interfaces:**

- `planOpenIssueMigration(live)` returns one of `enroll-before-develop`,
  `enroll-before-test`, `new-candidate-in-test`, `review-to-test`,
  `adopt-merged-review`, or `done-noop`.
- `buildRuntimeActivationV1(input)` binds old/new capability digests, protected
  ref merge evidence, activation time, and authority host.
- `activateRuntime(input, ports)` can be authorized only by the prior active
  runtime on the designated `authorityHostId`.
- `recordDeliveryTelemetry(event)` preserves every attempt and disposition.
- `/task continuous-delivery pilot #N` runs one activated, enrolled pilot and
  emits a compact evidence bundle without changing the repository default.
- `/task continuous-delivery enroll-open --manifest <path>` applies one
  reviewed stage-aware manifest and reports a deterministic result per issue.
- Register `continuous-delivery` through the verb-hub switch, preflight mode,
  route identity, explicit catalog contract, related-command metadata, and help
  reference so `npx aitm continuous-delivery ...` is reachable and the current
  command-manifest parity test stays closed.

- [ ] **Step 1: Write failing stage-row migration tests**

  Cover Backlog-Plan, Develop, Test/open PR, Review/unmerged PR, Review/verified
  merged PR, and Done. A Review-to-Test migration is an explicit one-time
  reclassification, not a Review failure. A fresh generation retires every old
  accepted-head authority. Use a generic preserved accepted commit and evidence
  as the Review/unmerged fixture: the result is `review-to-test`, its existing
  bytes become the first candidate generation, and no Review-failure marker is
  emitted. This fixture proves the post-pilot classifier contract; it does not
  schedule live #1226 mutation. Reject stale or hand-edited manifest rows before
  mutation.

- [ ] **Step 2: Write failing genesis and successor activation tests**

  ```js
  assert.throws(
    () => authorizeActivation({ authorCapability: proposedV3, proposedCapability: proposedV3 }),
    /runtime-self-activation/
  );
  assert.equal(
    authorizeActivation({ authorCapability: incumbentV2, proposedCapability: firstV3 }).mode,
    'genesis-v2-to-v3'
  );
  ```

  The incumbent v2 runtime's only new-protocol authority is the first
  protected-ref activation. It cannot authorize an enrolled candidate.

- [ ] **Step 3: Write failing telemetry completeness tests**

  Record candidate generations, lifecycle cycles, CI attempts/time, flow and
  adjudication attempts, finding classes, linked defects, merges, stale-head
  refusals, recovery, collateral repairs, human approvals/bypasses, close
  retries, crossover findings/alarms, and lifecycle wall time. Never collapse a
  failed or non-cycle attempt out of reports.

  In the end-to-end pilot fixture, prove one hosted-CI failure and Develop
  return, one fresh successful generation, flow-review block or pass, optional
  human-code gate behavior, exact-head merge in Test, receipt readback,
  collateral repair without code-proof invalidation, Full-Auto close, one
  crash-safe retry, and complete telemetry. The pilot command must refuse until
  the selected issue is enrolled under an activated runtime.

- [ ] **Step 4: Run focused tests and confirm RED**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/runtime-activation.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/migration.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/telemetry.test.mjs scripts/tests/integration/task-tracker/continuous-delivery-pilot.test.mjs
  ```

- [ ] **Step 5: Implement migration, activation, and event recording**

  Every migration and activation uses stable operation IDs, append-before-
  projection ordering, live predicate reread, exact readback, and bounded retry.
  `continuousDelivery.protocol` accepts `legacy-body/v1` and
  `continuous-delivery/v1`; do not change the default before Task 13's pilot is
  accepted.

- [ ] **Step 6: Run focused plus evidence-v2 migration regressions**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/continuous-delivery/runtime-activation.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/migration.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery/telemetry.test.mjs scripts/tests/integration/task-tracker/continuous-delivery-pilot.test.mjs scripts/tests/unit/task-tracker/lib/evidence-v2/migration.test.mjs
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add scripts/task-tracker/lib/continuous-delivery scripts/task-tracker/verbs/continuous-delivery.mjs scripts/task-tracker/task-tracker.mjs scripts/task-tracker/config.mjs scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/lib/command-surface/routing.mjs scripts/task-tracker/lib/command-surface/catalog.mjs scripts/tests/unit/task-tracker/lib/continuous-delivery scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/integration/task-tracker/lib/continuous-delivery
  git commit -m "feat(task): add delivery migration and trusted activation [#1219]"
  ```

- [ ] **Step 8: Deliver and activate the runtime before the pilot**

  After A1-A12 are integrated, use the incumbent pre-amendment runtime to
  deliver those bytes to the eligible protected authority ref. Verify the live
  merge and protection readback, then have that incumbent append the first
  `aitm.runtime-activation/v1` record. The proposed v3 runtime cannot author or
  countersign this record. #1244 cannot enter its pilot until the activation
  record validates from the incumbent execution root.

---

### Task 13: Protected pilot evidence, documentation, and default rollout

**Prerequisites:** The acceptance-to-implementation migration gate, Tasks 1-12,
the retained cloud-CI foundation, the activated v3 runtime, and #1244's accepted
pilot bundle.

**Files:**

- Modify: `docs/guides/workflow.md`
- Modify: `docs/guides/settings-guide.md`
- Modify: `scripts/task-tracker/config.mjs`
- Create: `skill/shared/rules/test.md`
- Modify: `skill/shared/rules/review.md`
- Modify: `skill/shared/rules/state-walk.md`
- Modify: `skill/shared/rules/functional-dod.md`
- Modify: `skill/shared/rules/deliver.md`
- Modify: `skill/shared/rules/close.md`
- Modify: `skill/shared/rules/full-auto.md`
- Create: `scripts/tests/unit/task-tracker/core/continuous-delivery-doc.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs`
- Create: `docs/operations/continuous-delivery-pilot.md`

**Interfaces:**

- Consume Task 12's `/task continuous-delivery pilot #N` evidence bundle. The
  migration gate reserves #1244 for this role because its retained O19 scope is
  downstream of A12 and is not a protocol foundation.
- Consume Task 12's `/task continuous-delivery enroll-open --manifest <path>`
  operation with the reviewed
  `.scratch/aitm/continuous-delivery-open-issues.json` manifest.
- The protocol default changes only after pilot acceptance and protected-target
  readiness are both durably recorded.

- [ ] **Step 1: Write failing documentation-contract tests**

  Require exact language for Test-owned merge, collateral-only Review, the
  displaced ad hoc reviewer versus canonical flow reviewer, and all three
  independent #1512 gates. Require rules to prohibit enrolled Review-to-Develop
  demotion and functional tests in Review while retaining the declared legacy
  path.

- [ ] **Step 2: Verify external protection and CI readiness**

  Read #1240's explicit authenticated-maintainer approval, exported ruleset,
  deterministic delta, and no-gap live readback for #1244's literal target.
  Independently verify every exact required context from the non-authoritative
  rehearsal PR. Protection and CI readiness are separate fail-closed
  prerequisites; Task 13 does not recreate or infer either record.

- [ ] **Step 3: Validate the reserved #1244 pilot bundle**

  The root orchestrator runs `npx aitm continuous-delivery pilot 1244` while
  executing #1244, after A12 activation and before A13 begins. Require one
  accepted bundle with the exact candidate/runtime identities, deliberate CI
  failure and fresh successful generation, flow-review result, Test-owned merge,
  Review collateral repair, Full-Auto close, crash-safe retry, and complete
  telemetry. Refuse A13 entry if #1244 was delivered through a legacy path or
  any required bundle field is absent.

- [ ] **Step 4: Apply the reviewed all-open migration manifest**

  ```bash
  npx aitm continuous-delivery enroll-open --manifest .scratch/aitm/continuous-delivery-open-issues.json
  ```

  Expected: every open issue reports `enrolled`, `already-enrolled`, or a stable
  refusal; every Done issue reports `done-noop`. No row invents legacy authority.

- [ ] **Step 5: Change the default only after accepted evidence**

  Set `continuousDelivery.protocol` to `continuous-delivery/v1` only after the
  #1244 pilot bundle, activated runtime, protection readback, CI rehearsal,
  deliberate failure-to-Develop cycle, Test merge, Review repair, Full-Auto
  close, and crash recovery are all durable and validated.

- [ ] **Step 6: Run focused pilot and documentation tests**

  ```bash
  node --test scripts/tests/integration/task-tracker/continuous-delivery-pilot.test.mjs scripts/tests/unit/task-tracker/core/continuous-delivery-doc.test.mjs scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs
  ```

  Expected: PASS with exact IDs for candidate, runtime, CI, flow review,
  delivery, implementation record, close, recovery, and telemetry.

- [ ] **Step 7: Run complete repository verification**

  ```bash
  npm run format:check
  npm run lint
  npm test
  npm run test:slow
  ```

  Expected: all commands exit 0.

- [ ] **Step 8: Commit documentation and rollout records**

  ```bash
  git add docs/guides/workflow.md docs/guides/settings-guide.md docs/operations/continuous-delivery-pilot.md skill/shared/rules scripts/tests/unit/task-tracker/core/continuous-delivery-doc.test.mjs scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs scripts/task-tracker/config.mjs
  git commit -m "docs(task): activate continuous delivery after pilot [#1219]"
  ```

## Spec-to-Plan Coverage Audit

| Accepted specification requirement                                   | Owning task(s)           |
| -------------------------------------------------------------------- | ------------------------ |
| Trusted runtime outside candidate; v3 identity; no self-activation   | 1, 12                    |
| Recorded literal branches and immutable boundary classification      | 2, 8                     |
| Candidate generation, PR entry, hosted CI, awaiting recovery         | 3                        |
| Mandatory clean-context spawned flow review                          | 4                        |
| Acceptance-first finding disposition and bounded adjudication        | 5                        |
| Three independent #1512 gates and exact-head eligible human approval | 6, 10, 13                |
| Test-owned expected-head merge and delivery receipt v2               | 7                        |
| Nested delivery, collapsed tiers, target protection, merge-back      | 2, 7, 8, 10              |
| Collateral-only Review and implementation record                     | 9                        |
| Full-Auto/manual-task close and epic receipt aggregation             | 10                       |
| Closed-only crossover audits and bounded alarms                      | 11                       |
| Recovery and idempotency at every mutation boundary                  | 2-13                     |
| Stage-aware migration, legacy readability, retirement                | 2, 3, 7, 12, 13          |
| Telemetry and service-objective inputs                               | 12, 13                   |
| Child-contract repair before implementation                          | Migration gate           |
| Documentation, protected pilot evidence, all-open rollout            | 13                       |
| #1486 is advisable but not required                                  | 8 and Global Constraints |

## Plan Self-Review Checklist

- [x] Every accepted-spec requirement maps to at least one task in the coverage
      audit.
- [x] Every task owns one independently reviewable deliverable and ends with a
      focused green test plus commit.
- [x] No candidate-controlled module evaluates authority or performs a provider
      mutation.
- [x] Flow review and human PR approval are separate evidence types and neither
      substitutes for the other.
- [x] Test owns CI, review, merge, and receipt; Review owns collateral only.
- [x] Every real target boundary uses literal recorded refs and exact-head
      protection; every collapsed tier uses the no-commit lane.
- [x] `merge-back.mjs` remains the entry path and #1486 is not a prerequisite.
- [x] Runtime v2 and delivery receipt v1 are legacy-readable but never enrolled
      authority.
- [x] Every failure table row has a bounded, idempotent recovery path.
- [x] Commands, paths, schemas, field names, and interfaces are internally
      consistent and contain no unresolved placeholder.
