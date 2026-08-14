# Coverage Gap Backlog — raise all files to ≥ 80 % statement coverage

**Generated:** 2026-06-28  
**Baseline run:** `npm run test:coverage` (c8, Node built-in test runner)  
**Threshold:** 80 % statements AND 80 % lines  
**Files below threshold:** 70

---

## How to use this plan

Each section below is a self-contained backlog story. File each as a GitHub
issue with `Size` and `Estimate` set before work begins, then drive through the
normal verb chain. Stories within a group are independent unless a dependency
note says otherwise.

---

## Group A — Zero-coverage verb files (0 %) [CRITICAL]

These files are imported but never directly exercised by any test. Each needs
a focused unit-test file added under
`scripts/tests/unit/task-tracker/verb-<name>.test.mjs` (or a slow-lane file
if the verb makes real GH calls that cannot be stubbed cheaply).

| File                                              | Lines | Notes                                                                                 |
| ------------------------------------------------- | ----- | ------------------------------------------------------------------------------------- |
| `scripts/task-tracker/verbs/ac-stamp.mjs`         | 104   | Uses `evidence-runner`, `ac-evidence`, `mutateIssueBody` — all stub-able via DI       |
| `scripts/task-tracker/verbs/dod-stamp.mjs`        | 136   | Mirrors `ac-stamp` pattern; shares `evidence-runner`                                  |
| `scripts/task-tracker/verbs/auto.mjs`             | 63    | `runAuto` already has DI seam (`loadSession`/`saveSession`) — wire a stub and call it |
| `scripts/task-tracker/verbs/fleet.mjs`            | 73    | Pure read + prune; can drive `fleetList`/`fleetPrune` with fake fleet-registry        |
| `scripts/task-tracker/verbs/kind.mjs`             | 64    | `verbKind` thin wrapper over `setIssueKindMarker`; stub `mutateIssueBody`             |
| `scripts/task-tracker/verbs/mirror-deep-dive.mjs` | 61    | Single path; stub `mutateIssueBody` + `pexec`                                         |
| `scripts/task-tracker/verbs/update.mjs`           | 46    | Thin wrapper over `flushActiveToGH`; stub the flush fn                                |

**Story estimate:** 1–2 h each; 7 stories totalling ~12 h.

### Story A1 — unit tests for `ac-stamp` and `dod-stamp` (sibling pair)

- Add `verb-ac-stamp.test.mjs` covering: happy-path stamp, verifier non-zero exit refuses, AC label not found error
- Add `verb-dod-stamp.test.mjs` covering: happy-path stamp, key not found, verifier failure
- Stub `runVerifiers`, `mutateIssueBody`, `findEvidenceAc`, `stampAcEvidenceAndReconcile` via import-mock / DI override

### Story A2 — unit tests for `auto` verb

- `verbAuto` in `verbs/auto.mjs` calls `runAuto` which accepts `loadSession`/`saveSession` deps
- Add `verb-auto.test.mjs`: valid choices (both/plan/review/off/reset), invalid choice error, unknown-issue guard, "nothing active" guard

### Story A3 — unit tests for `fleet` verb

- Add `verb-fleet.test.mjs`: `fleetList` with empty registry, with prunable entries; `fleetPrune` removes stale rows
- Fake `fleetRegistryPath` to a tmp file

### Story A4 — unit tests for `kind` verb

- Add `verb-kind.test.mjs`: set valid kind, remove kind (`code`), invalid kind rejects, missing issue guard
- Stub `mutateIssueBody`, `loadState`

### Story A5 — unit tests for `mirror-deep-dive` verb

- Add `verb-mirror-deep-dive.test.mjs`: deep-dive content copied, already-present guard, missing source guard
- Stub `mutateIssueBody`, `pexec`

### Story A6 — unit tests for `update` verb

- Add `verb-update.test.mjs`: nothing active → log, active → flush called; stub `flushActiveToGH`, `loadState`

---

## Group B — Zero-coverage utility / CLI scripts (0 %)

These are top-level scripts invoked from shell, not called by verb dispatch.
Prefer unit-testing the extracted pure functions; CLI integration can be covered
with `execFileSync` smoke tests.

| File                                                | Lines | Priority | Approach                                                 |
| --------------------------------------------------- | ----- | -------- | -------------------------------------------------------- |
| `scripts/task-tracker/orchestrator-lock.mjs`        | 109   | High     | Unit: `acquire`, `release`, `status` against a tmp dir   |
| `scripts/task-tracker/config-get.mjs`               | 36    | Medium   | Smoke: exec with `--help` / known key                    |
| `scripts/task-tracker/tag-story-ids.mjs`            | 113   | Medium   | Unit: parse/tag functions against fixture bodies         |
| `scripts/task-tracker/heal-timing-starts-sweep.mjs` | 168   | Low      | Unit: pure transform logic; CLI integration is expensive |
| `scripts/task-tracker/lib/apply-reevaluate.mjs`     | 208   | High     | Unit: `applyReevaluate` with stubbed GH calls            |
| `scripts/task-tracker/verify-epic-114.mjs`          | 62    | Low      | Smoke only (deprecated, one-off)                         |
| `scripts/task-tracker/verify-sweep-comment.mjs`     | 73    | Low      | Smoke only                                               |
| `scripts/gh/migrate-project.mjs`                    | 158   | Medium   | Unit: `buildFieldSyncPlan` + dry-run code path           |
| `scripts/gh/verify-priority-p3.mjs`                 | 49    | Low      | Smoke                                                    |
| `scripts/providers/provider-adapter.mjs`            | 18    | High     | Unit: adapter routing — only 18 lines, trivial to cover  |

### Story B1 — orchestrator-lock unit tests

- `acquire` writes lock, refuses if unexpired lock exists, replaces expired lock
- `release` removes lock idempotently
- `status` returns correct JSON
- Drive via `execFileSync` against a tmp `--dir` flag or extract pure fns

### Story B2 — apply-reevaluate unit tests

- `applyReevaluate` re-evaluates gate fields; stub `mutateIssueBody` + `writeProjectFieldValue`
- Cover: no-op (nothing changed), at least one field updated, partial update

### Story B3 — provider-adapter unit tests

- Only 18 lines — import and call `adapt()` with all supported provider stubs

### Story B4 — orchestrate heal-timing-starts-sweep unit tests

- Extract and test `healTimingStartsSweep(issues, opts)` pure logic with fixture issue arrays

### Story B5 — tag-story-ids / migrate-project / config-get smoke tests

- Add a single smoke test file per script: `execFileSync` with `--help` or dry-run flags, assert exit 0

---

## Group C — Verb files 45–70 % coverage

These verbs have partial tests but significant uncovered branches.

| File                         | Stmts% | Key uncovered areas                                       |
| ---------------------------- | ------ | --------------------------------------------------------- |
| `verbs/check.mjs`            | 48 %   | Many branch paths in gate evaluation; error flows         |
| `verbs/commit-trace.mjs`     | 46 %   | Entire second half of the file (lines 16–33)              |
| `verbs/evidence-markers.mjs` | 47 %   | Marker-write paths, error branches                        |
| `verbs/close.mjs`            | 55 %   | Post-close cleanup, error exits, sub-issue guard          |
| `verbs/plan-approve.mjs`     | 56 %   | Rejection path, body-write failure, non-epic path         |
| `verbs/demote.mjs`           | 51 %   | Multi-state demotion paths                                |
| `verbs/plan.mjs`             | 64 %   | Epic-child recursion, pre-existing plan guard             |
| `verbs/approve.mjs`          | 67 %   | Full-auto path, already-approved guard, sub-issue cascade |
| `verbs/reconcile.mjs`        | 61 %   | Partial-reconcile, no-drift path, error recovery          |
| `verbs/supersede.mjs`        | 71 %   | Superseded-already guard, error paths                     |
| `verbs/promote.mjs`          | 76 %   | Worktree-already-exists path, promotion failure           |
| `verbs/review.mjs`           | 76 %   | Review-skipped path, comment body failures                |
| `verbs/block.mjs`            | 76 %   | Already-blocked, unblock-on-close                         |
| `verbs/unblock.mjs`          | 77 %   | Blocker-still-open guard, idempotent unblock              |

### Story C1 — coverage for `check` verb (target: ≥ 80 %)

Highest-impact single file. Add `verb-check-branches.test.mjs`:

- All gate variants (plan-approved, deep-dive, code-complete, ac-evidence)
- Missing-marker error paths
- `--fix` flag auto-stamps where possible

### Story C2 — coverage for `close` verb (target: ≥ 80 %)

Add or extend `verb-close-branches.test.mjs`:

- Sub-issue guard (cannot close parent with open children)
- Post-close field update
- Already-closed idempotent path
- Error from timing-log write failure

### Story C3 — coverage for `commit-trace`, `evidence-markers`, `config` verbs

- `commit-trace.mjs`: lines 16–33 are the actual trace write — add stub for `pexec` returning non-zero
- `evidence-markers.mjs`: marker-write path, existing-marker update, delete path
- `config.mjs`: all three sub-commands (get / set / list)

### Story C4 — coverage for `plan-approve`, `plan`, `demote` verbs (target: ≥ 80 % each)

- `plan-approve`: rejection flow, non-epic issue path, body-write error
- `plan`: epic-child plan recursion, overwrite-existing-plan guard
- `demote`: multi-hop demotion (Develop→Plan, Plan→Refine, Refine→Backlog)

### Story C5 — coverage for `approve`, `reconcile`, `supersede` verbs

- `approve`: full-auto footnote path, already-approved guard, cascade to sub-issues
- `reconcile`: no-drift path, partial-field reconcile
- `supersede`: superseded-already guard, error rollback

### Story C6 — coverage for `promote`, `review`, `block`, `unblock` verbs

- `promote`: worktree-already-exists path, promotion failure rollback
- `review`: review-comment failure, skip-on-no-diff path
- `block`: already-blocked idempotency, body-marker write
- `unblock`: blocker-still-open guard, idempotent call

---

## Group D — Library files 60–79 % coverage

| File                                 | Stmts% | Key gaps                                             |
| ------------------------------------ | ------ | ---------------------------------------------------- |
| `lib/state-recording.mjs`            | 78 %   | Lines 82–117 (concurrent-write guard)                |
| `lib/verb-preflight.mjs`             | 75 %   | Lines 263–278 (chore-mode + worktree checks)         |
| `lib/unpark-dependents.mjs`          | 66 %   | Lines 107–108, 145–146 (error + no-dependents paths) |
| `lib/move-state/audit-timing.mjs`    | 63 %   | Lines 181, 189, 195–226 (sweep + edge cases)         |
| `lib/move-state/cache-unpark.mjs`    | 72 %   | Lines 127–128, 160–168 (cache-miss paths)            |
| `lib/move-state/guard-execution.mjs` | 81 %   | Lines 222–248, 267–268 (guard-failure cascade)       |
| `lib/move-state/github-mutation.mjs` | 93 %   | Lines 123–124, 134–141 (retry + error)               |
| `lib/refine-to-plan-gate.mjs`        | 74 %   | Functions < 33 % (missing field paths)               |
| `lib/close-gates.mjs`                | 80 %   | Functions < 67 %                                     |
| `lib/apply-review-delta.mjs`         | 78 %   | Branch < 56 % (non-delta path)                       |
| `lib/blocked-by-field.mjs`           | 61 %   | Lines 60+ (write + clear paths)                      |
| `lib/stamp-start-time.mjs`           | 35 %   | Majority uncovered (only check path tested)          |

### Story D1 — stamp-start-time coverage (target: ≥ 80 %)

`stamp-start-time.mjs` is at 35 % — the stamp-write path is almost entirely untested.

- Happy-path stamp via stubbed `mutateIssueBody`
- Already-stamped idempotent path
- Missing-issue error

### Story D2 — state-recording concurrent-write path

Lines 82–117 are the concurrent-write serialization guard:

- Add test for write when lock contended (stub lock timeout)
- Add test for stale-lock recovery

### Story D3 — unpark-dependents error + no-dependents paths

- No-dependents: returns empty array without calling GH
- GH error on unpark: logs and continues (non-fatal)

### Story D4 — audit-timing sweep / edge cases

Lines 195–226 cover the multi-row timing sweep:

- Empty timing log
- Log with only one row
- Duplicate start-rows trigger heal path

### Story D5 — lib/blocked-by-field write and clear paths

At 61 %, the set/clear mutation paths are untested:

- `setBlockedByField` — stub `writeProjectFieldValue`
- `clearBlockedByField` — stub + assert field value reset

### Story D6 — refine-to-plan-gate missing-field paths

At 74 % stmt / 33 % functions — missing required fields each trip a distinct guard:

- Missing Priority
- Missing Estimate
- Missing Size
- Missing Labels
- All present → passes

---

## Group E — Heal / backfill scripts 50–70 %

| File                           | Stmts% | Effort            |
| ------------------------------ | ------ | ----------------- |
| `heal-timing-starts.mjs`       | 51 %   | Medium            |
| `heal-functional-dod.mjs`      | 53 %   | Medium            |
| `heal-backlog.mjs`             | 53 %   | High (large file) |
| `heal-entry-markers.mjs`       | 66 %   | Medium            |
| `heal-refine-entry-marker.mjs` | 39 %   | Medium            |
| `backfill-plan-metadata.mjs`   | 49 %   | Medium            |
| `backfill-timing-logs.mjs`     | 57 %   | Medium            |
| `backfill-vc-sections.mjs`     | 57 %   | Low               |
| `migrate-plan-approved.mjs`    | 67 %   | Low               |
| `migrate-fields-encoding.mjs`  | 32 %   | Medium            |
| `source-edit-gate.mjs`         | 60 %   | Medium            |

All heal / backfill scripts follow the same pattern: parse, transform, write.
The pure transform logic is trivially testable via fixture bodies.

### Story E1 — heal-timing-starts pure-logic tests

- `healTimingStarts(rows)` → collapsed rows (pure function)
- Multi-start input, already-canonical input, empty input
- `--check-only` vs `--apply` flag routing (exec smoke test)

### Story E2 — heal-backlog field-normalize tests

- `normalizeBodyEncoding(body)` fixture-based
- `reconcileAitmFields(body, timingRows)` fixture-based
- `validateSchema(fields)` fixture-based

### Story E3 — heal-entry-markers and heal-refine-entry-marker

- `stampEntryMarker(body, stage, ts)` — fixture bodies, idempotent call
- `healRefineEntryMarker(body)` — body with marker present, absent, malformed

### Story E4 — backfill-plan-metadata / backfill-timing-logs / backfill-vc-sections

- Unit-test the transform functions with fixture issue bodies
- Smoke `--dry-run` mode returns non-error exit code

### Story E5 — migrate-fields-encoding / migrate-plan-approved

- `migrateEncoding(body)` and `migratePlanApproved(body)` pure transforms
- Fixture: old encoding → expected new encoding
- No-op when already migrated

### Story E6 — source-edit-gate

- Gate passes when edit is in `scripts/` subtree
- Gate rejects edit to a protected path
- Config-override path

---

## Group F — GH scripts 60–79 %

| File                              | Stmts% |
| --------------------------------- | ------ |
| `gh/lib/github-projects.mjs`      | 67 %   |
| `gh/lib/list-issues.mjs`          | 30 %   |
| `gh/set-priority.mjs`             | 72 %   |
| `gh/init-repair.mjs`              | 73 %   |
| `gh/dispatch-prep.mjs`            | 31 %   |
| `gh/verify-open-issue-bodies.mjs` | 66 %   |

These call the GitHub CLI heavily. Unit tests should stub `gh(...)` / `gql(...)`.

### Story F1 — github-projects.mjs uncovered paths

At 67 %: `fieldOptionMap`, `projectValuesForIssue`, `writeProjectFieldValue` error branches.

- Add `lib/github-projects.test.mjs` with a `gh`/`gql` stub injected via module mock

### Story F2 — list-issues.mjs (30 %)

Very low — most of the file is uncovered.

- Stub `gh` to return paginated fixture JSON
- Cover: empty result set, multi-page result, error response

### Story F3 — dispatch-prep.mjs (31 %)

- Extract pure prep logic from CLI driver
- Unit: prompt-body construction, variable-substitution

### Story F4 — set-priority, init-repair, verify-open-issue-bodies

- `set-priority.mjs`: `--cascade` path, already-correct-priority no-op
- `init-repair.mjs`: each repair step with a stub `gh` call
- `verify-open-issue-bodies.mjs`: body-missing alert, body-present pass

---

## Group G — bin/CLI and hook-handler

| File                                                    | Stmts% |
| ------------------------------------------------------- | ------ |
| `bin/cli.mjs`                                           | 71 %   |
| `scripts/task-tracker/hook-handler.mjs`                 | 18 %   |
| `scripts/task-tracker/hooks/codex-prompt-timestamp.mjs` | 74 %   |

### Story G1 — cli.mjs dispatch coverage (target: ≥ 80 %)

The CLI dispatch table is partially covered. Missing paths:

- Unknown verb → help output
- `--version` flag
- Unbound-issue guard for verbs that require binding

### Story G2 — hook-handler coverage (18 % — HIGH PRIORITY)

`hook-handler.mjs` is at 18 %. This is runtime-critical (PreToolUse hooks).

- Extract and unit-test each handler function
- Stub `loadState`, `loadConfig`, event fixture objects
- Cover: tool-allowed path, tool-blocked path, error-in-handler (non-fatal)

### Story G3 — codex-prompt-timestamp hook

At 74 %; the timestamp-injection and passthrough paths:

- Inject → timestamp prepended to output
- Passthrough → output unchanged
- Error-in-source → graceful fallback

---

## Group H — generate-value-report (10 %)

`scripts/reports/generate-value-report.mjs` is 1049 lines and at 10 %.
This is the largest uncovered file in the codebase.

### Story H1 — extract and unit-test report pure functions

The report file mixes data-fetching and HTML-generation. Refactor step is
required before test coverage can improve meaningfully:

1. Extract `buildIssueRows(issues, opts)` → pure function returning data array
2. Extract `renderHtml(rows, opts)` → pure function returning HTML string
3. Extract `computeValueMetrics(rows)` → aggregation pure function
4. Add unit tests for each extracted function (fixture issue arrays)
5. Smoke test: exec `--html --output .tmp/report-smoke --issues 1` with stubbed `gh`

**Estimate:** 6–8 h (refactor + tests)

---

## Priority order for backlog filing

1. **G2** — hook-handler (runtime-critical, 18 %)
2. **H1** — generate-value-report refactor + tests (largest gap)
3. **A1–A6** — zero-coverage verb files (quick wins, DI seams ready)
4. **B1–B2** — orchestrator-lock, apply-reevaluate
5. **C1–C2** — check verb, close verb (most used, most branches)
6. **D1** — stamp-start-time (35 %)
7. **F2–F3** — list-issues, dispatch-prep (30–31 %)
8. **D2–D6, C3–C6, E1–E6, F1, F4, G1, G3** — remaining medium-priority

---

## Coverage target summary

| Group                       | Files  | Avg Stmts% now | Target |
| --------------------------- | ------ | -------------- | ------ |
| A — zero-coverage verbs     | 7      | 0 %            | ≥ 80 % |
| B — zero-coverage utilities | 10     | 0 %            | ≥ 80 % |
| C — partial verbs           | 14     | 62 %           | ≥ 80 % |
| D — library files           | 12     | 72 %           | ≥ 80 % |
| E — heal/backfill           | 11     | 55 %           | ≥ 80 % |
| F — GH scripts              | 6      | 57 %           | ≥ 80 % |
| G — CLI / hooks             | 3      | 54 %           | ≥ 80 % |
| H — value report            | 1      | 10 %           | ≥ 80 % |
| **Total**                   | **64** |                |        |
