# Stage-Aware Verification and Evidence Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run fast affected checks during Develop, run full regression exactly
once in the Test sandbox, and make Review trust exact-SHA evidence instead of
rerunning standard commands.

**Architecture:** Refactor `verify-develop.mjs` into an injectable iteration and
finalization engine. A hybrid selector combines static imports, the existing
basename mapper, and a checked-in exceptional-dependency manifest. Develop
finalization emits a versioned receipt; `/task test` validates that receipt,
reuses lint/format results, runs complete test lanes, and emits the Test receipt.
Review validates and consumes the Test receipt.

**Tech Stack:** Node.js ESM, `node:test`, git, npm scripts, AITM issue-body
evidence compatibility, existing sandbox worktrees.

**Governing spec:**
`docs/superpowers/specs/2026-08-01-execution-performance-and-adaptive-estimation-design.md`

**Delivery order:** Complete before fixture consolidation and before resuming
issue #1070.

**Initial planning baseline:** Human 8h; AI P50 5h; AI P80 8h. These are
pre-rubric planning values and must be replaced by `plan-estimate` during the
story's Plan phase if deeper inspection changes the WBS.

## Backlog Story Contract

**Title:** Stage-Aware Verification and Exact-SHA Evidence Reuse

**Shape:** Solo story

**Dependencies:** Completed #1069 base. This story blocks the fixture story and
resumption of #1070.

**Acceptance Criteria:**

- Develop iteration runs explainable affected tests and scoped lint/format only;
  it never runs complete test lanes.
- Develop finalization runs complete lint and format-check once for a clean final
  SHA and persists a versioned environment-bound receipt.
- Test reuses valid exact-SHA lint/format evidence and runs complete unit,
  integration, and slow lanes once in its clean sandbox.
- Review validates and trusts the Test receipt, running standard DoD commands
  zero times; reviewer probes remain targeted and separately classified.
- A source/test/config/lockfile/runtime fingerprint change invalidates evidence,
  returns the issue to Develop, and requires one new Test pass.
- The hybrid selector explains import, basename, changed-test, manifest, fixture,
  and lane-escalation reasons and fails conservatively for shared infrastructure.
- Existing Full-Auto and human approval gates behave exactly as before.

**Verification Commands:**

```bash
node --test scripts/task-tracker/tests/integration/stage-aware-verification.integration.test.mjs
npm run format:check
npm run lint
npm run test:unit
npm run test:integration
npm run test:slow
```

**Definition of Done:** Exact final SHA reviewed; before/after command counts,
receipt reuse/invalidation, selector explanations, and clean sandbox evidence
are attached to the issue.

## Invariants

- No receipt may be reused across a commit SHA, lockfile, runtime major,
  platform, or relevant verification-config change.
- A receipt records normalized command identity, exit code, start/completion
  time, duration, environment fingerprint, sandbox identity, and cleanliness.
- A red, missing, malformed, or stale receipt never becomes a pass.
- Develop iteration never runs complete unit/integration/slow lanes.
- Full lint and format-check execute once for an unchanged final SHA.
- Test executes the complete configured unit/integration/slow lanes once in the
  clean sandbox.
- Review executes no standard DoD command when Test evidence is valid.
- Any tracked code/test change after Test requires Develop and Test again.
- Existing Plan and Review approval gates are unchanged.

## Shared Interfaces

Implement these stable interfaces so subsequent work does not parse console
text:

```js
buildVerificationFingerprint({ projectDir, commitSha, configPaths });
createVerificationReceipt({ issueNumber, stage, fingerprint, commands, now });
parseVerificationReceipt(body);
upsertVerificationReceipt(body, receipt);
validateVerificationReceipt({ receipt, expectedStage, fingerprint, required });
selectAffectedTests({ projectDir, changedPaths, manifest, discoveredTests });
runDevelopVerification({ projectDir, mode, issueNumber, deps });
partitionVerificationCommands({ commands, reusableClassifications });
```

`validateVerificationReceipt` returns
`{ ok, reusableCommands, reasons, receipt }`. `selectAffectedTests` returns
`{ tests, lanes, reasons, escalated }` with a reason set for every path.

---

## Task 1: Characterize Current Stage Command Ownership

**Files:**

- Create: `scripts/task-tracker/tests/unit/lib/verification-stage-ownership.test.mjs`
- Modify: `scripts/task-tracker/tests/slow/core/verify-develop.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/test-verb-injection.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/review-verb-evidence-commands.test.mjs`

- [ ] Add characterization assertions that current Develop plans
      `lint:js --fix`, `format`, and full `lint`; Test executes every VC; and
      Review trusts `aitm-dod-verified` rather than executing commands.
- [ ] Add an explicit command-classification fixture for `lint-full`,
      `format-full`, `test-unit`, `test-integration`, `test-slow`, and
      `review-probe`.
- [ ] Run the four focused tests and preserve their output as the pre-change
      baseline.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/verification-stage-ownership.test.mjs
node --test scripts/task-tracker/tests/slow/core/verify-develop.test.mjs
node --test scripts/task-tracker/tests/unit/lib/test-verb-injection.test.mjs
node --test scripts/task-tracker/tests/unit/lib/review-verb-evidence-commands.test.mjs
```

## Task 2: Add the Versioned Verification Receipt

**Files:**

- Create: `scripts/task-tracker/lib/verification-receipt.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/verification-receipt.test.mjs`
- Modify: `scripts/task-tracker/lib/markers.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/markers.test.mjs`

- [ ] Write RED tests for canonical command normalization, complete SHA,
      timestamps, duration, Node/platform, lockfile hash, config hashes,
      sandbox identity, clean-tree flag, and command classifications.
- [ ] Write RED tests for every refusal reason: schema, SHA, Node major,
      platform, lockfile, config, cleanliness, missing command, duplicate
      classification, and nonzero exit.
- [ ] Implement hashing with `node:crypto` and repository-relative normalized
      config paths. Include `package.json`, `package-lock.json`, lint/format
      configs, `scripts/run-tests.mjs`, lane classifiers, and the impact
      manifest when present.
- [ ] Add marker helpers for exactly one current receipt per stage. Replacing a
      same-stage receipt must set `supersedes` to the old receipt ID; other body
      invariants must be preserved.
- [ ] Prove visible text and unrelated issue-body edits do not affect receipt
      validation.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/verification-receipt.test.mjs
node --test scripts/task-tracker/tests/unit/lib/markers.test.mjs
```

## Task 3: Implement Explainable Hybrid Test Selection

**Files:**

- Create: `scripts/task-tracker/lib/test-impact-selector.mjs`
- Create: `scripts/task-tracker/test-impact-manifest.json`
- Create: `scripts/task-tracker/tests/unit/lib/test-impact-selector.test.mjs`
- Create: `scripts/task-tracker/tests/fixtures/test-impact/`
- Modify: `scripts/task-tracker/find-unit-tests.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/find-unit-tests.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

- [ ] Add fixture-driven RED tests for direct imports, transitive imports,
      changed tests, untracked tests, changed fixture helpers, basename fallback,
      dynamic/CLI manifest rules, glob expansion, and duplicate reasons.
- [ ] Add conservative RED tests proving package/lockfile, test runner, lane
      classifier, global helper, and impact-manifest changes expand to declared
      full lanes.
- [ ] Implement a deterministic ESM import graph for repository-local static
      imports. Ignore package imports and reject paths that escape the repo.
- [ ] Keep `findUnitTests` as a compatibility signal and have the new selector
      union, sort, and explain all signals.
- [ ] Validate manifest schema and fail closed on invalid paths, unknown lanes,
      empty reasons, or unmatched high-blast-radius rules.
- [ ] Print a compact selection report showing changed path, selected tests,
      reason, and any lane escalation.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/test-impact-selector.test.mjs
node --test scripts/task-tracker/tests/unit/lib/find-unit-tests.test.mjs
node scripts/task-tracker/tests/unit/meta/test-tree-layout.test.mjs
```

## Task 4: Split Develop Iteration from Finalization

**Files:**

- Modify: `scripts/task-tracker/verify-develop.mjs`
- Modify: `scripts/task-tracker/tests/slow/core/verify-develop.test.mjs`
- Modify: `scripts/task-tracker/source-edit-gate.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/source-edit-post-develop-lock.test.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`

- [ ] Write RED tests for `--mode iteration` running scoped autofix/checks and
      the selector output without any complete lane.
- [ ] Write RED tests for `--mode final` requiring a clean committed tree,
      running `npm run lint` and `npm run format:check` once, and returning a
      receipt object.
- [ ] Prove finalization refuses when format/autofix changes tracked files and
      instructs the agent to inspect, commit, and retry against the new SHA.
- [ ] Extract process spawning behind injected dependencies; return structured
      results instead of calling `process.exit` inside the reusable core.
- [ ] Make CLI default `iteration`; document `--mode final --issue <N>`.
- [ ] Preserve the post-Develop source-edit remediation text, updated to name
      iteration/finalization and the required re-Test loop.

**Verify:**

```bash
node --test scripts/task-tracker/tests/slow/core/verify-develop.test.mjs
node --test scripts/task-tracker/tests/unit/core/source-edit-post-develop-lock.test.mjs
node scripts/task-tracker/verify-develop.mjs --help
```

## Task 5: Make Test Finalize Develop and Reuse Lint/Format Evidence

**Files:**

- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/lib/verification-commands.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/test-verb-receipt-reuse.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/test-verb-result.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/test-verb-sandbox.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/test-sha-drift-gate.test.mjs`

- [ ] Write RED tests that `/task test` invokes Develop finalization while the
      issue is still in Develop, persists/read-backs its receipt, and refuses
      advancement if finalization fails.
- [ ] Write RED tests that valid lint/format classifications are partitioned
      out of sandbox execution while all complete test classifications run.
- [ ] Write RED tests that stale/malformed Develop evidence produces a recorded
      refusal reason and a new finalization run, never an assumed pass.
- [ ] Ensure the sandbox receives the exact outer SHA, installs dependencies,
      verifies its own fingerprint, and records actual lane durations.
- [ ] Emit one `test` receipt containing reused Develop command references plus
      newly executed complete-lane results. Continue stamping
      `aitm-test-started` and `aitm-dod-verified` for compatibility.
- [ ] Prevent a Test self-loop from rerunning an already-green exact-SHA receipt
      unless evidence was invalidated or the operator supplies the existing
      audited override path.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/test-verb-receipt-reuse.test.mjs
node --test scripts/task-tracker/tests/unit/lib/test-verb-result.test.mjs
node --test scripts/task-tracker/tests/unit/lib/test-verb-sandbox.test.mjs
node --test scripts/task-tracker/tests/unit/lib/test-sha-drift-gate.test.mjs
```

## Task 6: Make Review Fail Closed on Receipt Drift Without Reruns

**Files:**

- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/lib/test-exit-dod-verified-guard.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/review-receipt-reuse.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/coverage-review.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/review-verb-evidence-commands.test.mjs`

- [ ] Write RED tests that Review accepts a matching Test receipt, seeds all
      standard DoD command results from it, and spawns no standard commands.
- [ ] Write RED tests for SHA/config/lockfile drift and a missing required test
      lane. The remediation must be Develop finalization followed by one Test
      pass, not a Review-stage full rerun.
- [ ] Preserve reviewer-discovered targeted probes as `review-probe` evidence;
      probes do not mutate the Test receipt or masquerade as full regression.
- [ ] Remove the legacy opportunistic behavior that tolerates an unresolvable
      HEAD when a v1 receipt is present; v1 validation fails closed.
- [ ] Retain legacy marker compatibility for issues without the new receipt
      until the repository's migration policy explicitly removes it.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/review-receipt-reuse.test.mjs
node --test scripts/task-tracker/tests/unit/lib/coverage-review.test.mjs
node --test scripts/task-tracker/tests/unit/lib/review-verb-evidence-commands.test.mjs
```

## Task 7: End-to-End Proof and Operator Documentation

**Files:**

- Create: `scripts/task-tracker/tests/integration/stage-aware-verification.integration.test.mjs`
- Modify: `docs/guides/workflow.md`
- Modify: `docs/decisions/0001-test-tree-convention.md`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

- [ ] Build an integration fixture that records every spawned command across
      Develop iteration, Develop finalization, Test, Review, a no-change repeat,
      and a post-review code change.
- [ ] Prove the unchanged path executes full lint/format once, complete test
      lanes once, and no standard command in Review.
- [ ] Prove the changed path invalidates receipts, returns to Develop, and runs
      exactly one new Test pass.
- [ ] Document stage ownership, selector explanations, receipt invalidation,
      reviewer probes, and operator recovery commands.
- [ ] Capture before/after command counts and elapsed durations in the issue
      evidence packet.

**Final verification:**

```bash
node --test scripts/task-tracker/tests/integration/stage-aware-verification.integration.test.mjs
node --test scripts/task-tracker/tests/unit/lib/verification-receipt.test.mjs
node --test scripts/task-tracker/tests/unit/lib/test-impact-selector.test.mjs
node --test scripts/task-tracker/tests/slow/core/verify-develop.test.mjs
npm run format:check
npm run lint
npm run test:unit
npm run test:integration
npm run test:slow
```

## Evidence Required Before Delivery

- Exact final commit SHA and clean-worktree proof.
- Before/after command invocation table for an unchanged story lifecycle.
- Selector explanations for representative source, fixture, CLI, runner, and
  lockfile changes.
- Receipt reuse and invalidation examples with structured refusal reasons.
- Full Test sandbox results for unit, integration, and slow lanes.
- Independent exact-SHA review under the existing approval policy.
