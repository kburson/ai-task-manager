# Half-Hour Estimate Ceiling Design

## Problem

AITM's adaptive forecast limits values to four decimal places but does not
quantize them to the project's scheduling increment. Values such as `3.13` and
`3.633` can enter the immutable forecast record and then converge unchanged
across the forecast comment, Refine/Plan projection, project-board `Estimate`,
and canonical `aitm-fields` body projection.

The same gap exists in explicit Refine, compatibility Plan, project-tether, and
estimate-inflation paths. Each accepts arbitrary finite decimals. Consequently,
the current system is consistent about copying the wrong value rather than
authoritative about estimate granularity.

## Goals

- Define one floating-point-safe half-hour ceiling rule with the semantic
  formula `ceil(rawHours * 2) / 2`.
- Preserve full precision in raw rubric calculations and normalize only when an
  hour-denominated estimate becomes published or persisted story data.
- Ensure every published forecast component, total, board field, body field,
  and Refine/Plan comment projection is whole or half-integral.
- Keep Size, WBS totals, AI stage totals, P50/P80 ordering, and Plan-versus-
  Refine delta internally consistent after normalization.
- Prevent compatibility and alternate sanctioned writers from bypassing the
  same contract.

## Non-goals

- Change rubric coefficients, cohort selection, confidence, comparable
  weighting, or evidence inputs.
- Change Size envelopes, lifecycle transitions, or approval semantics.
- Quantize measured actuals, timing rows, cost classification, or retrospective
  outcome durations.
- Rewrite historical issue bodies, project fields, comments, or forecast
  records.

## Considered Approaches

### Shared policy at publication boundaries (selected)

Add one pure estimate-granularity module. Forecast construction retains raw
math, then normalizes every value placed in the published forecast shape. The
record validator refuses off-grid values. Explicit Refine, compatibility Plan,
inflation, and project-tether inputs use the same primitive before constructing
their multi-surface writes.

This establishes one rule while keeping raw learning precision and preserving
the current convergence architecture.

### Normalize only the Plan total

Ceil `plan.humanHours` immediately before board and body writes. This is too
narrow: WBS rows, AI stages, P50/P80, immutable records, and rendered comments
would remain off-grid or disagree with the normalized total.

### Normalize only presentation and GitHub adapters

Ceil values inside renderers and field writers. This would make the visible
comment disagree with the persisted record and would leave direct or future
writers free to bypass the policy.

## Canonical Granularity Policy

`scripts/task-tracker/lib/estimation/estimate-granularity.mjs` owns two pure
interfaces:

```js
ceilEstimateHours(rawHours) -> number
isHalfHourEstimate(hours) -> boolean
```

`ceilEstimateHours` accepts only finite, non-negative numbers. It scales by two,
removes only machine-scale noise around an existing integer boundary, applies
`Math.ceil`, divides by two, and converts negative zero to zero. The tolerance
must be proportional to the scaled magnitude and may not absorb a material
positive fraction. Thus exact `X.0` and `X.5` inputs remain unchanged, values
strictly between boundaries always move upward, and no valid input moves down.

`isHalfHourEstimate` provides the validation predicate for already-published
data. It requires the same finite, non-negative domain and treats only
machine-scale boundary noise as integral after scaling.

The module contains no GitHub, rubric, Size, lifecycle, timing, or rendering
knowledge.

## Adaptive Forecast Publication

The forecast builder separates raw calculation from published values.

### Human estimate

1. Compute each raw human WBS value using the existing rubric coefficients.
2. Compute raw repository-execution cost with existing test evidence.
3. Apply `ceilEstimateHours` to every WBS row that will be published.
4. Sum normalized WBS rows to produce `plan.humanHours`.
5. Select Plan Size from that normalized total.
6. Normalize the Refine baseline placed in the record and compute
   `deltaHours = plan.humanHours - refine.humanHours`.

The published total therefore equals the published component sum exactly.

### AI estimate

1. Compute raw Plan, Develop, Test, and Review stage estimates with existing
   coefficients and full precision.
2. Normalize each published stage independently.
3. Sum normalized stages to produce P50.
4. Compute the existing confidence/rework widening from the raw P50, then set
   published P80 to `ceilEstimateHours(max(publishedP50, rawP50 * widening))`.

P50 equals its published stage sum, and P80 is normalized and never below P50.
Similarity weights, confidence values, and variance ratios remain ordinary
four-decimal analytical values because they are not hour estimates.

## Record and Authority Enforcement

New forecasts use `aitm.estimation-forecast/v2`.
`validateEstimationForecast` requires whole/half-integral values for every v2:

- Refine human hours;
- Plan human hours;
- every human WBS row;
- every AI lifecycle stage;
- AI P50; and
- AI P80.

The validator retains its existing exact-shape, WBS-total, stage-total,
Plan-delta, and P80-order checks. `deltaHours` is derived from two normalized
estimates and can be negative, so it is checked for arithmetic consistency
rather than the non-negative estimate domain.

Published `aitm.estimation-forecast/v1` records retain their original
finite/non-negative numeric contract when read or rendered. This preserves
historical evidence whose fractional values predate the half-hour grid. Record
creation and Plan authority require v2, so compatibility reads cannot publish
new off-grid forecasts or project them back into authoritative issue fields.

`applyPlanEstimateAuthority` validates the complete envelope payload before the
first projection write. This protects direct test/injection and compatibility
callers in addition to the model's normal validation. Renderers continue to
display validated authoritative values; they do not become a second rounding
authority.

## Alternate Story-Estimate Writers

New estimates are normalized at the earliest common input that can feed all of
that path's outputs:

- `refine` normalizes once before project tether, rationale marker,
  Refine comment, and canonical body-field refresh.
- `project-tether` normalizes any supplied Estimate before a project-number
  mutation, covering sanctioned issue creation and other direct tether calls.
- compatibility `plan-estimate` normalizes planned and current numeric inputs,
  including a current value read from the board, before rendering the appendix.
- the planned-appendix renderer normalizes direct library inputs as defense in
  depth.
- `inflate-estimate` normalizes once before its audit comment, board mutation,
  and body-field mutation.
- Plan re-evaluation remains unchanged because its fixed estimates
  (`1.5`, `3.5`, `8`, `16`, `24`) already satisfy the policy.

The generic `formatIssueFieldDb` function is deliberately not changed. A global
normalization there would rewrite a historical off-grid Estimate during an
unrelated body update, violating the non-goal.

## Data Flow

1. Raw rubric/evidence math produces arbitrary precision internal values.
2. The forecast builder normalizes each value crossing into the published
   forecast shape and reconciles dependent totals.
3. Forecast validation refuses any off-grid or inconsistent payload.
4. Plan authority validates again, then converges the same normalized Plan
   value to the Refine/Plan comment, board, body, and durable record.
5. The forecast renderer displays the already-valid record.
6. Non-adaptive sanctioned writers apply the same primitive before their own
   multi-surface mutations.

## Error Handling

- `ceilEstimateHours` throws `TypeError` for non-numbers, non-finite values, or
  negative values.
- Forecast validation reports the existing `estimation-record:<category>`
  family with grid-specific categories at the offending surface.
- Plan authority rejects an invalid envelope before invoking any writer.
- Existing CLI validation continues to reject missing or non-positive Refine
  estimates; the ceiling runs only after that validation.
- Existing best-effort network behavior is unchanged. The same canonical value
  is computed before network operations, so retries cannot choose a different
  estimate.

## Testing

Focused tests prove:

- `3.0 -> 3.0`, `3.13 -> 3.5`, `3.3333 -> 3.5`, `3.5 -> 3.5`, and
  `3.633 -> 4.0`;
- floating-point noise at an exact boundary remains on that boundary;
- no valid input rounds downward;
- WBS and stage components are normalized and sum to their published totals;
- P80 remains normalized and at least P50;
- record validation rejects off-grid values at every forecast estimate
  surface;
- authority rejection performs zero writes;
- Refine, compatibility Plan, project tether, and inflation converge on the
  same normalized value; and
- exact whole/half inputs, lifecycle behavior, and measured actual-duration
  records are unchanged.

The final verification set is the issue's focused unit/integration commands,
the complete fast and slow lanes, lint, formatting, worktree verification, and
exact commit-trail inspection.

## Reference

- Base commit: `dec62d1cc024b73c66852fd981b2e1456b63956c`
- Issue: `#1098`
