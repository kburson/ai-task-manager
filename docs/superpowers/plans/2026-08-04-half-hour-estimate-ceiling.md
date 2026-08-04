# Half-Hour Estimate Ceiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every new AITM-published story estimate whole or half-integral by
ceiling raw hours to the next 30-minute boundary while preserving raw rubric
precision and downstream arithmetic consistency.

**Architecture:** A pure granularity module owns the ceiling rule and validation
predicate. Forecast construction normalizes published components and derives
totals from them; record/authority validation fails closed; explicit Refine,
compatibility Plan, tether, and inflation writers normalize once before their
multi-surface writes.

**Tech Stack:** Node.js ESM, `node:test`, immutable AITM estimation records,
GitHub Projects v2 fields, versioned issue-body mutations.

## Global Constraints

- Use the semantic formula `ceil(rawHours * 2) / 2` with machine-scale boundary
  tolerance only.
- Preserve raw rubric coefficients, cohort/confidence calculations, comparable
  weights, and analytical ratios.
- Do not quantize measured actuals, timing data, outcome durations, or cost
  classification.
- Do not rewrite historical off-grid records or issue projections.
- Published WBS rows must sum to published human Plan hours.
- Published AI stages must sum to P50, and P80 must be at least P50.
- Exact whole and half-hour inputs remain unchanged.
- Reference base commit: `dec62d1cc024b73c66852fd981b2e1456b63956c`.

---

### Task 1: Canonical Granularity and Normalized Forecast Construction

**Files:**

- Create: `scripts/task-tracker/lib/estimation/estimate-granularity.mjs`
- Modify: `scripts/task-tracker/lib/estimation/forecast-model.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/estimation/forecast-model.test.mjs`

**Interfaces:**

- Consumes: finite non-negative raw hour numbers and existing raw forecast
  calculations.
- Produces: `ceilEstimateHours(rawHours): number`,
  `isHalfHourEstimate(hours): boolean`, and a forecast whose published estimate
  surfaces are whole/half integral and reconciled.

- [ ] **Step 1: Add the failing primitive boundary table**

```js
import {
  ceilEstimateHours,
  isHalfHourEstimate,
} from '../../../../lib/estimation/estimate-granularity.mjs';

test('story estimates ceil to the next half hour without moving downward', () => {
  for (const [raw, expected] of [
    [3, 3],
    [3.13, 3.5],
    [3.3333, 3.5],
    [3.5, 3.5],
    [3.633, 4],
  ]) {
    const actual = ceilEstimateHours(raw);
    assert.equal(actual, expected);
    assert.ok(actual >= raw);
    assert.equal(isHalfHourEstimate(actual), true);
  }
  assert.equal(ceilEstimateHours(3.5 + Number.EPSILON), 3.5);
  for (const invalid of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, '3'])
    assert.throws(() => ceilEstimateHours(invalid), /estimate-hours:/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:
`node --test scripts/task-tracker/tests/unit/lib/estimation/forecast-model.test.mjs`

Expected: failure because `estimate-granularity.mjs` does not exist.

- [ ] **Step 3: Implement the pure granularity module**

```js
function fail() {
  throw new TypeError('estimate-hours:finite-non-negative-number-required');
}

function stableScaled(hours) {
  const scaled = hours * 2;
  const nearest = Math.round(scaled);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
  return Math.abs(scaled - nearest) <= tolerance ? nearest : scaled;
}

export function ceilEstimateHours(rawHours) {
  if (typeof rawHours !== 'number' || !Number.isFinite(rawHours) || rawHours < 0) fail();
  const result = Math.ceil(stableScaled(rawHours)) / 2;
  return Object.is(result, -0) ? 0 : result;
}

export function isHalfHourEstimate(hours) {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) return false;
  const scaled = hours * 2;
  return stableScaled(hours) === Math.round(scaled);
}
```

- [ ] **Step 4: Add failing forecast publication assertions**

Extend the existing fixture tests to assert:

```js
const published = [
  forecast.refine.humanHours,
  forecast.plan.humanHours,
  forecast.ai.p50EngagedHours,
  forecast.ai.p80EngagedHours,
  ...forecast.wbs.map((item) => item.humanHours),
  ...Object.values(forecast.ai.stages),
];
assert.ok(published.every(isHalfHourEstimate));
assert.equal(
  forecast.wbs.reduce((sum, item) => sum + item.humanHours, 0),
  forecast.plan.humanHours
);
assert.equal(
  Object.values(forecast.ai.stages).reduce((sum, hours) => sum + hours, 0),
  forecast.ai.p50EngagedHours
);
assert.ok(forecast.ai.p80EngagedHours >= forecast.ai.p50EngagedHours);
```

Pin the current bootstrap fixture's normalized values: WBS `10`, `33`, and `1`;
Plan total `44`; AI stages `2`, `22.5`, `4`, and `3.5`; P50 `32`; and P80 `47`.

- [ ] **Step 5: Refactor raw calculation into normalized publication**

Keep existing rubric expressions in raw locals, then build the published shape:

```js
const wbs = rawWbs.map((item) => ({
  ...item,
  humanHours: ceilEstimateHours(item.humanHours),
}));
const humanHours = wbs.reduce((sum, item) => sum + item.humanHours, 0);

const rawStages = {
  plan: rawStagePlan,
  develop: rawStageDevelop,
  test: rawStageTest,
  review: rawStageReview,
};
const stages = Object.fromEntries(
  Object.entries(rawStages).map(([stage, hours]) => [stage, ceilEstimateHours(hours)])
);
const p50 = Object.values(stages).reduce((sum, hours) => sum + hours, 0);
const rawP50 = Object.values(rawStages).reduce((sum, hours) => sum + hours, 0);
const p80 = ceilEstimateHours(Math.max(p50, rawP50 * widening));
const refineHours = ceilEstimateHours(refine.humanHours);
```

Use `humanHours` for Size selection and compute
`deltaHours = humanHours - refineHours`. Keep `round` for similarity weights and
variance ratios only.

- [ ] **Step 6: Run the focused test and commit the forecast slice**

Run:
`node --test scripts/task-tracker/tests/unit/lib/estimation/forecast-model.test.mjs`

Expected: all forecast-model tests pass with every published estimate on-grid.

```bash
git add scripts/task-tracker/lib/estimation/estimate-granularity.mjs \
  scripts/task-tracker/lib/estimation/forecast-model.mjs \
  scripts/task-tracker/tests/unit/lib/estimation/forecast-model.test.mjs
git commit -m "fix(estimation): ceil published forecasts [#1098]"
```

### Task 2: Fail-Closed Forecast Records and Plan Authority

**Files:**

- Modify: `scripts/task-tracker/lib/estimation/forecast-record.mjs`
- Modify: `scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/estimation/records.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/estimation/plan-estimate-authority.test.mjs`

**Interfaces:**

- Consumes: an `aitm.estimation-forecast/v1` payload or forecast envelope.
- Produces: schema validation that rejects off-grid estimate surfaces and Plan
  authority that performs no writer call for an invalid envelope.

- [ ] **Step 1: Add record rejection cases**

Create individually inconsistent clones whose totals are adjusted so the grid
error is the first violation:

```js
const offGridWbs = structuredClone(forecast);
offGridWbs.wbs[0].humanHours = 8.25;
offGridWbs.wbs[1].humanHours = 31.75;

const offGridStage = structuredClone(forecast);
offGridStage.ai.stages.plan = 2.25;
offGridStage.ai.stages.develop = 14.75;

for (const value of [
  { ...forecast, refine: { ...forecast.refine, humanHours: 40.25 } },
  { ...forecast, plan: { ...forecast.plan, humanHours: 40.25, deltaHours: 0.25 } },
  offGridWbs,
  offGridStage,
  { ...forecast, ai: { ...forecast.ai, p80EngagedHours: 31.25 } },
])
  assert.throws(() => validateEstimationForecast(value), /forecast-.*grid/);
```

- [ ] **Step 2: Run records tests and confirm RED**

Run:
`node --test scripts/task-tracker/tests/unit/lib/estimation/records.test.mjs`

Expected: at least one off-grid payload is accepted by the current validator.

- [ ] **Step 3: Enforce the shared predicate in forecast validation**

Import `isHalfHourEstimate`. Add `estimateHours(value, category)` that first
calls the existing finite/non-negative `hours` validation, then fails
`${category}-grid` when the predicate is false. Use it for Refine and Plan human
hours, P50/P80, every stage, and every WBS item. Retain ordinary `hours` for
test-plan minutes and keep delta as a signed derived value.

- [ ] **Step 4: Add the zero-write authority test**

```js
test('Plan authority rejects an off-grid forecast before its first write', async () => {
  const harness = authorityHarness();
  const envelope = forecastEnvelope({
    plan: { size: 'M', humanHours: 8.25, deltaHours: 0.25, rationale: 'invalid' },
  });
  await assert.rejects(
    applyPlanEstimateAuthority({
      issueNumber: 1098,
      refine: { size: 'M', humanHours: 8 },
      forecastEnvelope: envelope,
      deps: harness.deps,
    }),
    /estimation-record:forecast-hours-grid/
  );
  assert.deepEqual(harness.writes, []);
});
```

- [ ] **Step 5: Validate before authority read/write operations**

Import `validateEstimationForecast` and call:

```js
validateEstimationForecast(forecastEnvelope.payload, { expectedIssue: issueNumber });
```

immediately after structural input validation in both normal Plan convergence
and legacy forecast adoption, before `read(deps)` or any writer.

- [ ] **Step 6: Run record/authority tests and commit**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/estimation/records.test.mjs \
  scripts/task-tracker/tests/unit/lib/estimation/plan-estimate-authority.test.mjs
```

Expected: both files pass, including zero-write rejection and existing
idempotent convergence.

```bash
git add scripts/task-tracker/lib/estimation/forecast-record.mjs \
  scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs \
  scripts/task-tracker/tests/unit/lib/estimation/records.test.mjs \
  scripts/task-tracker/tests/unit/lib/estimation/plan-estimate-authority.test.mjs
git commit -m "fix(estimation): reject off-grid forecast records [#1098]"
```

### Task 3: Normalize Refine, Compatibility Plan, Tether, and Inflation Writers

**Files:**

- Modify: `scripts/gh/lib/project-tether.mjs`
- Modify: `scripts/task-tracker/verbs/refine.mjs`
- Modify: `scripts/task-tracker/lib/apply-refinement-estimate.mjs`
- Modify: `scripts/task-tracker/verbs/plan-estimate.mjs`
- Modify: `scripts/task-tracker/lib/refine-estimate-comment.mjs`
- Modify: `scripts/task-tracker/verbs/inflate-estimate.mjs`
- Modify: `scripts/task-tracker/tests/unit/gh/lib/project-tether.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/refine-verb.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/refine-estimate-comment.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/plan-estimate.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/inflate-estimate.test.mjs`

**Interfaces:**

- Consumes: positive CLI estimate strings, numeric board projections, and
  direct library estimate objects.
- Produces: comments, board writes, and body fields that all use the same
  normalized whole/half-integral number.

- [ ] **Step 1: Add failing Refine and tether convergence tests**

In `refine-verb.test.mjs`, run Refine with `--estimate 3.13` and assert the
injected tether receives `estimate: 3.5`, the rationale marker contains
`"estimate":"3.5"`, and the `aitm-fields` override uses `3.5`. Add an exact
`3.5` case proving idempotence.

In `project-tether.test.mjs`, invoke `tetherIssueToProject` with
`estimate: 3.633` and assert the Estimate GraphQL mutation receives
`val: 4` while rank and other number fields remain unchanged.

- [ ] **Step 2: Normalize the Refine/tether authorities**

Import `ceilEstimateHours`. In `runRefine`, after existing validation:

```js
const estimateNum = ceilEstimateHours(parseFloat(String(estimate).replace(/h$/i, '')));
```

Use that one value for tether, rationale, body cache, and return data. In
`project-tether.writeFields`, compute `const normalizedEstimate =
ceilEstimateHours(Number(estimate))` only when Estimate is supplied, then write
that value. Do not alter rank or other number fields.

In `buildRefinementCommentBody`, normalize a numeric estimate before rendering
as defense for direct library callers.

- [ ] **Step 3: Add failing planned-appendix compatibility tests**

Call compatibility `runPlanEstimate` with planned `3.633` and current `3.13`;
assert the appended objects and rendered table use Plan `4`, Refine `3.5`, and
delta `+0.5`. Add direct `buildPlannedAppendix` coverage with the same values so
the library seam cannot bypass the policy.

- [ ] **Step 4: Normalize compatibility inputs and the appendix renderer**

Add a helper that preserves absent values and normalizes numeric estimates:

```js
function normalizeEstimateProjection(value = {}) {
  return {
    ...value,
    ...(typeof value.estimate === 'number' ? { estimate: ceilEstimateHours(value.estimate) } : {}),
  };
}
```

Apply it to planned, explicit current, and board-derived current projections in
`runPlanEstimate`. Apply the same rule inside `buildPlannedAppendix` before
rendering and delta calculation. Size-only compatibility calls remain valid.

- [ ] **Step 5: Add failing inflation multi-surface tests**

Run `runInflateEstimate` with estimate `3.633`. Assert:

```js
assert.match(patchedComment, /\| Estimate \| 3h \| 4h \| \+1h \|/);
assert.deepEqual(estimateWrite.value, { number: 4 });
assert.equal(parseIssueFieldDb(mutatedBody).values.estimate, 4);
```

Also run with `3.5` and assert comment, board, and body remain `3.5`.

- [ ] **Step 6: Normalize inflation once before all writes**

Change `parseEstimateHours` to return
`ceilEstimateHours(parseFloat(...))`. The existing `newEstimate` local then
feeds the comment, project field, and body mutation without additional policy
calls.

- [ ] **Step 7: Run all alternate-writer tests and commit**

Run:

```bash
node --test scripts/task-tracker/tests/unit/gh/lib/project-tether.test.mjs
node --test scripts/task-tracker/tests/unit/verbs/refine-verb.test.mjs \
  scripts/task-tracker/tests/unit/lib/refine-estimate-comment.test.mjs \
  scripts/task-tracker/tests/unit/verbs/plan-estimate.test.mjs \
  scripts/task-tracker/tests/unit/verbs/inflate-estimate.test.mjs
```

Expected: all files pass; board/body/comment projections agree and exact values
remain stable.

```bash
git add scripts/gh/lib/project-tether.mjs \
  scripts/task-tracker/verbs/refine.mjs \
  scripts/task-tracker/lib/apply-refinement-estimate.mjs \
  scripts/task-tracker/verbs/plan-estimate.mjs \
  scripts/task-tracker/lib/refine-estimate-comment.mjs \
  scripts/task-tracker/verbs/inflate-estimate.mjs \
  scripts/task-tracker/tests/unit/gh/lib/project-tether.test.mjs \
  scripts/task-tracker/tests/unit/verbs/refine-verb.test.mjs \
  scripts/task-tracker/tests/unit/lib/refine-estimate-comment.test.mjs \
  scripts/task-tracker/tests/unit/verbs/plan-estimate.test.mjs \
  scripts/task-tracker/tests/unit/verbs/inflate-estimate.test.mjs
git commit -m "fix(estimation): normalize story estimate writers [#1098]"
```

### Task 4: End-to-End Convergence and Governed Verification

**Files:**

- Modify: `scripts/task-tracker/tests/integration/lib/estimation/adaptive-estimation.integration.test.mjs`
- Verify: all production and test files from Tasks 1-3
- Verify: `docs/superpowers/specs/2026-08-04-half-hour-estimate-ceiling-design.md`
- Verify: `docs/superpowers/plans/2026-08-04-half-hour-estimate-ceiling.md`

**Interfaces:**

- Consumes: a complete committed #1098 branch based on `dec62d1c`.
- Produces: end-to-end evidence that forecast record, rendered comment, board,
  body, and planned appendix converge before governed Test and Review.

- [ ] **Step 1: Update the adaptive integration expectation and add grid assertions**

The current bootstrap path publishes `10.9`; under the new contract its independently
ceiled WBS rows reconcile to `11.5`. Assert:

```js
assert.equal(board.estimate, 11.5);
assert.match(refineBody, /\| Estimate \(h\) \| 8 \| 11\.5 \|/);
assert.match(issueBody, /"estimate":11\.5/);
assert.ok(recordComments.some((comment) => /Human Plan estimate: 11\.5h/.test(comment.body)));
assert.ok(
  parsedRecords
    .filter((record) => record.envelope.recordType === 'estimation-forecast')
    .every((record) => isHalfHourEstimate(record.envelope.payload.plan.humanHours))
);
```

- [ ] **Step 2: Run the issue-specific focused verifiers**

```bash
node --test scripts/task-tracker/tests/unit/lib/estimation/forecast-model.test.mjs
node --test scripts/task-tracker/tests/unit/lib/estimation/records.test.mjs \
  scripts/task-tracker/tests/unit/lib/estimation/plan-estimate-authority.test.mjs
node --test scripts/task-tracker/tests/unit/verbs/refine-verb.test.mjs \
  scripts/task-tracker/tests/unit/verbs/plan-estimate.test.mjs \
  scripts/task-tracker/tests/unit/verbs/inflate-estimate.test.mjs
node --test scripts/task-tracker/tests/integration/lib/estimation/adaptive-estimation.integration.test.mjs
```

Expected: every command exits 0 and all named tests pass.

- [ ] **Step 3: Run static verification**

```bash
npm run lint
npm run format:check
git diff dec62d1cc024b73c66852fd981b2e1456b63956c...HEAD --check
```

Expected: all commands exit 0 with no lint, formatting, or whitespace errors.

- [ ] **Step 4: Run complete automated verification**

```bash
npm test
npm run test:slow
```

Expected: every fast and slow lane file passes with zero failures.

- [ ] **Step 5: Verify environment and commit trail**

```bash
node scripts/dev-env/verify-local-worktree.mjs
git log --oneline dec62d1cc024b73c66852fd981b2e1456b63956c..HEAD
git status --short
```

Expected: the worktree verifier exits 0, every implementation commit carries
`[#1098]`, and the tree is clean.

- [ ] **Step 6: Commit the integration slice**

```bash
git add scripts/task-tracker/tests/integration/lib/estimation/adaptive-estimation.integration.test.mjs \
  docs/superpowers/specs/2026-08-04-half-hour-estimate-ceiling-design.md \
  docs/superpowers/plans/2026-08-04-half-hour-estimate-ceiling.md
git commit -m "test(estimation): prove half-hour convergence [#1098]"
```

- [ ] **Step 7: Complete the governed workflow**

Run the issue's AC verifiers and stamp each criterion individually. Run
`npx aitm test 1098`, inspect the isolated receipt, conduct exact-SHA review,
resolve findings test-first, then use Full-Auto approval, conflict-free
fast-forward integration, post-merge fast verification, push `trunk`, and
`npx aitm close 1098`.
