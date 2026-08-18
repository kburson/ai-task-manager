# Repository-Native Polyglot TIA and Build-Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver explainable, repository-native test impact analysis for Node
and iOS projects, backed by complete scheduled validation and fail-closed AITM
project-health governance.

**Architecture:** A platform-neutral TIA core resolves the exact Git change
interval, unions non-removable deterministic candidates with additive historical
signals, and emits content-addressed receipts. Short-lived observations remain
local or in Actions artifacts; compact validated authority is serialized onto
the protected orphan branch `aitm/tia-data` and projected into one persistent
project-health issue. AITM and CI both refuse unrelated work when that evidence
is RED, stale, inconsistent, or missing after activation.

**Tech Stack:** Node.js 22 ESM, `node:test`, Git, GitHub Actions, GitHub
REST/GraphQL through existing AITM adapters, JSON Schema, npm script-label
providers, `xcodebuild`, `swift test`, and `.xcresult` JSON export.

**Governing spec:**
`docs/superpowers/specs/2026-08-14-repository-native-polyglot-tia-and-build-health-design.md`

**Pinned Cloud Test dependency:**
[Cloud Test Automation plan at `39647d6ce7670326e46e09680b0dda45fb113642`](https://github.com/kburson/ai-task-manager/blob/39647d6ce7670326e46e09680b0dda45fb113642/docs/superpowers/plans/2026-08-12-cloud-test-automation.md).
This plan consumes that exact revision. Any later Cloud Test revision requires a
recorded compatibility review before TIA implementation continues.

## Global Constraints

- Develop owns implementation, new or modified tests, lint, format, affected
  tests, acceptance-criteria receipts, and exit guards.
- Test owns pull request creation and exact-head fast CI validation.
- The scheduled full suite owns the unbiased safety backstop, learning source,
  and project-health authority input.
- Deterministic candidates are a non-removable floor. Historical and learned
  signals may add or order tests; they may never subtract a floor test.
- Missing, stale, corrupt, unsupported, non-ancestral, or incompatible evidence
  broadens validation or closes admission. It never narrows selection.
- `aitm/tia-data` is an orphan branch with single-parent linear history and is
  never merged into an application branch.
- Observed and inferred records cannot authorize work, activate a model, write
  health, or grant a repair exception. Only validated core policy can do so.
- Raw logs, screenshots, coverage trees, `.xcresult` bundles, secrets, absolute
  host paths, environment dumps, and SQLite files never enter `aitm/tia-data`.
- Workflows use only repository-scoped `GITHUB_TOKEN`; no App, bot, PAT,
  external database, metrics repository, or hosted metrics service is added.
- `install` and `init` remain the only required setup commands. Every install
  write is idempotent and preserves user-edited policy.
- The existing `.aitm/test-timing.json` remains a legacy local snapshot. New
  worktree overlays live under ignored `.ai-task-manager/.cache/tia/`.
- Ordinary PR and merge-group runs use affected selection. Scheduled, recovery,
  repair, and release-candidate runs execute every configured lane.
- The plan starts with these reviewed policy defaults: nightly sanity at 07:00
  UTC; GREEN freshness limit 36 hours; Actions artifact retention 30 days;
  repair lease TTL 60 minutes with a 10-minute heartbeat; no time budget may
  truncate mandatory tests; optional historical additions receive a 10-minute
  budget; a confirmed stable escape suspends learned augmentation immediately;
  and the cross-project exporter is disabled.
- Each task begins with a focused failing test, proves the intended failure,
  implements the smallest passing behavior, runs its focused and adjacent
  suites, runs `node scripts/task-tracker/verify-develop.mjs`, and commits only
  its declared files with `[#<issue>]` attribution.

## Stable Interfaces

Implement and import these interfaces; do not parse console prose:

```js
resolveChangeSet({ projectDir, candidateSha, targetRef, includeWorktree });
resolveSnapshotCompatibility({ projectDir, candidateSha, snapshotBaselineSha });

loadAffectedContract({ projectDir });
writeAffectedManifest({ projectDir, changedPaths });
runAffectedContract({ projectDir, manifest, runCommand });

selectDeterministicCandidates({ changedPaths, providers, manifest, policy });
augmentSelection({ floor, snapshot, candidate, policy });
createSelectionReceipt({ resolution, selection, identities });

normalizeObservation(input);
observationId(observation);
aggregateObservations({ snapshot, observations, compatibility });
resolveCandidateSnapshot({ projectDir, candidateSha, targetSha, tiaDataSha });

validateLedgerTree({ parentTree, candidateTree, operation, context });
planLedgerOperation({ operation, current, input, now });
publishLedgerOperation({ repository, operation, input, expectedHead });

evaluateProjectHealth({ current, completeRun, now, policy });
readProjectHealth({ repository, marker, tiaDataSha, now, policy });
projectHealthAdmission({ health, operation, issueNumber, repairLease });

planRepairLease({ operation, currentLease, health, claimant, now, policy });
validateRepairAdmission({ health, lease, pullRequest, candidateSha });

scoreHistoricalCandidates({ floor, candidates, snapshot, context, policy });
evaluateModelCandidate({ model, baseline, completeRuns, policy });

createNodeProvider(config);
createIosProvider(config);
unionProviderCandidates({ providerResults, policy });
```

All planners return data. Git, GitHub, filesystem, clock, and process mutation
remain injected at the orchestration boundary.

## Delivery and Migration Order

| Gate                     | Prerequisite                                               | Migration gate                                                           |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Phase 0 correctness      | None                                                       | Committed branch changes and local edits compose in regression tests     |
| Phase 1 script seam      | Phase 0                                                    | Non-JavaScript fixture runs all three labels; missing labels refuse      |
| Phase 2 evidence         | Phases 0-1                                                 | Receipt replay reproduces the exact roster from pinned inputs            |
| Cloud Test integration   | Cloud plan Tasks 4, 6, and 9-13 at pinned commit           | TIA receipt is accepted without changing Cloud Test authority boundaries |
| Phase 3 ledger           | Phase 2                                                    | Orphan history, validator, retry, and readback smoke tests pass          |
| Phase 4 health           | Phase 3 and complete-run Cloud Test evidence               | BOOTSTRAPPING cannot become GREEN without a compatible full run          |
| Phase 5 admission/repair | Phase 4                                                    | RED/UNKNOWN blocks ordinary work; only lease-bound repair is admitted    |
| Phase 6 heuristics       | Two compatible complete runs                               | Shadow mode proves additive-only behavior and deletion fallback          |
| Phase 7 Node provider    | Phase 6                                                    | Extracted provider is selection-equivalent to the legacy selector        |
| Phase 7 iOS provider     | Provider contract proven by Node                           | Hermetic fixture normalizes schemes, tests, environments, and results    |
| Phase 8 model            | At least 200 complete labeled runs and 30 stable positives | Backtest meets recall/escape policy before activation                    |
| General availability     | All prior gates                                            | Install/init/doctor and end-to-end protected/cooperative modes pass      |

Do not create GitHub issues while this plan is under review. After approval,
decompose it into one top-level epic with child stories matching the tasks below.
Tasks 1-3 may run before the pinned Cloud Test plan is complete; Task 4 and later
must honor the dependency gates above.

---

### Task 1: Correct the Git Change Interval (Phase 0)

**Prerequisites:** Approved specification and a branch rebased onto current
`origin/trunk`.

**Files:**

- Create: `scripts/task-tracker/lib/tia/change-resolver.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/change-resolver.test.mjs`
- Modify: `scripts/task-tracker/verify-develop.mjs`
- Modify: `scripts/tests/slow/task-tracker/core/verify-develop.test.mjs`

**Tests:** A branch fixture with one committed source change, one tracked local
change, one rename, and one untracked file must return all old/new paths exactly
once. Snapshot compatibility must be tested separately from the PR merge-base
interval.

- [ ] Write failing tests that create `trunk`, branch from it, commit a source
      change, then add tracked and untracked edits. Assert this contract:

  ```js
  assert.deepEqual(
    resolveChangeSet({
      projectDir,
      candidateSha: head,
      targetRef: 'trunk',
      includeWorktree: true,
    }),
    {
      targetSha,
      candidateSha: head,
      mergeBaseSha: targetSha,
      changedPaths: [
        'renamed-from.mjs',
        'renamed-to.mjs',
        'source.mjs',
        'tracked.mjs',
        'untracked.mjs',
      ],
    }
  );
  ```

- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/change-resolver.test.mjs scripts/tests/slow/task-tracker/core/verify-develop.test.mjs`.
      Expected: FAIL because `change-resolver.mjs` does not exist and committed
      changes are absent from the legacy collection.
- [ ] Implement `resolveChangeSet` with `git rev-parse`, `git merge-base`,
      `git diff --name-status --find-renames -z <merge-base> <candidate>`, the
      worktree diff, and `git ls-files --others --exclude-standard`. Reject a
      missing/non-ancestor target or escaping path; include both rename paths.
- [ ] Implement `resolveSnapshotCompatibility` with Git's merge-base ancestry
      check and a distinct `snapshotBaselineSha`; never reuse it as
      `mergeBaseSha`.
- [ ] Replace `collectChangedPaths` internals in `verify-develop.mjs` while
      retaining its exported compatibility wrapper.
- [ ] Run the focused command again and expect PASS; then run
      `node scripts/task-tracker/verify-develop.mjs`.
- [ ] Commit the four files as
      `fix(tia): resolve changes from the target merge base [#<issue>]`.

**Verification:** The focused test command exits 0 and the result includes
committed, tracked, renamed, and untracked paths.

**Migration gate:** No later phase starts until a committed-branch regression
would fail against the pre-change implementation and pass against this commit.

### Task 2: Deliver the Language-Neutral Affected Contract (Phase 1)

**Prerequisites:** Task 1 and the approved predecessor specification
`docs/superpowers/specs/2026-08-12-language-agnostic-develop-verification-design.md`.

**Files:**

- Create: `scripts/task-tracker/lib/script-label-contract.mjs`
- Create: `scripts/task-tracker/lib/affected-manifest.mjs`
- Create: `bin/aitm-noop`
- Create: `scripts/run-affected-tests.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/script-label-contract.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/affected-manifest.test.mjs`
- Create: `scripts/tests/integration/task-tracker/core/non-js-affected-contract.test.mjs`
- Create: `scripts/tests/fixtures/non-js-affected/package.json`
- Create: `scripts/tests/fixtures/non-js-affected/Sources/App.swift`
- Modify: `scripts/task-tracker/verify-develop.mjs`
- Modify: `scripts/task-tracker/lib/verification-receipt.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/verification-receipt.test.mjs`
- Modify: `package.json`

**Tests:** The fixture uses shell-only `lint:affected`, `format:affected`, and
`test:affected` scripts, receives `.tmp/aitm/affected-manifest.txt`, and records
the three commands in order. Absent or empty labels return
`script-label-missing`; non-empty changes with zero commands return
`iteration-no-commands`.

- [ ] Add RED unit and integration cases for the fixed roster, newline-delimited
      manifest bytes, path normalization, SHA-256/count output, exact command
      identities, explicit no-op reason, and the non-JavaScript fixture.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/script-label-contract.test.mjs scripts/tests/unit/task-tracker/lib/affected-manifest.test.mjs scripts/tests/integration/task-tracker/core/non-js-affected-contract.test.mjs`.
      Expected: FAIL on missing modules and the current silent empty-command path.
- [ ] Export the eight-label roster and `findMissingLabels(pkgScripts)` from
      `script-label-contract.mjs`; the three Develop labels must carry
      `receivesManifest: true` and fixed classifications.
- [ ] Make `writeAffectedManifest` sort/deduplicate normalized repository paths,
      emit one path per line plus a trailing newline, and return
      `{ path, hash, count }`. Reject absolute paths and `..` segments.
- [ ] Replace hardcoded eslint/Prettier/Node iteration steps with ordered
      `npm run lint:affected -- --file-path-manifest <stable-path>`, then format,
      then test. Preserve empty-changes success as an explicit `no-changes`
      result.
- [ ] Add this repository's three scripts. `test:affected` invokes
      `scripts/run-affected-tests.mjs`, which consumes the manifest and delegates
      to the existing deterministic selector; lint/format consume existing paths
      only.
- [ ] Extend receipt v1 additively with `affectedManifestHash`,
      `affectedManifestCount`, and `affectedManifestPayloadMode`; retain exact
      argv identity enforcement.
- [ ] Run the focused tests, `npm run lint`, and `npm run format:check`; expect
      PASS, then run Develop verification.
- [ ] Commit as
      `feat(tia): add the language-neutral affected contract [#<issue>]`.

**Verification:** The non-JavaScript fixture executes all three commands, and a
project missing any label fails before spawning a process.

**Migration gate:** Every consuming repository adds the three labels before
upgrading. No warning-only compatibility window is permitted.

### Task 3: Add Normalized Records, Local Overlay, and Selection Receipts (Phase 2)

**Prerequisites:** Tasks 1-2.

**Files:**

- Create: `scripts/task-tracker/lib/tia/canonical-json.mjs`
- Create: `scripts/task-tracker/lib/tia/records.mjs`
- Create: `scripts/task-tracker/lib/tia/selection-core.mjs`
- Create: `scripts/task-tracker/lib/tia/local-overlay.mjs`
- Create: `scripts/task-tracker/lib/tia/receipt.mjs`
- Create: `config/tia-policy.default.json`
- Create: `scripts/tests/unit/task-tracker/lib/tia/records.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/selection-core.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/local-overlay.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/receipt.test.mjs`
- Modify: `.gitignore`

**Tests:** Canonical JSON must be byte-stable regardless of object insertion
order. Observation IDs must change with any identity field. Selection must
retain every floor test when rank scores are empty, corrupt, over budget, or
deleted.

- [ ] Add RED tests for `normalizeObservation`, `observationId`,
      `selectDeterministicCandidates`, `augmentSelection`, and
      `createSelectionReceipt`. Assert `unselected` is represented as
      `unobserved`, never `pass`.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/{records,selection-core,local-overlay,receipt}.test.mjs`.
      Expected: FAIL because the Phase 2 modules do not exist.
- [ ] Implement recursive key sorting and LF-only serialization in
      `canonical-json.mjs`; compute digests over those exact UTF-8 bytes.
- [ ] Implement validated records for run, changed path, test definition,
      selection decision, execution, dependency edge, model snapshot, and health
      decision. Strip absolute paths and bound diagnostic fingerprints.
- [ ] Union the deterministic floor, historical additions, and policy backstop;
      store reason codes and mandatory/optional class on every selected test.
      Optional budget exhaustion cannot affect mandatory tests.
- [ ] Store branch-local observations under
      `.ai-task-manager/.cache/tia/<candidate-sha>/`; verify candidate,
      configuration, provider, and snapshot identities before overlay.
- [ ] Emit receipt identities for candidate, target, merge base, data branch,
      snapshot, provider lock, configuration, selector, model, and exact selected
      roster.
- [ ] Run focused tests and Develop verification; expect PASS.
- [ ] Commit as `feat(tia): add normalized selection evidence [#<issue>]`.

**Verification:** Delete the local overlay and rerun selection; the deterministic
floor and receipt identities remain valid.

**Migration gate:** Cloud integration cannot start until the receipt can replay
the exact roster from pinned source/config/provider/model/evidence identities.

### Task 4: Connect TIA Evidence to the Pinned Cloud Test Contract

**Prerequisites:** Task 3 and Tasks 4, 6, and 9-13 of the Cloud Test plan at
commit `39647d6ce7670326e46e09680b0dda45fb113642`.

**Files:**

- Create: `scripts/task-tracker/lib/tia/cloud-test-adapter.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/cloud-test-adapter.test.mjs`
- Modify: `scripts/run-tests-report.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/tests/unit/meta/ci-workflow-history.test.mjs`

**Tests:** The adapter must bind a TIA receipt to the exact Cloud Test head SHA,
run/attempt, policy fingerprint, provider lock, and selected roster. A PR receipt
cannot claim full scope, and a merge-group receipt cannot be reused for a PR.

- [ ] Add RED tests for selected/full scope separation, exact-head mismatch,
      biased exposure handling, and stable artifact names.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/cloud-test-adapter.test.mjs scripts/tests/unit/meta/ci-workflow-history.test.mjs`.
      Expected: FAIL because the adapter and workflow wiring are absent.
- [ ] Implement `toCloudTestObligation(receipt)` and
      `fromCloudTestResult({ receipt, nativeEvidence })`; preserve the Cloud Test
      coordinator as the only lifecycle writer.
- [ ] Emit `tia-selection-receipt.json`, `tia-observations.jsonl`, and
      `tia-diagnostics.json` as immutable workflow artifacts with 30-day
      retention. Do not grant issue or pull-request write permission to
      execution jobs.
- [ ] Add `merge_group` to workflow triggers and bind validation to the exact
      synthetic candidate; materialize complete target history for merge-base
      calculation.
- [ ] Run the focused tests, Prettier on `.github/workflows/ci.yml`, and Develop
      verification; expect PASS.
- [ ] Commit as `feat(tia): bind selection receipts to Cloud Test [#<issue>]`.

**Verification:** A forged head SHA, full-scope flag, or run attempt is rejected
without accepting lifecycle evidence.

**Migration gate:** Production workflows remain on Cloud Test's current full
Fast behavior until this adapter passes a canary PR and merge-group run.

### Task 5: Validate the Canonical Orphan Ledger (Phase 3A)

**Prerequisites:** Tasks 3-4.

**Files:**

- Create: `templates/tia/schema/observation.schema.json`
- Create: `templates/tia/schema/snapshot.schema.json`
- Create: `templates/tia/schema/model.schema.json`
- Create: `templates/tia/schema/health.schema.json`
- Create: `templates/tia/schema/repair-lease.schema.json`
- Create: `scripts/task-tracker/lib/tia/ledger-layout.mjs`
- Create: `scripts/task-tracker/lib/tia/ledger-validator.mjs`
- Create: `scripts/task-tracker/lib/tia/snapshot-reader.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/ledger-validator.test.mjs`
- Create: `scripts/tests/integration/task-tracker/tia/orphan-ledger.test.mjs`

**Tests:** Build a real orphan branch fixture and reject merge bases with trunk,
merge commits, symlinks, unknown paths, oversized records, non-canonical JSON,
digest/lineage mismatch, secrets, and unsupported future schemas.

- [ ] Add RED schema and real-Git tests for the exact canonical tree declared in
      the spec and recovery to the most recent valid ancestor.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/ledger-validator.test.mjs scripts/tests/integration/task-tracker/tia/orphan-ledger.test.mjs`.
      Expected: FAIL because schemas and validators are absent.
- [ ] Implement a strict allowed-path table for `README.md`, `schema/`, `tia/`,
      `models/`, `sanity/`, and `health/`. Require a root commit with zero
      parents, then exactly one parent per update.
- [ ] Validate schema, project/provider/config identities, canonical bytes,
      digest sidecars, ancestry, observation watermark, and parent snapshot
      digest before exposing history.
- [ ] Make `resolveCandidateSnapshot` pin one `tia_data_sha`; ignore later branch
      motion and reject a snapshot baseline not ancestral to the candidate.
- [ ] Run focused tests and Develop verification; expect PASS.
- [ ] Commit as `feat(tia): validate the canonical orphan ledger [#<issue>]`.

**Verification:** `git merge-base trunk aitm/tia-data` exits 1 in the fixture,
and a corrupt head resolves only to its latest valid ancestor in cooperative
mode.

**Migration gate:** No writer is enabled until every reader validates history
independently and can recover from an invalid head.

### Task 6: Add Typed Publication, Protection Probe, and Init (Phase 3B)

**Prerequisites:** Task 5.

**Files:**

- Create: `scripts/task-tracker/lib/tia/ledger-operations.mjs`
- Create: `scripts/task-tracker/lib/tia/ledger-publisher.mjs`
- Create: `scripts/task-tracker/lib/tia/protection.mjs`
- Create: `scripts/task-tracker/tia-ledger.mjs`
- Create: `templates/workflows/aitm-tia-ledger.yml`
- Create: `scripts/tests/unit/task-tracker/lib/tia/ledger-operations.test.mjs`
- Create: `scripts/tests/integration/task-tracker/tia/ledger-publisher.test.mjs`
- Modify: `bin/cli.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/install.test.mjs`

**Tests:** Every typed operation must accept only its schema-defined fields.
Two concurrent candidates must yield one fast-forward winner and one bounded
refetch/recompute retry. A ruleset API success without publish/readback proof is
cooperative mode, not protected mode.

- [ ] Add RED tests for the seven allowed operations, unknown fields, stale
      expected heads, temporary-ref cleanup, validation status binding, ruleset
      capabilities, and smoke-test downgrade.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/ledger-operations.test.mjs scripts/tests/integration/task-tracker/tia/ledger-publisher.test.mjs scripts/tests/unit/task-tracker/lib/install.test.mjs`.
      Expected: FAIL on absent publisher and installer surfaces.
- [ ] Implement pure `planLedgerOperation` for `publish-bootstrap`,
      `publish-sanity-green`, `publish-sanity-red`, `claim-repair`,
      `renew-repair`, `bind-repair-defect`, and `release-repair`. Reject arbitrary
      paths, shell, and caller-supplied tree content.
- [ ] Implement candidate-ref publication, exact-commit
      `aitm-ledger-validated` status, fast-forward, cleanup, and three bounded
      concurrency retries.
- [ ] Extend `install` to copy the workflow/schemas/config without overwriting a
      user policy. Extend `init` to create BOOTSTRAPPING, the health issue,
      strongest supported ruleset, and a publication/readback smoke test.
- [ ] Add self-doc help for internal publisher diagnostics and `aitm doctor` TIA
      output.
- [ ] Run focused tests and Develop verification; expect PASS.
- [ ] Commit as `feat(tia): publish and protect the TIA ledger [#<issue>]`.

**Verification:** Protected mode is reported only after an exact candidate
status plus fast-forward/readback succeeds; otherwise doctor prints cooperative
mode and its missing guarantee.

**Migration gate:** `init` creates BOOTSTRAPPING and never emits GREEN. Existing
projects remain inactive until an operator explicitly runs the upgraded init.

### Task 7: Implement Project Health and Scheduled Authority (Phase 4)

**Prerequisites:** Task 6 and compatible full-scope Cloud Test evidence.

**Files:**

- Create: `scripts/task-tracker/lib/tia/project-health.mjs`
- Create: `scripts/task-tracker/lib/tia/health-issue.mjs`
- Create: `scripts/task-tracker/lib/tia/sanity-run.mjs`
- Create: `templates/workflows/aitm-tia-sanity.yml`
- Create: `scripts/tests/unit/task-tracker/lib/tia/project-health.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/health-issue.test.mjs`
- Create: `scripts/tests/integration/task-tracker/tia/sanity-run.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Tests:** Exercise every transition in the spec table. Missing/stale marker,
branch/issue disagreement, mixed same-SHA retries, failed projection, and health
older than 36 hours all produce UNKNOWN or RED, never GREEN.

- [ ] Add RED table-driven tests for `evaluateProjectHealth`, including
      BOOTSTRAPPING pass/fail, GREEN refresh/failure/expiry, RED repair pass and
      post-merge full pass, and UNKNOWN trusted pass/fail.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/project-health.test.mjs scripts/tests/unit/task-tracker/lib/tia/health-issue.test.mjs scripts/tests/integration/task-tracker/tia/sanity-run.test.mjs`.
      Expected: FAIL because health authority does not exist.
- [ ] Implement a parser/renderer for the versioned
      `aitm-project-health` marker and require agreement with
      `health/status.json`, exact data SHA, source SHA, and sanity run.
- [ ] Implement nightly 07:00 UTC concurrency against an exact pinned trunk SHA.
      Execute every configured lane and publish full-scope artifacts before a
      typed GREEN/RED ledger operation.
- [ ] Preserve the last known-good snapshot/model on RED. Treat mixed retry
      outcomes as unstable RED. If issue projection fails, expose operational
      UNKNOWN even when the branch contains a decision.
- [ ] Run focused tests, workflow Prettier, and Develop verification; expect
      PASS.
- [ ] Commit as `feat(tia): add scheduled project-health authority [#<issue>]`.

**Verification:** A first complete pass is the only path from BOOTSTRAPPING to
GREEN; a merge or selected-only PR pass cannot clear RED.

**Migration gate:** Keep the ordinary admission gate advisory until one
scheduled full run publishes a matching GREEN branch record and issue marker.

### Task 8: Enforce Fail-Closed AITM and PR Admission (Phase 5A)

**Prerequisites:** Task 7 has produced one matching GREEN baseline.

**Files:**

- Create: `scripts/task-tracker/lib/tia/health-admission.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/health-admission.test.mjs`
- Create: `scripts/tests/slow/task-tracker/lib/health-admission-wiring.test.mjs`
- Create: `templates/workflows/aitm-tia-admission.yml`
- Modify: `scripts/task-tracker/lib/verb-preflight.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `.github/workflows/ci.yml`

**Tests:** Enumerate every mutating verb and prove RED/UNKNOWN refusal except
read-only diagnosis, recovery validation, repair operations, sanctioned repair
defect creation, and work bound to the active repair issue.

- [ ] Add RED policy and wiring tests. Assert the lightweight PR admission job
      runs before checkout/npm and prevents expensive jobs on RED/UNKNOWN.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/health-admission.test.mjs scripts/tests/slow/task-tracker/lib/health-admission-wiring.test.mjs`.
      Expected: FAIL because shared preflight does not read project health.
- [ ] Implement `projectHealthAdmission` as a pure operation classifier, then
      call it from shared verb preflight before task mutation or binding.
- [ ] Make marker/data disagreement, unsupported schema, expired GREEN, and
      missing activated evidence fail closed with stable refusal codes.
- [ ] Add the read-only CI admission job with `contents: read` and
      `pull-requests: read`; gate checkout, install, build, and test jobs on its
      GREEN or matching-repair result.
- [ ] Run focused tests, workflow Prettier, and Develop verification; expect
      PASS.
- [ ] Commit as `feat(tia): enforce project-health admission [#<issue>]`.

**Verification:** RED and stale UNKNOWN refuse start, bind, lifecycle movement,
test, review, and close for an unrelated issue while status/doctor remain usable.

**Migration gate:** Required PR context changes are a separate maintainer-
approved external operation after a canary proves the stable admission name.

### Task 9: Add the Lease-Bound Repair Flow (Phase 5B)

**Prerequisites:** Task 8.

**Files:**

- Create: `scripts/task-tracker/lib/tia/repair-lease.mjs`
- Create: `scripts/task-tracker/lib/tia/repair-flow.mjs`
- Create: `scripts/task-tracker/verbs/health-repair.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/repair-lease.test.mjs`
- Create: `scripts/tests/integration/task-tracker/tia/repair-flow.test.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/lib/self-doc.mjs`

**Tests:** Simulate concurrent claims, heartbeat, expiry/reclamation, governed
defect binding, forged label, wrong nonce/branch/base/issue, repair merge, and
post-repair sanity. At most one repair PR may be admitted.

- [ ] Add RED tests for all lease fields and transitions. Require the sanctioned
      AITM defect creator dependency; a raw issue-creation callback is invalid.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/repair-lease.test.mjs scripts/tests/integration/task-tracker/tia/repair-flow.test.mjs`.
      Expected: FAIL because no lease planner exists.
- [ ] Implement claim, renew, bind, release, expiry, and reclaim as typed ledger
      operations serialized by workflow concurrency. Default TTL is 60 minutes;
      heartbeat is 10 minutes.
- [ ] Validate repository, health decision, data SHA, failed trunk SHA, holder,
      defect, branch, nonce, expiry, and ancestry before granting the exception.
- [ ] Orchestrate sanctioned defect reuse/creation, trunk-rooted worktree, full
      repair validation, protected merge, and immediate post-merge sanity.
- [ ] Keep health RED after PR validation and merge; only a compatible full
      post-repair pass publishes GREEN and clears the lease.
- [ ] Run focused tests and Develop verification; expect PASS.
- [ ] Commit as `feat(tia): coordinate lease-bound project repair [#<issue>]`.

**Verification:** A `build-fix` label alone never admits a PR, and expiry races
cannot produce two current leases.

**Migration gate:** Repair automation remains disabled until a sandbox
repository completes RED → lease → repair merge → full GREEN end to end.

### Task 10: Add Transparent Historical Heuristics (Phase 6)

**Prerequisites:** Task 9 and at least two compatible complete-run artifacts.

**Files:**

- Create: `scripts/task-tracker/lib/tia/aggregation.mjs`
- Create: `scripts/task-tracker/lib/tia/historical-ranker.mjs`
- Create: `scripts/task-tracker/lib/tia/escape-policy.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/aggregation.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/historical-ranker.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/escape-policy.test.mjs`

**Tests:** Deduplicate observation IDs and workflow attempts; separate selected
from full exposures; enforce five-run runtime, 20-exposure failure/co-failure,
three-pair-failure, and 30-day/two-episode flake thresholds. Deleting all
history must leave deterministic selection unchanged.

- [ ] Add RED tests for monotonic watermarks, environment/provider/ancestry
      incompatibility, decay after compatibility, additive scoring, reason
      codes, optional budget, and stable-escape attribution.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/{aggregation,historical-ranker,escape-policy}.test.mjs`.
      Expected: FAIL because aggregation/ranking are absent.
- [ ] Aggregate only validated compatible observations beyond the watermark.
      Never count an unselected test as an exposure or pass.
- [ ] Score duration, complete-run failures, churn, co-change/co-failure,
      dependency/path distance, shared tokens, criticality, cardinality, and
      provider-namespaced environment dimensions; emit each contributing reason.
- [ ] Run the ranker in shadow mode first. A confirmed attributable escape
      publishes RED, freezes the selector/model identities, disables learned
      augmentation, broadens to the complete relevant suite, and requires a
      30-run backtest plus full GREEN recovery.
- [ ] Run focused tests and Develop verification; expect PASS.
- [ ] Commit as `feat(tia): add transparent historical augmentation [#<issue>]`.

**Verification:** Randomized order and deletion tests prove historical inputs
cannot remove or defer any deterministic candidate.

**Migration gate:** Historical additions remain shadow-only until complete-run
counterfactuals demonstrate stable identities and zero floor subtraction.

### Task 11: Extract the Provider Core and Node Provider (Phase 7A)

**Prerequisites:** Task 10.

**Files:**

- Create: `scripts/task-tracker/lib/tia/provider-contract.mjs`
- Create: `scripts/task-tracker/lib/tia/provider-lock.mjs`
- Create: `scripts/task-tracker/lib/tia/providers/node.mjs`
- Create: `templates/tia/providers/node.json`
- Create: `scripts/tests/unit/task-tracker/lib/tia/provider-contract.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/node-provider.test.mjs`
- Modify: `scripts/task-tracker/lib/test-impact-selector.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs`

**Tests:** Capture the legacy selector outputs for direct/transitive imports,
changed/new/deleted tests, basename matching, manifest rules, and all lane
escalations. The Node provider must return the same test set and reasons.

- [ ] Add RED contract tests for version/capabilities/fallback, stable provider-
      namespaced test IDs, candidate union, incompatible provider failure, and
      complete-suite fallback.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/provider-contract.test.mjs scripts/tests/unit/task-tracker/lib/tia/node-provider.test.mjs scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs`.
      Expected: FAIL because the legacy implementation is not behind a provider.
- [ ] Implement the provider object with `discover`, `staticImpact`, `execute`,
      and `parseResults`. Pin its config/version/capabilities in a canonical lock
      digest.
- [ ] Move import graph, changed-test, basename, manifest, and lane logic into
      `providers/node.mjs`; retain `selectAffectedTests` as a compatibility
      wrapper during one release.
- [ ] Union all provider candidates before historical ranking. A missing,
      incompatible, or failed provider selects its complete affected platform
      suite.
- [ ] Run focused tests and Develop verification; expect PASS.
- [ ] Commit as `refactor(tia): extract the Node provider contract [#<issue>]`.

**Verification:** Golden parity tests show no Node deterministic selection
change across extraction.

**Migration gate:** Do not publish the reusable third-party protocol until both
Node and the iOS dogfood provider have exercised it.

### Task 12: Dogfood the iOS/Swift Provider (Phase 7B)

**Prerequisites:** Task 11 and an available Xcode fixture runner; non-macOS CI
must consume checked-in sanitized `.xcresult` JSON fixtures instead of skipping
parser tests.

**Files:**

- Create: `scripts/task-tracker/lib/tia/providers/ios.mjs`
- Create: `templates/tia/providers/ios.json`
- Create: `scripts/tests/fixtures/tia-ios/project.json`
- Create: `scripts/tests/fixtures/tia-ios/xcresult-tests.json`
- Create: `scripts/tests/fixtures/tia-ios/xcresult-coverage.json`
- Create: `scripts/tests/unit/task-tracker/lib/tia/ios-provider.test.mjs`
- Create: `scripts/tests/integration/task-tracker/tia/ios-provider-macos.test.mjs`
- Modify: `scripts/task-tracker/lib/tia/provider-contract.mjs`

**Tests:** Normalize Xcode schemes/plans and SwiftPM targets; produce stable
bundle/class/method IDs; include simulator runtime, device family, OS,
architecture, configuration, and scheme in environment identity; parse bounded
results and coverage edges.

- [ ] Add RED fixture parser tests and a macOS integration test that uses an
      injected process runner for `xcodebuild -list -json`,
      `xcodebuild -showTestPlans`, `xcodebuild test`, the xcresult test-results
      command, and the xcresult metrics command.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/ios-provider.test.mjs`.
      Expected: FAIL because the provider is absent.
- [ ] Implement discovery, SwiftPM/Xcode relationship mapping, normalized IDs,
      execution plan creation, result parsing, summarized coverage edges, and
      iOS-specific full-lane escalation. Never commit `.xcresult` bundles.
- [ ] Refine the shared provider contract only where both Node and iOS require
      the capability; repeat the complete Node test cases after any contract
      edit.
- [ ] Run the unit test on every platform, the integration test on macOS, Node
      provider tests, and Develop verification; expect PASS.
- [ ] Commit as `feat(tia): add the iOS provider [#<issue>]`.

**Verification:** A polyglot fixture unions Node and iOS candidates before
ranking, and removing either provider broadens only that provider's platform to
its complete suite.

**Migration gate:** Official Node/iOS templates ship through normal install/init
only after the macOS dogfood receipt is archived and the provider lock is stable.

### Task 13: Gate and Activate Learned Ranking (Phase 8)

**Prerequisites:** Task 12, at least 200 compatible complete labeled runs, at
least 30 stable positive outcomes, and a reviewed backtest policy.

**Files:**

- Create: `scripts/task-tracker/lib/tia/model-candidate.mjs`
- Create: `scripts/task-tracker/lib/tia/model-policy.mjs`
- Create: `scripts/task-tracker/lib/tia/backtest.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/tia/model-policy.test.mjs`
- Create: `scripts/tests/integration/task-tracker/tia/model-activation.test.mjs`

**Tests:** Reject insufficient samples/positives, feature-schema drift,
provider/environment mismatch, missing observation hashes, worse recall or
escape rate than baseline, poor calibration, and stale backtests. The last
known-good model remains active on every rejection.

- [ ] Add RED tests that construct baseline/candidate receipts and require
      recorded feature schema, training hashes, parameters, calibration, recall,
      escape rate, window, provider/environment scope, and comparison result.
- [ ] Run
      `node --test scripts/tests/unit/task-tracker/lib/tia/model-policy.test.mjs scripts/tests/integration/task-tracker/tia/model-activation.test.mjs`.
      Expected: FAIL because activation policy is absent.
- [ ] Implement deterministic feature extraction and backtest evaluation. The
      model may rank/add optional candidates only; it cannot alter mandatory
      membership.
- [ ] Route activation through `publish-sanity-green` core policy and persist a
      validation receipt. A rejected candidate produces evidence without
      changing `models/active.json`.
- [ ] On a confirmed escape, deactivate learned augmentation, preserve the model
      receipt, broaden validation, and require the 30-run backtest plus GREEN
      complete run before reactivation.
- [ ] Run focused tests and Develop verification; expect PASS.
- [ ] Commit as `feat(tia): gate learned ranking activation [#<issue>]`.

**Verification:** With the model and all learned state deleted, selection still
contains the identical deterministic floor.

**Migration gate:** Repositories below thresholds remain on transparent
heuristics indefinitely; activation is never forced by version upgrade.

### Task 14: Complete Installation, Doctor, Documentation, and End-to-End Rollout

**Prerequisites:** Tasks 1-13.

**Files:**

- Create: `docs/tia.md`
- Create: `templates/references/tia-operations.md`
- Create: `scripts/tests/slow/task-tracker/tia/tia-e2e.test.mjs`
- Modify: `README.md`
- Modify: `bin/cli.mjs`
- Modify: `bin/lib/template-manifest.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/install.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/help.test.mjs`
- Modify: `package.json`

**Tests:** In sandbox repositories, cover bootstrap, protected and cooperative
modes, selected PR, merge group, nightly GREEN, stale UNKNOWN, RED, lease-bound
repair, post-repair GREEN, invalid-head recovery, unsupported schema fallback,
Node/iOS union, and learned-state deletion.

- [ ] Add the RED end-to-end matrix and install/help parity tests. Use fake GitHub
      transport and real Git repositories; never mutate a live ruleset or source
      project from the test.
- [ ] Run
      `node --test scripts/tests/slow/task-tracker/tia/tia-e2e.test.mjs scripts/tests/unit/task-tracker/lib/install.test.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs`.
      Expected: FAIL on missing documentation/install/doctor parity.
- [ ] Document normal install/init, provider configuration, policy defaults,
      receipts, health meanings, repair lease, protected/cooperative guarantees,
      data recovery, schema upgrade, and disclosure boundaries.
- [ ] Make doctor report effective provider lock, policy digest, data SHA,
      snapshot/model identity, health freshness/agreement, protection mode,
      workflow presence, and exact remediation for every degraded state.
- [ ] Add installed templates/schemas/workflows to package coverage and verify
      `npm pack` includes runtime assets but excludes test fixtures.
- [ ] Run the focused matrix, `npm test`, `npm run test:slow`, `npm run lint`,
      `npm run format:check`, and `git diff --check`; all must pass.
- [ ] Commit as `docs(tia): complete rollout and operations [#<issue>]`.

**Verification:** A fresh sandbox reaches GREEN only through a complete run;
ordinary work is refused after stale/RED evidence; repair returns to GREEN only
after post-merge sanity; deterministic selection survives deletion of all local,
artifact, snapshot, and model learning data.

**Migration gate:** General availability requires the full end-to-end matrix,
an archived protected-mode smoke test, an archived cooperative-mode smoke test,
and maintainer approval of the exact required-context/ruleset delta. Rollback
disables learned/historical augmentation first, then affected-only PR execution;
it never fabricates GREEN or rewrites ledger history.

## Plan Self-Review Checklist

- [ ] Every requirement in specification Sections 1-24 maps to a task or Global
      Constraint.
- [ ] Every phase has explicit prerequisites, exact files, focused tests,
      verification commands, and a migration gate.
- [ ] The pinned Cloud Test dependency remains exactly
      `39647d6ce7670326e46e09680b0dda45fb113642`.
- [ ] No task authorizes external ruleset mutation without the maintainer's
      separate approval of the exact delta.
- [ ] No placeholder, unknown interface, unbounded raw artifact, or second
      authority store remains.
- [ ] Interface names and record identities match from selection through Cloud
      Test, ledger publication, health, repair, providers, and model activation.
