# Cloud Test Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move authoritative Test-stage verification to parallel GitHub Actions
jobs while preserving bounded Develop feedback, GitHub-record lifecycle
authority, deterministic recovery, and serialized integration per target
branch.

**Architecture:** Keep repository execution, GitHub evidence normalization, and
lifecycle mutation as separate layers. Repository-owned CI helpers discover and
partition tests, enforce budgets, and emit diagnostics without GitHub write
authority. Read-only GitHub adapters normalize native PR, workflow, job, and
step facts. Coordinator-owned cloud-Test services validate those facts and
append existing GitHub-record capsules. The current local sandbox remains
unchanged for `legacy-body/v1`; only `github-records/v1` issues enter the new
cloud path.

**Tech Stack:** Node.js ESM, `node:test`, GitHub Actions, GitHub REST/GraphQL,
Git, npm, existing AITM GitHub-record capsules and singleton projections.

**Governing spec:**
`docs/superpowers/specs/2026-08-10-cloud-test-stage-design.md`

## Global Constraints

- CI permissions remain `contents: read`; CI never receives issue, pull-request,
  or Checks API write authority.
- Native Actions conclusions are machine evidence. Only an active,
  epoch-fenced coordinator may accept that evidence into an issue record.
- `aitm.verification-receipt/v1` and the existing local Test sandbox remain the
  compatibility path for `legacy-body/v1` issues. There is no dual write.
- All cloud evidence is bound to repository ID, PR, target base SHA, exact head
  SHA, workflow/run attempt, policy fingerprints, contract epoch, and authority
  epoch.
- Develop runs direct affected tests only. Lane escalation becomes a cloud
  obligation and never expands into a complete local lane.
- Every execution job has `timeout-minutes: 10`; the repository-controlled
  phase fails at 480 seconds. Fast sections start at 210 seconds pooled and 150
  seconds serial. Slow has no section ceiling until 20 eligible production
  samples establish one.
- Production starts with two Fast shards and the canary-selected two or three
  Slow shards. Do not encode an unmeasured Slow width in production policy.
- Host admission is a machine-wide operational semaphore, not lifecycle
  authority. Across all local clones and sessions, at most six code-changing
  workers are admitted; orchestrators and GitHub-hosted jobs consume no slots.
- Integration is serial per target branch. No repository-wide path lock or
  global merge mutex is introduced.
- `notes.md` is maintainer scratch and must not be edited, staged, or removed.
- Each task starts with a focused failing test, ends with focused green tests,
  and is committed independently. Do not combine external measurement or
  ruleset changes with unrelated code.

## Stable Interfaces

Implement these interfaces instead of parsing console prose:

```js
normalizeCloudTestBaseline({ artifact, provenance });
selectCanarySlowWidth({ runs, expectedHeadSha });

classifySlowImpact({ changedPaths, policy });
assertSlowImpactPolicyComplete({ trackedPaths, policy, exclusions });

resolveTestShard({ lane, shard, discoveredTests, familyPolicy });
verifyExactPartition({ laneManifest, shardManifests, expectedHeadSha, actualHeadSha });
buildFamilyResolutionDigest({ headSha, lane, assignments });

evaluateCiBudget({ policy, job, phase, elapsedMs, sections });
recordCiPhase({ state, phase, startedAt, completedAt, conclusion });
classifyNativeFailure({ run, jobs, steps, diagnostics });

createActionsReceiptV2({ policy, authority, contract, pr, run, jobs, obligations });
validateActionsReceiptV2({ receipt, expected, targetBasePolicy });
actionsValidationKey({ repositoryId, workflowId, runId, attempt, headSha });

planCloudTestTransition({ authority, assignment, contract, pr, head, target });
acceptCloudTestEvidence({ transition, nativeEvidence, records, projections });
evaluateAwaitingCi({ projection, transition, pr, run, authority });

acquireHostWorkerLease({ repository, issue, worker, process, policy });
heartbeatHostWorkerLease({ lease, process });
releaseHostWorkerLease({ lease });
effectiveRunnerConcurrency({ logicalCpuCount, activeLocalWorkers });

acquireIntegrationFreeze({ authority, epic, parentPr, branchHeads, policy });
advanceIntegrationFreeze({ freeze, phase, observedState });
releaseIntegrationFreeze({ freeze, reason, observedState });
deriveFreezeExpiry({ samples, topologyFingerprint });

deriveIntegrationLane({ targetBranch, candidates });
planHeadRefresh({ candidate, targetHead, acceptedReceipt });
buildValidationTrailers({ receiptRecordId, verifiedSha, runId, attempt });
repairPostMergeIntegration({ pr, mergeCommit, records, effectiveFreeze });
```

`validateActionsReceiptV2` returns
`{ ok, reasons, logicalKey, normalizedReceipt }`. All planners return data only;
the calling coordinator supplies the GitHub, Git, record-store, clock, and
process dependencies.

## Checked-In Policy Surfaces

| File                                                         | Authority                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/cloud-test-policy.json`                | Runner profile, job topology, budgets, stable gate names, selected widths, and measurement window |
| `scripts/task-tracker/test-family-policy.json`               | Fixture-family patterns and family-to-shard mapping                                               |
| `scripts/task-tracker/slow-impact-manifest.json`             | Default-deny slow-impact outcomes                                                                 |
| `scripts/task-tracker/slow-impact-inventory-exclusions.json` | Reviewed tracked-tree exclusions; initially `[]`                                                  |
| `.github/workflows/ci.yml`                                   | Native execution and aggregate gate topology                                                      |

The receipt fingerprint covers all five files plus `package.json`,
`package-lock.json`, the test runner, the affected-test selector, and the
receipt validator.

## Rollout Dependencies

| Gate                      | Required before proceeding                                                     |
| ------------------------- | ------------------------------------------------------------------------------ |
| Canary selection          | Tasks 1-2 complete and five accepted paired cold/warm runs recorded            |
| Production Stage 1        | Tasks 2-5 complete with a selected Slow width                                  |
| Required contexts         | Tasks 8-9 green on a canary PR before Task 14 mutates rulesets                 |
| Cloud Test lifecycle      | Tasks 10-12 complete before Task 13 grants WIP exemption                       |
| Parent integration freeze | Selected production topology from Task 2 and lifecycle acceptance from Task 12 |
| Merge tail                | Tasks 12, 14, and 15 complete                                                  |
| One-job Slow target       | Task 19 plus 20 eligible production-shaped cycles                              |
| Ten merges/hour claim     | Task 20 plus measured complete cycles at or below 360 seconds                  |

## Task Interface Map

| Task | Consumes                                                     | Produces                                                                                         |
| ---: | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
|    1 | Timing artifact schema 2                                     | `normalizeCloudTestBaseline`, `selectCanarySlowWidth`, nearest-rank p95, and capacity arithmetic |
|    2 | Task 1 decision primitives                                   | Canary summaries and `cloud-test-policy.json` with selected Slow width and measurement window    |
|    3 | Git changed paths and target-base policy                     | `classifySlowImpact`, completeness audit, and the sole cloud Slow decision                       |
|    4 | `cloud-test-policy.json` budgets                             | `evaluateCiBudget`, phase state, failure manifests, and `classifyNativeFailure`                  |
|    5 | Task 2 selected width and baseline weights                   | `resolveTestShard`, exact partition proof, family hash, and head-specific digest                 |
|    6 | Existing affected selector and receipt v1                    | Direct-only local execution plus a head-bound `develop-cloud-escalation` obligation              |
|    7 | Fleet locks, user-global capacity config, host/process facts | Host lease lifecycle, cloud dispatch result, and runner concurrency input                        |
|    8 | Tasks 2-5 policy/runner outputs                              | Production Stage 1 native execution jobs and immutable diagnostic artifacts                      |
|    9 | Task 8 execution results                                     | Stable native Fast/Slow gate conclusions                                                         |
|   10 | Tasks 3, 5, and 9 native/policy facts                        | Normalized Actions evidence, v2 receipt validation, and deterministic logical key                |
|   11 | Authority, assignment, contract, branch lineage, PR adapter  | Authorized Test transition capsule and `awaiting-ci` projection                                  |
|   12 | Tasks 10-11 plus native Actions facts                        | Accepted `verification-evidence`, repaired evidence projection, and `REVIEW_COMPLETE`            |
|   13 | Task 11 transition and Task 12 terminal result               | Recoverable WIP exemption decision                                                               |
|   14 | Task 9 stable gate names and live rulesets                   | Audited strict protection on `trunk` and `feature/epic/*`                                        |
|   15 | Tasks 2, 12, and 14                                          | Freeze capsule lifecycle, fairness, measurement window, and derived expiry                       |
|   16 | Accepted receipt, approval evidence, Task 15 freeze          | Per-target lane, exact-head merge, trailers, `integration-result`, and crash repair              |
|   17 | Task 16 structured integration failure                       | Authorized rework demotion and receipt invalidation                                              |
|   18 | Task 4 failure classification and native diagnostics         | Bounded triage input and Worker Report                                                           |
|   19 | Production samples and current family policy                 | Weighted Slow scheduler and measurement-gated width reduction                                    |
|   20 | Current `cli.test.mjs` benchmark                             | Shared CLI fixture and measured lower file floor                                                 |
|   21 | Tasks 1-18 operational behavior                              | User/operations documentation and end-to-end regression coverage                                 |

---

## Task 1: Preserve Local Performance Evidence and Add Canary Decision Primitives

**Spec decomposition:** 1 (baseline and decision logic)

**Files:**

- Create: `scripts/task-tracker/tests/fixtures/performance/cloud-test-local-baselines-2026-08-11.json`
- Create: `scripts/task-tracker/lib/cloud-test/performance-baseline.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/performance-baseline.test.mjs`
- Modify: `scripts/run-tests-timing.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/run-tests-timing.test.mjs`

- [ ] Add RED tests that load the ignored Fast and Slow artifact shapes, reject
      missing provenance, preserve null/missing values, reproduce the documented
      aggregate values, and calculate deterministic Slow LPT maxima for widths
      two through five.
- [ ] Add RED boundary tests for `selectCanarySlowWidth`: exact-head partition
      proof required; all cold/warm runs must fit 480-second repository and
      540-second total limits; every warm width-two execution must be at most
      408 seconds; any violation selects width three.
- [ ] Add capacity tests using `floor((C - 4) / H)`: Free admits 3 validations
      at 5 heavy jobs and 2 at 6; Pro admits 7 and 6; a one-job Slow target uses
      4 heavy jobs and admits 9 on Pro; ten such validations require 44 slots.
- [ ] Run:

  ```bash
  node --test scripts/task-tracker/tests/unit/lib/cloud-test/performance-baseline.test.mjs
  ```

  Expected: FAIL because the baseline fixture and implementation do not exist.

- [ ] Normalize the two ignored artifacts into the checked-in fixture. Record
      the exact generated timestamps, SHA-256 values, command-provenance
      limitation, reported host class, per-file timings, and labels identifying
      335-387, 60-90, and 395-477 seconds as estimates.
- [ ] Extend timing serialization so future artifacts include command, commit,
      runner/host profile, lane, and file count without changing schema-2 reads.
- [ ] Implement nearest-rank percentile as `sorted[ceil(0.95 * n) - 1]` but
      refuse a policy p95 when fewer than 20 eligible samples exist.
- [ ] Re-run the two focused tests and expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/run-tests-timing.mjs scripts/task-tracker/lib/cloud-test/performance-baseline.mjs scripts/task-tracker/tests/fixtures/performance/cloud-test-local-baselines-2026-08-11.json scripts/task-tracker/tests/unit/core/run-tests-timing.test.mjs scripts/task-tracker/tests/unit/lib/cloud-test/performance-baseline.test.mjs
  git commit -m "test(ci): preserve cloud test calibration baselines"
  ```

## Task 2: Run the Disposable Cloud Canary and Record the Selected Topology

**Spec decomposition:** 1-2

**Prerequisite:** Task 1

**Files:**

- Create: `.github/workflows/ci-slow-shard-canary.yml`
- Create: `scripts/task-tracker/cloud-test-policy.json`
- Create: `scripts/task-tracker/lib/cloud-test/canary-policy.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/canary-policy.test.mjs`
- Modify: `scripts/task-tracker/lib/ci-workflow-history.mjs`
- Modify: `scripts/task-tracker/tests/slow/core/ci-lane-wiring.test.mjs`

- [ ] Add RED tests proving the canary is `workflow_dispatch` only, uses
      `contents: read`, runs widths two and three against one exact SHA, has
      controlled cold and warm cache jobs, and emits no stable required context.
- [ ] Add RED tests for standalone partition proof: manifest union equality,
      pairwise-empty intersections, missing file, duplicate file, and head
      mismatch.
- [ ] Run the unit and workflow tests; expect FAIL on the missing workflow and
      policy.
- [ ] Implement the canary so a cache-prime job precedes warm-cache candidates,
      cold jobs use a run-unique cache key with no restore key, and both
      candidates emit sorted shard manifests plus phase timings. Include Quality
      and two Fast shards in both cache conditions for calibration.
- [ ] Reject the calibration unless Quality and both Fast shards pass all five
      cold/warm pairs under the provisional 210/150-second Fast section limits,
      480-second repository envelope, and 600-second hard job stop. Record the
      samples without claiming p95.
- [ ] Seed `cloud-test-policy.json` with immutable limits and candidate widths,
      but leave `production.slowWidth` absent until selection. Schema validation
      must reject production fan-out while that field is absent.
- [ ] Commit and push the disposable canary before dispatching it:

  ```bash
  git add .github/workflows/ci-slow-shard-canary.yml scripts/task-tracker/cloud-test-policy.json scripts/task-tracker/lib/cloud-test/canary-policy.mjs scripts/task-tracker/lib/ci-workflow-history.mjs scripts/task-tracker/tests/unit/lib/cloud-test/canary-policy.test.mjs scripts/task-tracker/tests/slow/core/ci-lane-wiring.test.mjs
  git commit -m "ci: add cloud shard calibration canary"
  git push origin cloud-test-automation
  ```

- [ ] Dispatch exactly five runs from one immutable
      head SHA:

  ```bash
  gh workflow run ci-slow-shard-canary.yml --ref cloud-test-automation -f head_sha="$(git rev-parse HEAD)"
  ```

  Repeat only after the prior dispatch is visible. Do not amend or force-push
  the selected head between runs.

- [ ] Download each `cloud-test-canary-summary-${runId}-${attempt}` artifact,
      feed all five summaries to `selectCanarySlowWidth`, and commit the decision
      evidence under
      `scripts/task-tracker/tests/fixtures/performance/cloud-test-canary-selection.json`.
      The code writes `production.slowWidth` as `2` only if every all-run rule
      passes; otherwise it writes `3`. It must not write a Slow section ceiling
      or p95.
- [ ] Open measurement window `cloud-test-bootstrap-1` in the policy with the
      selected width, runner profile, opening commit, family-policy fingerprint,
      and target sample count 20.
- [ ] Re-run the focused tests and `npx prettier --check` on both YAML/JSON files.
- [ ] Commit the selected topology without squashing away the canary evidence:

  ```bash
  git add .github/workflows/ci-slow-shard-canary.yml scripts/task-tracker/cloud-test-policy.json scripts/task-tracker/tests/fixtures/performance/cloud-test-canary-selection.json scripts/task-tracker/lib/cloud-test/canary-policy.mjs scripts/task-tracker/lib/ci-workflow-history.mjs scripts/task-tracker/tests/unit/lib/cloud-test/canary-policy.test.mjs scripts/task-tracker/tests/slow/core/ci-lane-wiring.test.mjs
  git commit -m "ci: record measured cloud shard topology"
  ```

## Task 3: Make Slow Impact a Default-Deny Cloud Authority

**Spec decomposition:** 3

**Files:**

- Create: `scripts/task-tracker/lib/slow-impact-selector.mjs`
- Create: `scripts/task-tracker/slow-impact-manifest.json`
- Create: `scripts/task-tracker/slow-impact-inventory-exclusions.json`
- Create: `scripts/task-tracker/tests/unit/lib/slow-impact-selector.test.mjs`
- Modify: `scripts/task-tracker/test-impact-manifest.json`
- Modify: `scripts/task-tracker/tests/unit/lib/test-impact-selector.test.mjs`

- [ ] Write RED tests for required-over-safe precedence, all-paths-safe skip,
      `unclassified-path`, malformed rules, target-base policy loading, and
      deterministic selector hashes.
- [ ] Add a tracked-tree completeness test using `git ls-files` and an initially
      empty exclusions array. Explicitly cover workflows, package/lock files,
      `scripts/gh/**`, task-tracker verbs/states, lifecycle/evidence gates, both
      selectors, test infrastructure, Slow tests, and shared fixtures.
- [ ] Add a migration test proving every old `lanes: ["slow"]` source resolves
      `slow-required` before removing all Slow lane entries from the old
      manifest. Add a permanent assertion that the affected-test manifest may
      contain only `unit` and `integration` lanes.
- [ ] Run both focused tests; expect FAIL.
- [ ] Implement `classifySlowImpact({ changedPaths, policy })` with one result per
      path, `slow-required` dominance, positive skip reasons, and default denial.
      A skip result is valid only when every path is explicitly safe.
- [ ] Normalize a valid skip as `reason: "no-slow-impact"` with target base/head,
      changed paths, selector version/hash, and `lanes: ["test-slow"]`. Older
      Develop evidence that explicitly requires `test-slow` overrides a safe
      path classification.
- [ ] Re-run the focused tests and expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/slow-impact-selector.mjs scripts/task-tracker/slow-impact-manifest.json scripts/task-tracker/slow-impact-inventory-exclusions.json scripts/task-tracker/test-impact-manifest.json scripts/task-tracker/tests/unit/lib/slow-impact-selector.test.mjs scripts/task-tracker/tests/unit/lib/test-impact-selector.test.mjs
  git commit -m "feat(ci): add default-deny slow impact authority"
  ```

## Task 4: Add Repository-Phase Budgets and Native-First Diagnostics

**Spec decomposition:** 7

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/ci-budget.mjs`
- Create: `scripts/task-tracker/lib/cloud-test/failure-classification.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/ci-budget.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/failure-classification.test.mjs`
- Create: `scripts/ci-budget.mjs`
- Modify: `scripts/run-tests-ceiling.mjs`
- Modify: `scripts/run-tests-report.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/run-tests-ceiling.test.mjs`

- [ ] Write RED boundary tests at 150, 210, 480, and 600 seconds, including a
      green timing artifact with a red native/policy conclusion and explicit
      rejection of any pre-p95 Slow section ceiling.
- [ ] Write RED classification tests for setup, assertion, section budget,
      repository budget, post-test policy, missing manifest, cancellation/stale
      head, hard timeout, and platform outage.
- [ ] Run all three focused test files; expect FAIL.
- [ ] Implement a phase-state file at `.aitm/ci-phase-state.json`. The CLI must
      support `start`, `run --phase install -- npm ci --no-audit --no-fund`, and
      `finish`; it records
      bounded timestamps and checks the aggregate repository phase before and
      after each command.
- [ ] Add lane/shard failure manifests at
      `.aitm/test-failures-${lane}-${shard}.json`. Each entry contains relative
      path, lane, shard, exit status, duration, and explicitly truncated
      stdout/stderr. Timing and failure artifacts are written before clean-tree,
      fleet, or budget verdicts.
- [ ] Keep the GitHub 600-second stop outside repository code. Repository code
      reports `ci-repository-budget-exceeded` with the active phase at 480
      seconds and preserves a more specific section breach when one exists.
- [ ] Encode the deliberate asymmetry in policy validation: Fast requires its
      measured provisional section ceilings; Slow rejects any non-null section
      ceiling until the active measurement window has 20 eligible samples.
- [ ] Re-run the focused tests and expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/ci-budget.mjs scripts/run-tests-ceiling.mjs scripts/run-tests-report.mjs scripts/run-tests.mjs scripts/task-tracker/lib/cloud-test/ci-budget.mjs scripts/task-tracker/lib/cloud-test/failure-classification.mjs scripts/task-tracker/tests/unit/core/run-tests-ceiling.test.mjs scripts/task-tracker/tests/unit/lib/cloud-test/ci-budget.test.mjs scripts/task-tracker/tests/unit/lib/cloud-test/failure-classification.test.mjs
  git commit -m "feat(ci): enforce named repository phase budgets"
  ```

## Task 5: Promote Timing-Balanced Fixture Families into Checked-In Policy

**Spec decomposition:** 8

**Prerequisite:** Task 2 selected the Slow width

**Files:**

- Create: `scripts/task-tracker/test-family-policy.json`
- Create: `scripts/task-tracker/lib/cloud-test/test-family-policy.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/test-family-policy.test.mjs`
- Modify: `scripts/run-tests-lanes.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/run-tests-lanes.test.mjs`

- [ ] Add RED tests for exhaustive family resolution, overlapping patterns,
      missing families, lane mismatch, unknown shard, exact-head mismatch,
      deterministic resolution digest, and a new test inheriting an existing
      family without changing the policy hash.
- [ ] Encode fixture-cohesive families by stable path patterns, not individual
      files. Assign Unit/Integration families to `fast-a` or `fast-b` and Slow
      families to exactly the selected number of `slow-*` shards using the
      baseline timings as weights.
- [ ] Extend the runner with `--shard fast-a`. `laneFiles(lane, { shard,
familyPolicy })` must return only that shard's sorted files and must fail
      if the complete lane cannot be proven exactly once across the policy.
- [ ] Emit `.aitm/test-shard-${lane}-${shard}.json` with head SHA, sorted files,
      family-policy hash, and resolution digest.
- [ ] Run the focused tests; expect PASS only after every currently discovered
      test resolves exactly once.
- [ ] Commit:

  ```bash
  git add scripts/run-tests-lanes.mjs scripts/run-tests.mjs scripts/task-tracker/test-family-policy.json scripts/task-tracker/lib/cloud-test/test-family-policy.mjs scripts/task-tracker/tests/unit/core/run-tests-lanes.test.mjs scripts/task-tracker/tests/unit/lib/cloud-test/test-family-policy.test.mjs
  git commit -m "feat(ci): add fixture-family shard policy"
  ```

## Task 6: Bound Develop Verification and Preserve Cloud Obligations

**Spec decomposition:** 5

**Files:**

- Modify: `scripts/task-tracker/lib/test-impact-selector.mjs`
- Modify: `scripts/task-tracker/verify-develop.mjs`
- Modify: `scripts/task-tracker/lib/verification-receipt.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/test-impact-selector.test.mjs`
- Modify: `scripts/task-tracker/tests/slow/core/verify-develop.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/verification-receipt.test.mjs`

- [ ] Write RED tests proving lane escalation records lanes and reasons without
      adding every lane file to `selection.tests`.
- [ ] Add elapsed-boundary tests: at most 180 seconds is healthy, 181-300 is a
      passing degraded result with warning evidence, and greater than 300 fails
      `develop-verification-budget-exceeded` even when commands are green.
- [ ] Add RED tests for a head-bound `develop-cloud-escalation` object containing
      changed paths, reasons, required lanes, and head SHA. Prove a new head
      invalidates it.
- [ ] Change `selectAffectedTests` so `escalateLane` adds only to `lanes` and
      reasons; direct tests remain the only locally executable list.
- [ ] Extend Develop receipt evidence without changing v1 Test semantics. The
      cloud obligation is a requirement, never a command pass.
- [ ] Run the three focused suites and expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/test-impact-selector.mjs scripts/task-tracker/verify-develop.mjs scripts/task-tracker/lib/verification-receipt.mjs scripts/task-tracker/tests/unit/lib/test-impact-selector.test.mjs scripts/task-tracker/tests/slow/core/verify-develop.test.mjs scripts/task-tracker/tests/unit/lib/verification-receipt.test.mjs
  git commit -m "feat(verify): defer escalated lanes to cloud Test"
  ```

## Task 7: Add Machine-Wide Worker Admission and Cloud Overflow

**Spec decomposition:** 6

**Files:**

- Create: `scripts/task-tracker/lib/host-worker-admission.mjs`
- Create: `scripts/task-tracker/lib/cloud-worker-adapter.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/host-worker-admission.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/host-worker-admission.integration.test.mjs`
- Create: `scripts/task-tracker/tests/unit/core/config-host-worker-capacity.test.mjs`
- Modify: `scripts/task-tracker/paths.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Modify: `scripts/task-tracker/fleet-registry.mjs`
- Modify: `scripts/run-tests-pool.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/fleet-registry.test.mjs`

- [ ] Add RED tests for one canonical repository identity across independent
      clones, six successful leases, seventh-worker queueing, heartbeat expiry,
      dead-process reclamation, orchestrator exclusion, and one VM dispatch per
      overflow worker.
- [ ] Add config schema:

  ```json
  {
    "hostWorkerCapacity": {
      "maxLocalWorkers": 6,
      "leaseTtlMs": 30000,
      "heartbeatMs": 10000,
      "minFreeMemoryRatio": 0.15,
      "maxLoadPerCpu": 0.9,
      "cloudAdapter": null
    }
  }
  ```

  Implement `loadHostWorkerCapacity()` as defaults plus user-global config only;
  tracked project config cannot select an executable adapter. Clamp
  `maxLocalWorkers` to the inclusive range 1-6 so no configuration can raise
  the physical-host ceiling. Memory/load thresholds may refuse new local
  leases but never revoke a healthy active worker.

- [ ] Store host leases under the machine user's AITM state directory, keyed by
      canonical GitHub repository ID/name rather than clone path. Use the
      existing fleet lock/read/write/reap primitives where semantics match, but
      keep the 30-second operational lease distinct from 24-hour fleet
      observation staleness.
- [ ] Define the cloud adapter as a configured executable receiving one
      assignment JSON document on stdin. Exit zero with a unique VM assignment
      ID means dispatched; reject reuse of an active VM assignment ID. An absent
      adapter means queued.
- [ ] Change runner concurrency to
      `max(1, floor((logicalCpuCount - 1) / activeLocalWorkers))` for leased local
      workers. CI and standalone runs without a lease retain
      `logicalCpuCount - 1`.
- [ ] Run the focused unit/integration tests and the existing concurrent fleet
      test. Expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/host-worker-admission.mjs scripts/task-tracker/lib/cloud-worker-adapter.mjs scripts/task-tracker/paths.mjs scripts/task-tracker/config.mjs scripts/task-tracker/fleet-registry.mjs scripts/run-tests-pool.mjs scripts/run-tests.mjs scripts/task-tracker/tests/unit/lib/host-worker-admission.test.mjs scripts/task-tracker/tests/integration/lib/host-worker-admission.integration.test.mjs scripts/task-tracker/tests/unit/core/config-host-worker-capacity.test.mjs scripts/task-tracker/tests/unit/lib/fleet-registry.test.mjs
  git commit -m "feat(fleet): enforce host-wide worker admission"
  ```

## Task 8: Replace the Canary with Production Stage 1 Fan-Out

**Spec decomposition:** 9

**Prerequisites:** Tasks 2-5

**Files:**

- Modify: `.github/workflows/ci.yml`
- Delete: `.github/workflows/ci-slow-shard-canary.yml`
- Create: `scripts/slow-impact.mjs`
- Modify: `scripts/task-tracker/lib/ci-workflow-history.mjs`
- Modify: `scripts/task-tracker/tests/slow/core/ci-lane-wiring.test.mjs`

- [ ] Add RED workflow assertions for independent Quality, `fast-a`, `fast-b`,
      and exactly the policy-selected Slow matrix; identical PR head; full
      checkout; Node 22; lockfile cache; clean `npm ci`; local trunk
      materialization; and unique diagnostics.
- [ ] Make Quality run format, lint, memory-index parity, and clean-worktree
      checks. Make Fast A/B run only their resolved Unit/Integration families.
      Verify every executor reports the same CI-policy, family-policy, lockfile,
      and verification-config fingerprints.
- [ ] Add RED assertions that slow-impact classification occurs only in Slow
      executors and before `npm ci`; safe skip exits each selected Slow executor
      successfully with structured evidence; nightly/manual modes are
      unconditional.
- [ ] Assert selected Slow executors always exist. An authorized skip is a
      successful executor conclusion, never a skipped job, duplicate gate name,
      or workflow `paths:` filter.
- [ ] Replace the old `fast`/label-gated `slow` jobs. Every execution job uses
      `timeout-minutes: 10`, starts the repository budget before install, and
      finishes with clean-worktree verification.
- [ ] Upload timing, failure, selection, and shard manifests with artifact names
      containing lane, shard, run ID, and attempt; use `if: always()` and
      `include-hidden-files: true`.
- [ ] Delete the disposable canary in the same commit. Preserve its selected
      evidence fixture and production policy.
- [ ] Run the slow wiring test, `npx prettier --check .github/workflows/ci.yml`,
      and `git diff --check`; expect PASS.
- [ ] Commit:

  ```bash
  git add -A .github/workflows scripts/slow-impact.mjs scripts/task-tracker/lib/ci-workflow-history.mjs scripts/task-tracker/tests/slow/core/ci-lane-wiring.test.mjs
  git commit -m "ci: fan out production cloud validation"
  ```

## Task 9: Add Stable Stage 2 Gates and Nightly Validation

**Spec decomposition:** 10

**Prerequisite:** Task 8

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/task-tracker/lib/ci-workflow-history.mjs`
- Modify: `scripts/task-tracker/tests/slow/core/ci-lane-wiring.test.mjs`

- [ ] Add RED assertions for `Fast validation policy` depending on Quality plus
      both Fast shards and `Slow validation policy` depending on every selected
      Slow shard.
- [ ] Prove both gates use `if: always()`, `timeout-minutes: 2`, no checkout,
      and explicit equality-to-`success` predicates. Failure, cancellation,
      skip, or missing dependencies must be red.
- [ ] Keep PR concurrency keyed by repository and PR number with
      `cancel-in-progress: true`. Nightly runs must execute all Slow shards
      regardless of path classification.
- [ ] Run the focused wiring test and Prettier; expect PASS.
- [ ] Commit:

  ```bash
  git add .github/workflows/ci.yml scripts/task-tracker/lib/ci-workflow-history.mjs scripts/task-tracker/tests/slow/core/ci-lane-wiring.test.mjs
  git commit -m "ci: add native fast and slow policy gates"
  ```

## Task 10: Normalize Native Actions Evidence and Build Receipt V2

**Spec decomposition:** 4

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/actions-adapter.mjs`
- Create: `scripts/task-tracker/lib/cloud-test/receipt-v2.mjs`
- Create: `scripts/task-tracker/tests/fixtures/github-actions/cloud-test-green.json`
- Create: `scripts/task-tracker/tests/fixtures/github-actions/cloud-test-failures.json`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/actions-adapter.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/receipt-v2.test.mjs`
- Modify: `scripts/task-tracker/lib/github-records/lifecycle-gate-source.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/github-records/lifecycle-gate-source.test.mjs`

- [ ] Add fixture-driven RED tests for repository ID/name, PR/base/head,
      workflow identity/path/commit/event/actor/app, run attempt, job/check IDs,
      runner labels, Node 22 setup, steps, gates, timestamps, and URLs.
- [ ] Add RED receipt tests for every source-aware refusal: stale epoch, wrong
      SHA/base/PR/workflow/app/platform/Node, missing or renamed executor/gate,
      skipped dependency, policy hash mismatch, incomplete family resolution,
      dirty checkout, and unsatisfied Develop obligation.
- [ ] Require receipt classifications `lint-full`, `format-full`, `test-unit`,
      `test-integration`, and `test-slow`; an independently reproduced
      `no-slow-impact` decision is the only substitute for executed Slow tests.
- [ ] Accept a policy fingerprint differing from protected target base only
      when the sealed Delivery Contract names both reviewed old and new hashes.
      Derive issue identity from the authorized PR branch/work assignment, never
      from workflow output.
- [ ] Implement logical key exactly as:

  ```text
  github-actions:{repositoryId}:{workflowId}:{runId}:{attempt}:{headSha}
  ```

- [ ] Keep `aitm.verification-receipt/v1` untouched. Receipt v2 is the payload of
      a `verification-evidence` capsule, uses provenance `github-actions`, and
      relies on the capsule ULID as its externally exposed receipt ID.
- [ ] Update lifecycle gate evidence to accept `test|passed|github-actions` for
      github-record sources while retaining `test|passed|agent` compatibility
      for existing records.
- [ ] Run the three focused suites and expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/cloud-test/actions-adapter.mjs scripts/task-tracker/lib/cloud-test/receipt-v2.mjs scripts/task-tracker/tests/fixtures/github-actions scripts/task-tracker/tests/unit/lib/cloud-test scripts/task-tracker/lib/github-records/lifecycle-gate-source.mjs scripts/task-tracker/tests/unit/lib/github-records/lifecycle-gate-source.test.mjs
  git commit -m "feat(records): add GitHub Actions receipt v2"
  ```

## Task 11: Repoint GitHub-Record Test Entry to a PR Transition

**Spec decomposition:** 12

**Prerequisite:** Task 10

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/test-transition.mjs`
- Create: `scripts/task-tracker/lib/cloud-test/github-pr-adapter.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/test-transition.test.mjs`
- Create: `scripts/task-tracker/tests/integration/verbs/github-record-cloud-test-transition.test.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/lib/github-records/lifecycle-transition.mjs`
- Modify: `scripts/task-tracker/lib/github-records/singleton-projections.mjs`

- [ ] Add RED tests for target resolution (`trunk` for root/standalone,
      immediate epic branch for children), lease-protected push, exactly one
      matching open PR, PR readback, and rejection of identity/base/head drift.
- [ ] Add crash-boundary tests: before PR leaves Develop; after PR adopts the
      matching PR; after capsule repairs `awaiting-ci`; a second matching PR
      fails closed.
- [ ] Define the Develop-to-Test transition payload with PR number, target
      branch, target base SHA, head branch, head SHA, Develop obligations, and
      current authority/contract identity.
- [ ] Make `verbs/test.mjs` a dispatcher: `github-records/v1` calls the new
      transition service and never creates a sandbox; `legacy-body/v1` continues
      through the existing sandbox code unchanged.
- [ ] Append the transition before converging coordination state
      `awaiting-ci`. Release the host worker lease only after the transition is
      durable.
- [ ] Run the focused unit/integration tests plus existing Test-verb sandbox
      tests; expect both source kinds to pass.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/cloud-test/test-transition.mjs scripts/task-tracker/lib/cloud-test/github-pr-adapter.mjs scripts/task-tracker/verbs/test.mjs scripts/task-tracker/lib/github-records/lifecycle-transition.mjs scripts/task-tracker/lib/github-records/singleton-projections.mjs scripts/task-tracker/tests/unit/lib/cloud-test/test-transition.test.mjs scripts/task-tracker/tests/integration/verbs/github-record-cloud-test-transition.test.mjs
  git commit -m "feat(task): route GitHub records through cloud Test"
  ```

## Task 12: Accept Native Evidence and Advance Test to Review

**Spec decomposition:** 13

**Prerequisites:** Tasks 9-11

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/receipt-acceptance.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/receipt-acceptance.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/cloud-test-acceptance.integration.test.mjs`
- Modify: `scripts/task-tracker/lib/github-records/singleton-projections.mjs`
- Modify: `scripts/task-tracker/lib/github-records/projection-repair.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`

- [ ] Add RED tests for polling the exact PR head, rejecting obsolete/cancelled
      attempts, independently validating every executor and gate, and
      recomputing any slow skip from protected target-base policy.
- [ ] Add logical-key idempotency tests: identical accepted payload reuses the
      record; a conflicting payload at one key fails; a crash after append
      repairs projection without appending again.
- [ ] On green, append `verification-evidence`, read it back, converge the
      evidence projection, clear `awaiting-ci`, and emit `REVIEW_COMPLETE` for
      the existing Test-to-Review transition path.
- [ ] On red, cancellation, stale head, or policy failure, clear parking and
      return a structured disposition without allowing Test evidence. Do not
      demote automatically until Task 17 installs conflict/failure rework.
- [ ] Run the focused unit/integration suites and expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/cloud-test/receipt-acceptance.mjs scripts/task-tracker/lib/github-records/singleton-projections.mjs scripts/task-tracker/lib/github-records/projection-repair.mjs scripts/task-tracker/verbs/test.mjs scripts/task-tracker/tests/unit/lib/cloud-test/receipt-acceptance.test.mjs scripts/task-tracker/tests/integration/lib/cloud-test-acceptance.integration.test.mjs
  git commit -m "feat(task): accept native cloud Test evidence"
  ```

## Task 13: Make Awaiting-CI Parking Recoverable and WIP-Safe

**Spec decomposition:** 14

**Prerequisite:** Task 12

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/awaiting-ci.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/cloud-test-handoff.integration.test.mjs`
- Modify: `scripts/task-tracker/lib/epic-children-gate.mjs`
- Modify: `scripts/task-tracker/lib/refine-exit-wip-budget-guard.mjs`
- Modify: `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs`
- Modify: `scripts/task-tracker/lib/github-records/projection-repair.mjs`

- [ ] Locate the repository's current epic WIP predicate and add RED tests that
      exemption requires authorized `awaiting-ci`, open matching PR, exact
      base/head, and no accepted terminal result. State text alone is
      insufficient.
- [ ] Add clearing tests for green, red, cancellation, head drift, PR closure,
      expiry, and authority replacement.
- [ ] Add cross-session recovery proving a replacement coordinator reconstructs
      parking from capsule chain, projection, PR, and Actions state without any
      host-local counter.
- [ ] Preserve dependency ordering: the scheduler may choose another eligible
      item, but it may not skip blockers or integrate a parent before them.
- [ ] Run the focused tests plus existing decomposition WIP tests; expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/cloud-test/awaiting-ci.mjs scripts/task-tracker/lib/epic-children-gate.mjs scripts/task-tracker/lib/refine-exit-wip-budget-guard.mjs scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs scripts/task-tracker/lib/github-records/projection-repair.mjs scripts/task-tracker/tests/unit/lib/cloud-test/awaiting-ci.test.mjs scripts/task-tracker/tests/integration/lib/cloud-test-handoff.integration.test.mjs
  git commit -m "feat(task): park and recover awaiting CI work"
  ```

## Task 14: Migrate Required Contexts and Epic-Branch Protection

**Spec decomposition:** 11

**Prerequisite:** Tasks 8-9 are green on a canary PR

**Files:**

- Create: `scripts/gh/audit-ci-rulesets.mjs`
- Create: `scripts/gh/tests/audit-ci-rulesets.test.mjs`
- Create: `docs/operations/cloud-test-ruleset-migration.md`
- Modify: `scripts/task-tracker/cloud-test-policy.json`

- [ ] Add RED tests that compare live ruleset JSON with policy and report:
      missing `Fast validation policy`, missing `Slow validation policy`,
      non-strict checks, missing `feature/epic/*` coverage, and premature
      removal of `Fast lane (format, lint, unit)`.
- [ ] Audit pull-request enforcement, stale-review dismissal when configured,
      review-thread resolution, deletion protection, and non-fast-forward
      protection for `trunk` and `refs/heads/feature/epic/*` in the same
      deterministic report.
- [ ] Implement a read-only audit command. It must never mutate settings and
      must emit a deterministic JSON delta suitable for review.
- [ ] On a canary PR, prove GitHub reports both new native contexts. Save run
      URLs and exact context names in the operations record.
- [ ] Export the current ruleset JSON before mutation. Apply the paired
      migration through an authenticated maintainer session: add both new
      contexts and epic-branch coverage with strict mode, verify live readback,
      then remove the obsolete Fast context. Never leave a protection gap.
      Stop for explicit maintainer approval after presenting the exported
      ruleset and deterministic delta; this plan does not itself authorize the
      external ruleset mutation.
- [ ] Run the audit against both `trunk` and a disposable `feature/epic/*`
      branch. The command must exit nonzero until both are protected, then zero.
- [ ] Commit repository policy and the auditable migration record:

  ```bash
  git add scripts/gh/audit-ci-rulesets.mjs scripts/gh/tests/audit-ci-rulesets.test.mjs docs/operations/cloud-test-ruleset-migration.md scripts/task-tracker/cloud-test-policy.json
  git commit -m "ops(ci): require cloud validation policy gates"
  ```

## Task 15: Add Parent-Directed Integration Freezes and Measurement Windows

**Spec decomposition:** 17

**Prerequisites:** Tasks 2, 12, and 14

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/measurement-window.mjs`
- Create: `scripts/task-tracker/lib/cloud-test/integration-freeze.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/measurement-window.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/integration-freeze.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/integration-freeze.integration.test.mjs`
- Modify: `scripts/task-tracker/lib/github-records/capsule-chain.mjs`
- Modify: `scripts/task-tracker/lib/github-records/singleton-projections.mjs`
- Modify: `scripts/task-tracker/lib/github-records/projection-repair.mjs`

- [ ] Add `integration-freeze` to the capsule type registry and write RED schema
      tests for `pending-receipt`, `accepted-receipt`, `merging`, and `released`
      successor capsules.
- [ ] Add RED tests for current authority, contract-complete/head-of-line epic,
      branch/parent/PR/head binding, child final-gate refusal, drift release,
      green hold through merge, bounded failure release, authority replacement,
      and projection repair.
- [ ] Project an effective active freeze as assignment state
      `integration-frozen` with its capsule chain head. The capsule is append-first
      authority; the projection remains a repairable index.
- [ ] Add measurement-window tests: frozen runner/width/family fingerprint;
      accepted Actions/receipt samples only; target count 20; platform-outage
      exclusions with reasons; queued performance changes; urgent
      correctness/security reset.
- [ ] Implement bootstrap expiry at 60 minutes below 20 samples. At/above 20,
      use `clamp(2 * nearestRankP95Cycle, 30 minutes, 60 minutes)` where the
      cycle includes refresh through merge readback.
- [ ] Implement fairness: after red, cancellation, drift, or expiry, one
      already-eligible child may use the epic-branch lane before reacquisition.
- [ ] Run the focused unit/integration tests and expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/cloud-test/measurement-window.mjs scripts/task-tracker/lib/cloud-test/integration-freeze.mjs scripts/task-tracker/lib/github-records/capsule-chain.mjs scripts/task-tracker/lib/github-records/singleton-projections.mjs scripts/task-tracker/lib/github-records/projection-repair.mjs scripts/task-tracker/tests/unit/lib/cloud-test/measurement-window.test.mjs scripts/task-tracker/tests/unit/lib/cloud-test/integration-freeze.test.mjs scripts/task-tracker/tests/integration/lib/integration-freeze.integration.test.mjs
  git commit -m "feat(records): coordinate parent integration freezes"
  ```

## Task 16: Implement the Lazy Merge Tail, Receipt Trailers, and Crash Repair

**Spec decomposition:** 18

**Prerequisites:** Tasks 12, 14, and 15

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/integration-lane.mjs`
- Create: `scripts/task-tracker/lib/cloud-test/receipt-trailers.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/integration-lane.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/receipt-trailers.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/cloud-test-merge-tail.integration.test.mjs`
- Modify: `scripts/task-tracker/lib/full-auto-merge.mjs`
- Modify: `scripts/task-tracker/lib/full-auto-merge-execute.mjs`
- Modify: `scripts/task-tracker/merge-back.mjs`
- Modify: `scripts/task-tracker/lib/github-records/capsule-chain.mjs`

- [ ] Write RED ordering tests using authorized Test-to-Review transition time
      and PR number tie-breaker. Prove unrelated target branches have independent
      lanes and only the head PR refreshes.
- [ ] Add RED merge tests for target fetch, base verification, lazy rebase,
      lease-protected push, fresh receipt, approval recheck, expected-head merge,
      PR/commit readback, and stale-target refusal.
- [ ] Keep lane position stable while the head PR refreshes and retests. Remove
      it only after merge, close, approval rejection/revocation, abandoned or
      expired merge attempt, or authorized rework demotion.
- [ ] Implement trailers exactly:

  ```text
  AITM-Validation-Receipt: 01K3M8K9A4M5V6X7Y8Z9ABCD0E
  CI-Verified-Sha: a1b2c3d4e5f678901234567890abcdef12345678
  CI-Run: 18234567890/2
  ```

  Preserve the concatenated squash body and every `[#N]` attribution token.

- [ ] Append `integration-result` with target, tested base/head, merged SHA,
      merge method, PR, receipt record ID, and observed timings; release any
      effective freeze only after merge readback.
- [ ] Add crash repair that verifies merged PR, commit, trailers, receipt, and
      authority before appending one missing integration result. Trailers alone
      can never reconstruct receipt evidence.
- [ ] Replace `merge-back.mjs` local complete-lane execution for
      `github-records/v1` with the same PR/receipt merge service; keep its legacy
      path for legacy issues.
- [ ] Run focused unit/integration tests plus existing full-auto merge tests;
      expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/cloud-test/integration-lane.mjs scripts/task-tracker/lib/cloud-test/receipt-trailers.mjs scripts/task-tracker/lib/full-auto-merge.mjs scripts/task-tracker/lib/full-auto-merge-execute.mjs scripts/task-tracker/merge-back.mjs scripts/task-tracker/lib/github-records/capsule-chain.mjs scripts/task-tracker/tests/unit/lib/cloud-test/integration-lane.test.mjs scripts/task-tracker/tests/unit/lib/cloud-test/receipt-trailers.test.mjs scripts/task-tracker/tests/integration/lib/cloud-test-merge-tail.integration.test.mjs
  git commit -m "feat(merge): add receipt-bound integration tail"
  ```

## Task 17: Route Conflicts and Invalidated Heads Back to Develop

**Spec decomposition:** 19

**Prerequisite:** Task 16

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/integration-rework.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/integration-rework.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/cloud-test-conflict-rework.integration.test.mjs`
- Modify: `scripts/task-tracker/verbs/demote.mjs`
- Modify: `scripts/task-tracker/lib/evidence-invalidation.mjs`

- [ ] Add RED tests for rebase/merge conflict, GitHub stale merge, and post-Test
      head mutation. Each must append a structured failure, clear parking/freeze,
      and plan `/task demote #N --rework` without changing other issues.
- [ ] Prove the repaired story rebases on current target, reruns affected
      Develop verification, invalidates its old receipt, updates the existing
      PR, and cannot re-enter Review without a fresh receipt.
- [ ] Keep semantic collisions on the same path: a post-rebase test failure is
      rework, not an automatic test omission or budget increase.
- [ ] Run focused tests and expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/cloud-test/integration-rework.mjs scripts/task-tracker/verbs/demote.mjs scripts/task-tracker/lib/evidence-invalidation.mjs scripts/task-tracker/tests/unit/lib/cloud-test/integration-rework.test.mjs scripts/task-tracker/tests/integration/lib/cloud-test-conflict-rework.integration.test.mjs
  git commit -m "feat(task): return integration conflicts to Develop"
  ```

## Task 18: Produce Manifest-Driven Triage Reports

**Spec decomposition:** 20

**Prerequisites:** Tasks 4 and 12

**Files:**

- Create: `scripts/task-tracker/lib/cloud-test/triage.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cloud-test/triage.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/cloud-test-triage.integration.test.mjs`
- Modify: `.ai-task-manager/templates/worker-report.md`
- Modify: `docs/guides/worker-context-contract.md`

- [ ] Add RED tests that native conclusions determine the category before
      artifacts are read. A green-looking artifact cannot override a red job.
- [ ] Add tests for bounded artifact/log retrieval, missing artifacts, exact
      named-file rerun commands, and smallest-reproducer fallback.
- [ ] Render the existing Worker Report fields with `status`, `bound_issue`,
      `files_changed`, `root_cause`, `changes_made`, `verification_run`,
      `integration_notes`, and `decisions_needed`. Triage receives a worker
      lease and may propose rework but cannot commit without a new assignment.
- [ ] Run focused tests and Markdown formatting checks; expect PASS.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/lib/cloud-test/triage.mjs scripts/task-tracker/tests/unit/lib/cloud-test/triage.test.mjs scripts/task-tracker/tests/integration/lib/cloud-test-triage.integration.test.mjs .ai-task-manager/templates/worker-report.md docs/guides/worker-context-contract.md
  git commit -m "feat(ci): add native-first failure triage"
  ```

## Task 19: Recover Slow-Lane Capacity with Weighted Pooling (#1208)

**Spec decomposition:** 15

**Prerequisites:** Interim production fan-out is stable and the active
measurement window has at least 20 eligible cycles.

**Files:**

- Create: `.github/workflows/ci-slow-pool-canary.yml`
- Modify: `scripts/task-tracker/lib/test-parallel-safety.mjs`
- Modify: `scripts/run-tests-pool.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/task-tracker/test-family-policy.json`
- Modify: `scripts/task-tracker/cloud-test-policy.json`
- Create: `scripts/task-tracker/tests/unit/lib/slow-weighted-pool.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/slow-weighted-pool.integration.test.mjs`

- [ ] Refine #1208 before implementation and attach the production timing
      fingerprint, observed p95, subprocess/resource classes, and reliability
      acceptance threshold.
- [ ] Add RED scheduler tests that assign resource weights, cap aggregate
      weight, preserve deterministic output, and never admit unsafe fixtures
      concurrently.
- [ ] Add a GitHub canary that compares serial/interim shards with weighted
      pooling on the same heads. Require exact coverage, no reliability
      regression, and 20 eligible production-shaped cycles.
- [ ] Reduce Slow width toward one only after nearest-rank p95 stays inside the
      480-second repository envelope. Open a new measurement window because
      width/policy fingerprint changed. Do not claim a lower critical path from
      slot recovery alone.
- [ ] Delete `.github/workflows/ci-slow-pool-canary.yml` in the topology-adoption
      commit after the 20-cycle evidence fixture is checked in.
- [ ] Re-run focused tests, workflow assertions, and the live policy audit.
- [ ] Commit:

  ```bash
  git add -A .github/workflows/ci-slow-pool-canary.yml scripts/task-tracker/lib/test-parallel-safety.mjs scripts/run-tests-pool.mjs scripts/run-tests.mjs scripts/task-tracker/test-family-policy.json scripts/task-tracker/cloud-test-policy.json scripts/task-tracker/tests/unit/lib/slow-weighted-pool.test.mjs scripts/task-tracker/tests/integration/lib/slow-weighted-pool.integration.test.mjs
  git commit -m "perf(test): add measured weighted Slow pooling"
  ```

## Task 20: Lower the Slow Fixture Floor Before Claiming Ten Merges per Hour

**Spec decomposition:** 16

**Prerequisite:** Production timing identifies
`scripts/task-tracker/tests/slow/lib/cli.test.mjs` as the active floor.

**Files:**

- Modify: `scripts/task-tracker/tests/slow/lib/cli.test.mjs`
- Create: `scripts/task-tracker/tests/fixtures/cli/shared-cli-fixture.mjs`
- Modify: `scripts/benchmarks/compare-test-fixtures.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/cli-shared-fixture.test.mjs`
- Modify: `scripts/task-tracker/cloud-test-policy.json`

- [ ] Record a before benchmark for setup count, file wall time, in-process
      time, and spawn/I/O time. Do not use the 130.386-second historical value
      as a new measurement.
- [ ] Add RED fixture tests proving repository/process setup is reused without
      leaking mutable state between scenarios.
- [ ] Refactor scenario cases to run against the shared fixture while preserving
      assertion coverage and failure isolation. Keep smoke substitutions only
      when the removed deep case has equivalent coverage elsewhere and record
      that mapping in the test.
- [ ] Run the focused Slow test repeatedly and compare the after benchmark.
      Record the measured floor; do not raise budgets if the target is missed.
- [ ] Claim ten merges/hour only after production end-to-end cycles, including
      queue/gates/receipt/merge, measure at or below 360 seconds.
- [ ] Commit:

  ```bash
  git add scripts/task-tracker/tests/slow/lib/cli.test.mjs scripts/task-tracker/tests/fixtures/cli/shared-cli-fixture.mjs scripts/benchmarks/compare-test-fixtures.mjs scripts/task-tracker/tests/unit/lib/cli-shared-fixture.test.mjs scripts/task-tracker/cloud-test-policy.json
  git commit -m "perf(test): reuse CLI integration fixtures"
  ```

## Task 21: Complete Documentation and End-to-End Rollout Verification

**Spec decomposition:** 21

**Prerequisites:** Tasks 1-18; Tasks 19-20 are documented as measured follow-on
gates if they have not yet satisfied their production prerequisites.

**Files:**

- Modify: `docs/guides/workflow.md`
- Modify: `docs/guides/settings-guide.md`
- Modify: `docs/guides/cloud-development-environments.md`
- Modify: `docs/guides/test-lane-taxonomy.md`
- Modify: `docs/guides/worker-context-contract.md`
- Create: `docs/operations/cloud-test-recovery.md`
- Create: `docs/operations/cloud-test-measurement.md`
- Create: `scripts/task-tracker/tests/integration/cloud-test-delivery.integration.test.mjs`
- Modify: `CLAUDE.md`

- [ ] Document bounded Develop behavior, cloud obligations, Test parking,
      legacy routing, native receipt acceptance, cloud adapter configuration,
      host leases, rulesets, freezes, lazy integration, trailers, failure
      recovery, retention limits, and measurement-window resets.
- [ ] State the retention boundary explicitly: GitHub retains check data for 400
      days, logs/artifacts follow the shorter repository setting, the issue
      capsule outlives those stores, and trailers are pointers rather than a
      permanent copy of Actions evidence.
- [ ] Remove live documentation references to nonexistent `npm run test:all` or
      `npm run test:fast`; use the canonical lane commands from `package.json`.
- [ ] Add one end-to-end injected integration scenario:

  ```text
  Develop direct checks -> cloud obligation -> PR transition -> awaiting-ci ->
  Stage 1/2 native green -> receipt append/projection -> Review -> lazy refresh
  -> fresh receipt -> expected-SHA merge -> trailers -> integration-result
  ```

- [ ] Add paired failure paths for stale authority, red Slow shard, head drift,
      merge conflict, and crash after merge.
- [ ] Run focused verification:

  ```bash
  node --test scripts/task-tracker/tests/integration/cloud-test-delivery.integration.test.mjs
  node --test scripts/task-tracker/tests/slow/core/ci-lane-wiring.test.mjs
  npm run format:check
  npm run lint
  npm run test:unit
  npm run test:integration
  npm run test:slow
  ```

  Expected: all commands exit 0. If total repository verification breaches its
  existing bounded sections, record a performance defect; do not raise a limit.

- [ ] Run the live ruleset audit and one documentation-only canary PR. Confirm
      both required contexts exist, Slow executors return authorized safe-skip
      evidence, and receipt acceptance independently recomputes that skip.
- [ ] Commit:

  ```bash
  git add docs/guides docs/operations CLAUDE.md scripts/task-tracker/tests/integration/cloud-test-delivery.integration.test.mjs
  git commit -m "docs(ci): publish cloud Test operations and recovery"
  ```

## Spec-to-Plan Coverage Audit

|                              Spec item | Plan task(s) |
| -------------------------------------: | ------------ |
| 1. Slow sharding and cloud calibration | 1-2          |
|        2. Fast and Quality calibration | 2            |
| 3. Slow-impact authority and migration | 3            |
|      4. Receipt v2 and Actions adapter | 10           |
|        5. Bounded Develop verification | 6            |
|               6. Host worker admission | 7            |
|      7. CI budget and failure evidence | 4            |
|       8. Timing-balanced family policy | 5            |
|                     9. Stage 1 fan-out | 8            |
|               10. Stage 2 native gates | 9            |
|                   11. Ruleset coverage | 14           |
|                 12. Test-stage repoint | 11           |
|                 13. Receipt acceptance | 12           |
|                   14. WIP and do-si-do | 13           |
|                 15. Weighted Slow pool | 19           |
|                 16. Slow fixture floor | 20           |
|                 17. Integration freeze | 15           |
|            18. Merge tail and trailers | 16           |
|                    19. Conflict rework | 17           |
|                             20. Triage | 18           |
|                      21. Documentation | 21           |

## Final Verification Checklist

- [ ] Every `github-records/v1` Test transition uses one exact-head PR and no
      local sandbox.
- [ ] Every `legacy-body/v1` Test transition retains current sandbox behavior.
- [ ] CI has no issue, PR, or Checks API write permission.
- [ ] Every discovered test resolves to exactly one family and one shard.
- [ ] Slow skips are target-base, default-deny, independently recomputed, and
      impossible for unclassified paths.
- [ ] Develop direct checks remain bounded at 180/300 seconds and escalations do
      not materialize local lanes.
- [ ] Quality, Fast, and Slow execution jobs all fit the 480/600-second outer
      budgets; no unmeasured Slow section ceiling exists.
- [ ] Native gates have stable names and strict required-check coverage on
      `trunk` and `feature/epic/*`.
- [ ] Host capacity is shared across clones/sessions and the seventh worker
      dispatches to a distinct cloud VM or queues.
- [ ] Parking, freezes, receipts, and integration results recover from GitHub
      state after coordinator replacement.
- [ ] Merge commits preserve attribution plus all three receipt trailers.
- [ ] `notes.md` remains untracked and untouched.
