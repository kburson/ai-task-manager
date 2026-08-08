# Adaptive Estimation Rubrics and AI Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace rough Refine estimates with detailed Plan human estimates,
publish a separate AI P50/P80 forecast, record actual execution outcomes, and
use every completed outcome to improve subsequent estimates and WBS sizing.

**Architecture:** Versioned forecast, outcome, and rubric-snapshot records use
issue #1069's canonical record envelope and issue #1070's GitHub comment store. Plan inputs
describe WBS and repository signals; the current rubric produces human and AI
forecasts plus confidence. `plan-estimate` writes the Plan human estimate to the
board and canonical body projection, preserves the Refine history, and appends
the forecast record. Close appends the outcome. The next Plan folds all outcomes
newer than the current snapshot into a superseding rubric before forecasting.

**Tech Stack:** Node.js ESM, `node:test`, GitHub Project V2 fields, #1069 record
envelopes, #1070 comment store, existing timing/event projections and value
report.

**Governing spec:**
`docs/superpowers/specs/2026-08-01-execution-performance-and-adaptive-estimation-design.md`

**Hard dependency:** Do not begin implementation until #1070 is integrated.
Consume, without duplicating, these exports from
`scripts/task-tracker/lib/github-records/github-comment-store.mjs`:

```js
getCommentsByNodeIds;
readBackComment;
createIssueComment;
updateIssueComment;
listIssueCommentsSince;
```

**Initial planning baseline:** Human 9h; AI P50 6h; AI P80 9h. This story must
use its own Plan-stage implementation to replace those provisional values when
possible; otherwise it records that bootstrap limitation explicitly.

## Backlog Story Contract

**Title:** Learn Versioned Estimation Rubrics and Publish AI Forecasts

**Shape:** Solo story

**Dependencies:** Completed #1070 comment store and completed #1069 record
envelope. This story blocks continued delivery of the remaining #1067 children.

**Acceptance Criteria:**

- Forecast, outcome, and rubric records use #1069 envelopes and #1070 comment
  transport with canonical validation and write read-back.
- Plan preserves the Refine history but replaces board Size/Estimate and
  canonical `aitm-fields` with the converged detailed Plan human estimate.
- Plan posts a separate AI P50/P80 and stage forecast with WBS, comparable issue
  records, rubric cohort/version/confidence, risks, and proceed/split/refine
  recommendation.
- Human and AI baselines freeze at Develop entry; later change requires the
  existing audited demote/replan path.
- Close appends one idempotent completion outcome with stage timings,
  verification/retry/review data, landscape signals, variance, and necessary
  versus avoidable cost classification.
- The next Plan incorporates every new eligible outcome into one idempotent,
  superseding rubric snapshot; avoidable AI waste never inflates human
  coefficients.
- Reports show Plan human estimate, AI P50/P80, actual, variance, accuracy,
  confidence, and child-only epic rollups without double-counting.
- Full-Auto and human Plan/Review approvals remain unchanged.

**Verification Commands:**

```bash
node --test scripts/task-tracker/tests/integration/adaptive-estimation.integration.test.mjs
npm run format:check
npm run lint
npm run test:unit
npm run test:integration
npm run test:slow
```

**Definition of Done:** Exact final SHA reviewed; forecast/freeze/outcome/rubric
comment IDs, board/body convergence proof, coefficient separation, gate parity,
and report excerpts are attached to the issue.

## Invariants

- Board `Estimate` is human-equivalent mid-level engineer hours.
- The Plan human estimate replaces the Refine estimate before Develop.
- Refine values remain visible as immutable audit history.
- AI P50/P80 is stored only in structured comments/reports, never in the board
  Estimate field.
- Human and AI forecasts freeze at Develop entry.
- Full-Auto and human Plan/Review approvals remain exactly as configured; the
  evidence packet creates no new prompt.
- Per-issue forecast and outcome records are authoritative. Local files/DBs are
  rebuildable caches only.
- Human coefficients exclude avoidable agent process waste.
- Rubric snapshots name the exact outcome record cohort and confidence.
- Epic human estimate is the sum of children; parent and child effort are never
  double-counted.

## Record Schemas

All records use `aitm.record/v1` from #1069. Add record-type validators for:

```js
// recordType: estimation-forecast
{
  schema: 'aitm.estimation-forecast/v1',
  issue: 123,
  lifecycleState: 'plan',
  refine: { size: 'S', humanHours: 3 },
  plan: { size: 'M', humanHours: 6, deltaHours: 3, rationale: '...' },
  ai: {
    p50EngagedHours: 3.8,
    p80EngagedHours: 5.6,
    stages: { plan: 0.4, develop: 2.1, test: 0.8, review: 0.5 }
  },
  wbs: [{ id: 'w1', description: '...', humanHours: 1.5, signals: [] }],
  comparableIssues: [{ issue: 1068, outcomeRecordId: '01J...', weight: 0.4 }],
  rubric: { recordId: '01J...', version: 3, cohortSize: 12, confidence: 0.64 },
  testPlan: { impactedLanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 8 },
  risks: ['...'],
  recommendation: { action: 'proceed', reason: '...' },
  supersedesForecastRecordId: null
}

// recordType: estimation-outcome
{
  schema: 'aitm.estimation-outcome/v1',
  issue: 123,
  forecastRecordId: '01J...',
  humanPlanHours: 6,
  aiForecast: { p50EngagedHours: 3.8, p80EngagedHours: 5.6 },
  actual: {
    engagedHours: 4.2,
    stages: { plan: 0.5, develop: 2.2, test: 1.0, review: 0.5 },
    reviewFixCycles: 1,
    commands: [{ classification: 'test-unit', durationMs: 1000, attempts: 1 }]
  },
  landscape: { filesChanged: 8, modules: [], lanes: [], dependencyBreadth: 2 },
  variance: { vsAiP50Hours: 0.4, vsAiP80Hours: -1.4 },
  costClassification: {
    necessaryHours: 3.9,
    avoidableProcessWasteHours: 0.3,
    drivers: [{ kind: 'redundant-verification', hours: 0.3 }]
  }
}

// recordType: estimation-rubric
{
  schema: 'aitm.estimation-rubric/v1',
  version: 3,
  predecessorRecordId: '01J...',
  generatedAt: '2026-08-01T00:00:00.000Z',
  cohort: [{ issue: 123, outcomeRecordId: '01J...' }],
  human: { coefficients: {}, sampleSize: 12, confidence: 0.64 },
  ai: { coefficients: {}, sampleSize: 12, confidence: 0.64 },
  testLandscape: { laneMinutes: {}, sandboxMinutes: 0 },
  review: { reworkProbability: 0.2 },
  accuracy: { refineToPlan: {}, aiP50: {}, aiP80Coverage: 0.75 }
}
```

Durations use numeric hours in records and integer milliseconds for individual
commands. Rendered comments format them for people without changing the
canonical payload hash.

## Shared Interfaces

```js
parsePlanEstimationInput(json);
buildEstimationForecast({ issue, refine, planInput, rubric, landscape });
renderEstimationForecast(record);
loadLatestForecast({ repo, issueNumber, state, commentStore });
applyPlanEstimateAuthority({ cfg, issueNumber, refine, forecast, deps });
buildEstimationOutcome({ issue, forecast, timing, verification, diff, review });
renderEstimationOutcome(record);
updateEstimationRubric({ previous, outcomes });
loadOrRefreshRubric({ cfg, rubricIssueNumber, through, deps });
buildEstimationReportRows({ issues, forecasts, outcomes, rubric });
```

`applyPlanEstimateAuthority` is successful only after board Size/Estimate,
canonical `aitm-fields`, Refine-history appendix, and forecast comment are read
back and converge.

---

## Task 1: Add Estimation Record Types on #1069/#1070 Foundations

**Files:**

- Create: `scripts/task-tracker/lib/estimation/forecast-record.mjs`
- Create: `scripts/task-tracker/lib/estimation/outcome-record.mjs`
- Create: `scripts/task-tracker/lib/estimation/rubric-record.mjs`
- Create: `scripts/task-tracker/lib/estimation/renderers.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/estimation/records.test.mjs`
- Modify: `scripts/task-tracker/lib/github-records/record-envelope.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/github-records/record-envelope.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

- [ ] Write RED round-trip tests for all three payload schemas, exact keys,
      finite/non-negative durations, Size values, WBS IDs, stage totals,
      supersession, cohort identity, and record-envelope issue correlation.
- [ ] Reject secret-bearing values, arbitrary Markdown authority, unknown schema
      versions, a P80 below P50, outcome records without a frozen forecast, and
      rubric cohorts with duplicate outcome IDs.
- [ ] Implement visible Markdown renderers containing the Plan evidence packet,
      actual variance, and rubric accuracy while leaving hidden payload
      canonical.
- [ ] Prove Markdown changes do not alter the canonical payload hash.
- [ ] Use #1070 `createIssueComment` and `readBackComment` for immutable records;
      do not add direct `gh issue comment` or REST code.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/estimation/records.test.mjs
node --test scripts/task-tracker/tests/unit/lib/github-records/record-envelope.test.mjs
```

## Task 2: Implement the Bootstrap and Versioned Rubric Model

**Files:**

- Create: `scripts/task-tracker/lib/estimation/rubric-model.mjs`
- Create: `scripts/task-tracker/lib/estimation/rubric-refresh.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/estimation/rubric-model.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/estimation/rubric-refresh.test.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/config.test.mjs`

- [ ] Add config key `estimationRubricIssue` as a positive integer or zero when
      unconfigured. It identifies the governed issue that stores rubric
      snapshots; it is not a local database path.
- [ ] Define rubric v1 bootstrap priors explicitly in code for WBS implementation
      hours, module/dependency breadth, test lanes, sandbox setup, review/rework,
      and uncertainty. Mark bootstrap confidence low.
- [ ] Write RED tests that one outcome updates AI coefficients and accuracy but
      sends `avoidableProcessWasteHours` only to workflow diagnostics, never to
      human coefficients.
- [ ] Write RED tests for weighted, recency-bounded robust updates that cap one
      outlier's influence and report sample size/confidence instead of claiming
      false precision.
- [ ] Implement `loadOrRefreshRubric`: load the latest valid rubric comment from
      the configured rubric issue, enumerate eligible Done issue outcomes newer
      than its cohort, create one superseding snapshot, and read it back.
- [ ] Make refresh idempotent: the same exact outcome cohort produces no new
      comment. Conflicting latest snapshots fail closed.
- [ ] Include #1068's 3h versus 3h29m10s measurement only when a validated
      outcome record or explicit bootstrap observation represents it; never
      rewrite #1068.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/estimation/rubric-model.test.mjs
node --test scripts/task-tracker/tests/unit/lib/estimation/rubric-refresh.test.mjs
node --test scripts/task-tracker/tests/unit/lib/config.test.mjs
```

## Task 3: Produce the Detailed Plan Forecast and WBS Recommendation

**Files:**

- Create: `scripts/task-tracker/lib/estimation/plan-input.mjs`
- Create: `scripts/task-tracker/lib/estimation/forecast-model.mjs`
- Create: `scripts/task-tracker/tests/fixtures/estimation/plan-input.json`
- Create: `scripts/task-tracker/tests/unit/lib/estimation/forecast-model.test.mjs`

- [ ] Define `aitm.plan-estimation-input/v1` with WBS descriptions/base human
      hours, module/dependency signals, test-impact lanes, isolation, risks, and
      optional comparable issue IDs. Reject placeholders and missing WBS IDs.
- [ ] Compute Plan human hours from necessary mid-level-engineer work and
      unavoidable repository execution cost. Do not derive human hours by
      multiplying AI time.
- [ ] Compute AI engaged-time P50/P80 and stage allocation using AI coefficients,
      observed test/sandbox costs, review probability, and confidence widening.
- [ ] Rank comparable outcomes by module, dependency, lane, and diff similarity;
      retain weights and exact record IDs in the forecast.
- [ ] Compute Refine-to-Plan delta and recommendation:
      `proceed`, `split`, or `refine-further`. Recommend splitting when WBS is
      not independently reviewable, dependency breadth crosses the rubric
      threshold, or P80/variance exceeds the configured Size envelope.
- [ ] Render the complete evidence packet for chat/comment inspection without
      adding an approval decision.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/estimation/forecast-model.test.mjs
```

## Task 4: Replace Refine Authority with Convergent Plan Writes

**Files:**

- Create: `scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/estimation/plan-estimate-authority.test.mjs`
- Modify: `scripts/task-tracker/verbs/plan-estimate.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/plan-estimate.test.mjs`
- Modify: `scripts/task-tracker/lib/refine-estimate-comment.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/refine-estimate-comment.test.mjs`
- Modify: `scripts/task-tracker/lib/plan-exit-planned-estimate-guard.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/guard-registry-plan-exit.test.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`

- [ ] Extend `plan-estimate` with required `--evidence-file <path>` for v1
      issues. Preserve legacy flags only for explicit compatibility mode.
- [ ] At invocation, refresh/load the rubric, build the forecast, and show its
      evidence summary. Do not prompt for an approval beyond existing Plan mode.
- [ ] Write RED failure-injection tests before and after: Refine appendix patch,
      board Estimate, board Size, `aitm-fields`, forecast comment, and each
      read-back.
- [ ] Implement convergent replay. A retry discovers already-correct writes and
      finishes missing ones without duplicating the forecast record.
- [ ] Change `runPlanEstimate` so successful v1 execution updates GitHub board
      Size/Estimate and `aitm-fields`; comment-only success is no longer enough.
- [ ] Preserve the original Refine values in the comparison appendix even after
      board/canonical values are replaced.
- [ ] Strengthen the Plan-exit gate to validate a latest, non-superseded forecast
      record whose Plan Size/Estimate equals both board and `aitm-fields`.
- [ ] Freeze the latest forecast at Plan→Develop by recording its record ID in
      the existing Plan approval/entry evidence. Reject forecast supersession in
      Develop or later without the audited demote/replan path.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/estimation/plan-estimate-authority.test.mjs
node --test scripts/task-tracker/tests/unit/verbs/plan-estimate.test.mjs
node --test scripts/task-tracker/tests/unit/lib/refine-estimate-comment.test.mjs
node --test scripts/task-tracker/tests/unit/lib/guard-registry-plan-exit.test.mjs
```

## Task 5: Append a Completion Outcome for Every Eligible Story

**Files:**

- Create: `scripts/task-tracker/lib/estimation/outcome-builder.mjs`
- Create: `scripts/task-tracker/lib/estimation/outcome-writer.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/estimation/outcome-builder.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/estimation/outcome-writer.test.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/close-convergence-wiring.test.mjs`
- Modify: `scripts/task-tracker/lib/timing-row-reader.mjs`

- [ ] Build actual stage timing from existing timing events/rows after close-time
      timing synchronization. Never infer stage totals from comment timestamps.
- [ ] Collect verification receipt command durations/retries, review-fix cycles,
      diff breadth, modules, dependencies, and lanes from exact-SHA evidence.
- [ ] Classify cost drivers into necessary work and avoidable process waste.
      Unknown time remains explicitly `unclassified`; it is not assigned to
      human coefficients.
- [ ] Add RED tests for no forecast, malformed timing, epic, zero-time, repeated
      close, superseded forecast, and a partially written outcome.
- [ ] Append and read back one immutable outcome before an eligible story reaches
      Done. Retry returns the existing record rather than duplicating it.
- [ ] For epics, emit an orchestration outcome that references children and does
      not create a second implementation estimate. Keep child forecast/outcome
      records as the implementation cohort.
- [ ] A failed required outcome write blocks completion with a recoverable
      message. It does not update the project rubric during close; the next Plan
      performs that refresh.

**Verify:**

```bash
node --test scripts/task-tracker/tests/unit/lib/estimation/outcome-builder.test.mjs
node --test scripts/task-tracker/tests/unit/lib/estimation/outcome-writer.test.mjs
node --test scripts/task-tracker/tests/slow/verbs/coverage-close.test.mjs
```

## Task 6: Add Forecast, Accuracy, and Epic Rollups to Reports

**Files:**

- Create: `scripts/reports/lib/estimation-records.mjs`
- Create: `scripts/reports/lib/estimation-records.test.mjs`
- Modify: `scripts/reports/generate-value-report.mjs`
- Modify: `scripts/reports/lib/board-fields.mjs`
- Modify: `scripts/reports/generate-value-report.test.mjs`

- [ ] Load validated latest forecasts/outcomes through #1070 for report issues;
      show missing or malformed records as evidence gaps, not zeroes.
- [ ] Add human Plan Estimate, AI P50, AI P80, actual engaged, variance, Refine
      accuracy, AI forecast accuracy, and avoidable process waste to issue-level
      report data.
- [ ] Preserve acceleration as Plan human hours divided by actual agent engaged
      hours. Label values below 1x plainly; #1068 remains 0.86x.
- [ ] Implement epic rollup from summed child Plan human estimates divided by
      child engaged plus explicitly classified parent orchestration engaged.
- [ ] Prove parent Estimate and child estimates are never summed together and
      parent engaged time is never counted as child implementation time.
- [ ] Add current rubric version, cohort size, confidence, and P80 coverage to
      report methodology.

**Verify:**

```bash
node --test scripts/reports/lib/estimation-records.test.mjs
node --test scripts/reports/generate-value-report.test.mjs
node scripts/reports/generate-value-report.mjs --help
```

## Task 7: End-to-End Learning and Approval-Semantics Proof

**Files:**

- Create: `scripts/task-tracker/tests/integration/adaptive-estimation.integration.test.mjs`
- Modify: `docs/guides/workflow.md`
- Modify: `docs/guides/ai-value-framework.md`
- Modify: `scripts/task-tracker/tests/unit/meta/test-tree-layout.baseline.json`

- [ ] Exercise Refine rough estimate → Plan rubric refresh → Plan board/body
      replacement → forecast freeze → Develop/Test/Review → outcome → next Plan
      rubric update with fake #1070 transport and read-backs.
- [ ] Prove the second Plan names the first outcome in its rubric cohort and
      changes forecasts deterministically when the outcome supplies evidence.
- [ ] Prove avoidable rerun waste changes workflow diagnostics and AI prediction
      but does not inflate the human estimate.
- [ ] Prove Plan and Review Full-Auto configurations add no prompt, while
      existing human-gated configurations still stop at the same approval
      points.
- [ ] Document forecast meanings, freeze timing, operator evidence inspection,
      bootstrap uncertainty, rubric refresh/recovery, and epic rollup math.

**Final verification:**

```bash
node --test scripts/task-tracker/tests/integration/adaptive-estimation.integration.test.mjs
node --test scripts/task-tracker/tests/unit/lib/estimation/records.test.mjs
node --test scripts/task-tracker/tests/unit/lib/estimation/rubric-model.test.mjs
node --test scripts/task-tracker/tests/unit/lib/estimation/forecast-model.test.mjs
node --test scripts/task-tracker/tests/unit/lib/estimation/plan-estimate-authority.test.mjs
node --test scripts/task-tracker/tests/unit/lib/estimation/outcome-builder.test.mjs
node --test scripts/reports/lib/estimation-records.test.mjs
npm run format:check
npm run lint
npm run test:unit
npm run test:integration
npm run test:slow
```

## Evidence Required Before Delivery

- #1070 dependency commit SHA and exact imported comment-store surface.
- Failure-injection/read-back proof for Plan estimate convergence.
- One forecast, frozen baseline, outcome, and superseding rubric record with
  canonical hashes and GitHub comment node IDs.
- Evidence that Refine history remains while board and `aitm-fields` carry Plan.
- Human-versus-AI coefficient separation and waste-classification examples.
- Full-Auto/human-gate parity test output.
- Value-report excerpt proving child-only epic estimate rollup.
- Independent exact-SHA review under the existing approval policy.
