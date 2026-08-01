# Execution Performance and Adaptive Estimation Design

**Date:** 2026-08-01

**Status:** Approved in chat

**Predecessors:** Epic #859, closed-not-planned issue #945, completed issue
number 1069, and paused issue #1070

**Delivery plans:**

- `docs/superpowers/plans/2026-08-01-stage-aware-verification-evidence.md`
- `docs/superpowers/plans/2026-08-01-feature-oriented-test-fixtures.md`
- `docs/superpowers/plans/2026-08-01-adaptive-estimation-rubrics.md`

## Goal

Reduce the time and cost required to deliver each AITM story without weakening
its evidence, Test isolation, review gates, or human accountability. The system
must also learn from completed work so later Plan estimates, AI forecasts, and
work-breakdown recommendations reflect the repository's observed execution
costs.

The immediate problem is repeated verification. Develop, Test, and Review can
execute overlapping lint, format, unit, integration, and slow checks even when
the code and verification environment have not changed. Test startup and data
fixture construction also repeat across hundreds of files. These costs inflate
agent engaged time while producing little additional confidence.

The design delivers three backlog stories:

1. stage-aware verification with exact-SHA evidence reuse;
2. feature-oriented test-fixture consolidation; and
3. versioned empirical estimation rubrics with a separate AI forecast.

Stories 1 and 2 complete before paused issue #1070 resumes. Story 3 begins only
after #1070 supplies its GitHub comment-store interface.

## Non-Goals

- Removing the clean isolated Test-stage sandbox.
- Skipping a full Test-stage verification for a new committed implementation.
- Replacing human Plan or Review approval semantics.
- Treating a local database or timing file as durable authority.
- Predicting human effort by scaling the measured AI duration.
- Converting every test into one repository-wide fixture or test process.
- Reopening #945 with its obsolete acceptance criteria.
- Adding a separate epic contingency field. The parent epic estimate remains
  the sum of its children.

## Governing Decisions

### Verification is stage-owned

Each class of verification has one owning stage for a particular committed
source state:

| Work                                 | Develop iteration | Develop finalization                 | Test                          | Review                            |
| ------------------------------------ | ----------------- | ------------------------------------ | ----------------------------- | --------------------------------- |
| Autofix/format changed files         | Yes               | As needed before final commit        | No                            | No                                |
| Scoped lint/format check             | Yes               | No                                   | No                            | Targeted only after a finding     |
| Full lint and format check           | No                | Exactly once at final SHA            | Reuse valid receipt           | Reuse Test receipt                |
| Impact-selected tests                | Yes               | Optional final targeted confirmation | No                            | Targeted only after a finding     |
| Complete unit/integration/slow lanes | No                | No                                   | Exactly once in clean sandbox | Reuse Test receipt                |
| Reviewer probes                      | No                | No                                   | No                            | Only commands arising from review |

"Exactly once" means once for an unchanged committed SHA and unchanged
verification fingerprint. A failing command may be rerun after the failure is
fixed; the new run supersedes the failed attempt rather than hiding it.

### Develop has iteration and finalization modes

Develop iteration optimizes feedback latency. It selects changed or affected
tests and limits lint/format work to changed paths where the tool permits it.
It never runs the complete unit, integration, or slow lanes.

Develop finalization occurs after implementation is committed and the worktree
is clean. It runs the repository's complete lint and format-check commands once
against that exact commit and emits an immutable verification receipt. If an
autofix changes a tracked file, finalization stops: the agent must inspect and
commit the change, then finalize the new SHA.

### Test owns full regression

Test runs in the existing specialized clean sandbox at the exact final Develop
SHA. Before running commands, it validates the Develop finalization receipt.
Valid lint and format evidence is reused. Missing, malformed, red, stale, or
fingerprint-mismatched evidence is not silently trusted; Test either executes
the affected commands once and records why reuse was refused, or fails closed
when the repository contract requires Develop to produce the receipt.

The complete unit, integration, and slow lanes then run once. Successful Test
produces one exact-SHA receipt that Review and close gates can validate.

### Review consumes evidence

Review validates the Test receipt and existing `aitm-test-started`/
`aitm-dod-verified` SHA markers. It does not rerun standard DoD commands. A
reviewer may run a focused probe that is necessary to investigate a concrete
finding, and that probe is appended to the Review evidence.

Any tracked code or test change invalidates the Test receipt. The issue returns
to Develop, produces a new finalization receipt, and receives one new Test pass
before Review continues. Documentation-only exceptions must be explicit in the
existing source-edit policy; this design does not broaden them.

## Verification Receipt Contract

The first story introduces a versioned receipt independent of the legacy HTML
markers. Until the GitHub-native authority migration reaches these stages, the
receipt is rendered into the existing authoritative issue evidence surface and
the legacy markers continue to be stamped for compatibility.

```json
{
  "schema": "aitm.verification-receipt/v1",
  "receiptId": "01J...",
  "issue": 123,
  "stage": "develop-final",
  "commitSha": "40-hex-sha",
  "startedAt": "2026-08-01T18:00:00.000Z",
  "completedAt": "2026-08-01T18:01:00.000Z",
  "environment": {
    "node": "v22.0.0",
    "platform": "darwin-arm64",
    "lockfileHash": "sha256:...",
    "configHashes": {
      "package.json": "sha256:...",
      "eslint": "sha256:...",
      "prettier": "sha256:...",
      "test-impact": "sha256:..."
    },
    "sandbox": {
      "kind": "worktree",
      "identity": "/canonical/path-or-stable-id",
      "clean": true
    }
  },
  "commands": [
    {
      "classification": "lint-full",
      "command": "npm run lint",
      "args": [],
      "exitCode": 0,
      "durationMs": 1234
    }
  ],
  "supersedes": null
}
```

Command identity is the normalized executable plus arguments, not a display
label. Receipt validation requires:

- the complete commit SHA matches current `HEAD`;
- every required command classification appears once and is green;
- Node major version, platform, lockfile, and relevant configuration hashes
  match the consuming environment;
- the producing worktree/sandbox was clean;
- timestamps and durations are valid and non-negative; and
- the receipt schema and payload are recognized and well formed.

The validator returns structured reasons such as `sha-mismatch`,
`lockfile-mismatch`, `config-mismatch`, `command-missing`, `command-red`, or
`receipt-malformed`. Consumers never reduce these to a boolean before recording
why evidence was reused or rejected.

## Develop Test-Impact Selection

Affected tests are selected by a hybrid model:

1. changed and newly created `*.test.mjs` files are always included;
2. static ESM import relationships map changed modules and fixture helpers to
   direct and transitive test consumers;
3. the existing co-located/basename mapping remains a compatibility signal;
4. a small checked-in manifest describes relationships static imports cannot
   see, including CLI subprocesses, dynamic imports, generated paths, and
   cross-process fixtures; and
5. high-blast-radius files conservatively select a lane or the complete suite.

The checked-in manifest is
`scripts/task-tracker/test-impact-manifest.json`. Its entries use repository
relative POSIX paths and support these actions:

```json
{
  "schema": 1,
  "rules": [
    {
      "sources": ["scripts/task-tracker/runtime.mjs"],
      "tests": ["scripts/task-tracker/tests/unit/**/*.test.mjs"],
      "reason": "runtime dispatch is not fully visible through static imports"
    },
    {
      "sources": ["package-lock.json", "package.json"],
      "lanes": ["unit", "integration", "slow"],
      "reason": "dependency or command-surface change"
    }
  ]
}
```

Selection is explainable. The selector returns every selected test with one or
more reasons and reports when it expands to a full lane. An empty selection is
allowed only when no source, test, fixture, runner, dependency, or verification
configuration changed.

The selector is conservative for shared infrastructure. Changes to test
runners, lane classifiers, global test helpers, package manifests, lock files,
or verification configuration expand to the relevant full lanes. Incorrectly
omitting a test is more expensive than running a few extra targeted tests.

## Feature-Oriented Fixture Organization

The second story supersedes the intent of closed-not-planned issue #945. That
issue preserved test-file count and was contingent on a ten-minute ceiling.
The new goal is different: reduce repeated startup and fixture construction
cost while preserving readable feature boundaries and safe parallelism.

Tests may be collected into the same file when all of these are true:

- they exercise the same product feature or capability;
- they use the same lane and isolation model;
- they can share expensive immutable setup or a common process;
- mutable state can be reset reliably between tests; and
- the resulting failure scope remains understandable.

Test shape alone is not a grouping criterion. Tests for parsing, CLI behavior,
errors, and persistence may belong together when they prove one feature. Tests
with unrelated feature ownership do not belong together merely because they use
the same mock.

Within a feature file:

- nested `describe` blocks express feature and scenario boundaries;
- `before` creates expensive immutable resources shared by the collection;
- `beforeEach` resets mutable state and observations;
- `after` tears down shared resources;
- helper modules provide setup mechanics but never leak mutable state between
  test files; and
- unique temporary directories, fleet registries, repositories, and worktrees
  remain per-test when isolation is load-bearing.

Fewer, larger feature files may reduce file-level parallelism. Consolidation is
accepted only when timing evidence shows a net benefit in the relevant lane.
Test files receive a feature-fixture-specific line policy: 400 code lines is a
soft review signal and 800 code lines is a hard limit. Production-file limits
remain unchanged. Line count is a backstop, not the primary decomposition rule;
a test file must split sooner when it combines unrelated capabilities, requires
incompatible life cycles, contains expensive conditional setup unused by most
tests, becomes a slow serial bottleneck, or makes failures hard to localize.

The initial migration targets high-cost clusters identified from the timing
artifact rather than mechanically rewriting the whole tree. Baseline evidence
must distinguish actual pooled/serial elapsed time from the current timing
artifact's sum of per-file wall durations.

Acceptance requires:

- at least 25% lower elapsed time in the selected integration or subprocess
  clusters over repeated warm and cold samples;
- measurable improvement in loaded full-suite P80 elapsed time;
- no material regression in another lane;
- unchanged behavioral coverage for migrated features; and
- an amended `docs/decisions/0001-test-tree-convention.md` that records the
  feature-oriented exception and decomposition rules.

If the first cluster fails to improve after two measured compositions, the
story records the evidence, restores the clearer composition, and stops rather
than forcing consolidation.

## Estimation Authority and Learning

### Two forecasts, two meanings

`Estimate` remains human-equivalent effort: the hours a mid-level engineer is
expected to need to implement the story, including tests, normal verification,
review response, and unavoidable execution time in the current codebase.

The AI forecast is separate. It predicts agent engaged time as P50 and P80 and
may include stage-level forecasts. It is stored in a structured issue comment
and report output, never in the GitHub board Estimate field.

### Refine is provisional; Plan replaces it

Refine writes a rough Size and Estimate. Plan performs a detailed WBS using the
current rubric. By the end of Plan, `plan-estimate` must:

1. preserve the Refine value in the historical comparison comment;
2. write the approved Plan Size and human Estimate to the GitHub board;
3. update the canonical `aitm-fields` projection;
4. write or supersede the structured AI forecast comment; and
5. read back all writes and fail the Plan-to-Develop gate on divergence.

The Plan human estimate and AI forecast freeze when the issue enters Develop.
Later scope changes use the existing audited inflation/replanning path rather
than silently rewriting the baseline.

### Plan evidence packet

Every planned story receives a visible summary and structured forecast record
containing:

- Refine Size/Estimate and Plan Size/Estimate;
- the delta and rationale;
- WBS rows with human hours;
- AI P50 and P80 engaged-time forecasts, including stage allocation;
- comparable completed issues and relevant repository/test-landscape signals;
- rubric version, cohort, sample size, confidence, and known limitations;
- module, dependency, test-impact, and isolation plans;
- identified risks; and
- a recommendation to proceed, split, or refine further.

This evidence does not add a new approval gate. Existing Full-Auto behavior and
existing human Plan/Review approval semantics remain unchanged. Critical or
dangerous work continues to use the existing human-gated mode chosen by the
operator.

### Outcome and rubric records

At completion, AITM appends an outcome record with:

- actual engaged time by lifecycle stage;
- commands, durations, retries, and evidence-reuse decisions;
- review/fix cycles;
- diff breadth, modules, and affected test lanes;
- Plan-versus-actual variance and its drivers; and
- necessary implementation cost separated from avoidable process waste such as
  redundant verification.

The learning job produces an immutable, versioned rubric snapshot that names
its exact issue cohort. It maintains separate coefficients for:

- human implementation and verification effort;
- AI implementation, tool, verification, and review/rework effort;
- module and dependency breadth;
- test-lane and sandbox costs;
- review/rework probability; and
- uncertainty, sample size, and confidence.

Per-issue forecast and outcome comments are authoritative. A superseding
project-level rubric record lives on a designated governed rubric/configuration
issue. A local database or generated JSON file may cache the projection but can
always be rebuilt and cannot satisfy a gate.

Human estimates must not learn redundant AI rerun waste. The learning output
therefore reports at least two independent accuracy signals:

- **Refine accuracy:** detailed Plan human estimate versus rough Refine human
  estimate; and
- **AI forecast accuracy:** actual agent engaged time versus Plan AI P50/P80.

Outcome classification also reports avoidable process waste separately so the
system improves workflow policy rather than teaching future human estimates to
expect known inefficiency.

### Epic estimates

An epic's human estimate is the sum of its child human estimates. Reports must
not add the parent field to that sum or count parent and child engaged time
twice. Epic acceleration is calculated from summed child Plan human estimates
against child engaged time plus explicitly classified parent orchestration
engaged time.

For issue #1068, the retained historical comparison is 3h estimated versus
3h29m10s engaged: +29m10s, +16.2%, or 0.86x estimated acceleration. This fact is
an input to later cohorts, not a reason to rewrite #1068's closed estimate.

## Durable Storage and #1070 Dependency

The adaptive-estimation story starts after #1070 is complete and consumes its
comment-store exports:

```js
getCommentsByNodeIds(ids);
readBackComment(input);
createIssueComment(input);
updateIssueComment(input);
listIssueCommentsSince(input);
```

It also consumes #1069's canonical record envelope. It must not introduce a
parallel `gh issue comment` transport.

The issue-directory story following #1070 is not a prerequisite for this first
rubric version. Per-issue forecast/outcome records can be discovered through
`listIssueCommentsSince` and validated by envelope type and issue correlation.
The designated rubric issue holds the current superseding snapshot. Later
directory work may add a singleton pointer without changing record semantics.

## Delivery Order

1. Integrate this specification and the three plans into trunk.
2. Create and complete the stage-aware verification story.
3. Create and complete the feature-oriented fixture story, measuring it against
   the runner state produced by story 1.
4. Rebase the paused #1070 worktree onto the resulting trunk and complete #1070.
5. Create and complete the adaptive-estimation story using #1070's comment
   store.
6. Resume the remaining children of epic #1067.

The existing commits for issue #1070 remain preserved. The planning branch and
first two performance stories contain no #1070 implementation work.

## Backlog Handoff

Create exactly three solo stories from the pinned spec/plan commit. Do not add a
new parent epic unless the operator separately authorizes one.

| Order | Story title                                                 | Dependency           | Blocks                          |
| ----: | ----------------------------------------------------------- | -------------------- | ------------------------------- |
|     1 | Stage-Aware Verification and Exact-SHA Evidence Reuse       | Completed #1069 base | Fixture story and resumed #1070 |
|     2 | Consolidate Tests into Feature-Oriented Shared Fixtures     | Story 1              | Resumed #1070                   |
|     3 | Learn Versioned Estimation Rubrics and Publish AI Forecasts | Completed #1070      | Remaining #1067 delivery        |

Each issue body must include `## Plan Metadata` that pins this specification,
its corresponding implementation plan, and the exact commit SHA containing
both. Copy the Backlog Story Contract from the plan into the issue rather than
summarizing it. Initial Refine values are provisional; each issue must run the
normal detailed Plan estimate flow before Develop.

Issue creation and implementation are intentionally outside this planning
branch. The backlog session must use AITM's sanctioned issue-creation workflow
and must not call `gh issue create` directly.

## Success Measures

The rollout is successful when:

- an unchanged final SHA runs full lint/format once and full regression once;
- Review performs no standard-command rerun for valid Test evidence;
- Develop selection explains every chosen test and detects fixture consumers;
- the first fixture migration meets the 25% cluster target without lane
  regression;
- Plan replaces the Refine board/canonical estimate and preserves its history;
- each issue has a separate frozen AI P50/P80 forecast and completion outcome;
- the next Plan can name the exact rubric version and completed cohort it used;
  and
- the operator can inspect all evidence after delivery without adding approval
  prompts to Full-Auto mode.

## Rollback and Safety

Each story is independently reversible.

- Verification reuse can be disabled so Test reruns the affected commands; it
  must never convert an invalid receipt into a pass.
- Fixture consolidations can be reverted cluster by cluster without changing
  production code.
- Rubric generation can stop publishing new versions while retaining prior
  immutable forecast and outcome records.

Performance optimizations never bypass a red command, an unknown environment,
an exact-SHA mismatch, or an existing human approval requirement.
