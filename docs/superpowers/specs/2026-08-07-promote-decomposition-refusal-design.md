# Promote Decomposition Refusal Design

## Context

The Plan-to-Develop decomposition gate returns a structured
`decomposition-refused` result when an issue must be split and lacks a valid
waiver. The transition core preserves the refusal message and blocker list, but
the top-level `promote` wrapper does not recognize that status. It therefore
prints `promote: unknown result status: decomposition-refused`, exits 1, and
hides the actionable remediation. Issue #1134 exposed this exact sequence.

The mismatch originated in #1052: commit `3ec45f75` added
`plan-exit-decomposition: decomposition-refused` to `REFUSAL_ID_TO_STATUS`
without adding the status to the wrapper's grouped refusal cases.

## Requirements

- Render `decomposition-refused` through the same policy-refusal path as the
  other mapped Plan-exit refusals.
- Print the structured refusal message and every supplied `BLOCKED:` line.
- Exit 4 and never report promotion success.
- Prove the complete guard-to-wrapper path with a production-shaped regression.
- Preserve all decomposition thresholds, waiver rules, and unrelated result
  rendering.

## Considered Approaches

### Explicit grouped case

Add `case 'decomposition-refused':` to the existing refusal group. This is the
selected approach because it restores the already-defined status contract with
one explicit semantic change and follows the pattern used by every neighboring
mapped refusal.

### Generic refused-status matching

Treat any status ending in `-refused` as a policy refusal. This would reduce
future switch maintenance, but it would silently widen the accepted status
vocabulary and could misclassify a new internal error. That semantic expansion
is not justified by this defect.

### Renderer table refactor

Replace the switch with a declarative status-to-renderer table. This could make
exhaustiveness easier to audit, but it changes every promote result branch and
would turn a one-case defect into a broad presentation refactor.

## Design

`runPromote` remains unchanged. Its existing guard registry call translates
`plan-exit-decomposition` into a result shaped as:

```js
{
  status: 'decomposition-refused',
  message: 'Refusing to promote #N to develop: ...',
  blockers: ['Add a visible ## Decomposition Waiver ...'],
}
```

`verbPromote` will recognize that status in the existing grouped refusal case.
The shared branch writes the refusal message, writes each blocker with the
`BLOCKED:` prefix, and exits 4. No new helper, output vocabulary, or fallback
behavior is introduced.

## Error Handling

Only the known `decomposition-refused` status changes behavior. Unknown statuses
continue to reach the generic error branch and exit 1. Empty or malformed
blocker payloads retain the existing mapped-refusal behavior; this story does
not invent fallback text because the decomposition guard already supplies its
reason and remediation.

## Testing

Extend `scripts/task-tracker/tests/unit/verbs/coverage-promote.test.mjs` through
the existing `verbPromote` dependency seam. The fixture will:

1. Start from a valid Plan-state body.
2. Supply the required planned-estimate evidence.
3. Make the real decomposition guard classify the issue as must-split through
   XL size and a 24-hour estimate with no waiver.
4. Assert exit 4, the refusal and `BLOCKED:` guidance, no unknown-status text,
   and no promoted-success output.

The test must be observed failing before the production case is added, then pass
after the one-line implementation. Repository fast/slow suites, lint, format,
governed exact-SHA Test, and Agent Review remain the completion gates.

## Non-Goals

- Changing decomposition classification or waiver acceptance.
- Automatically splitting issues.
- Generalizing result rendering across other verbs.
- Refactoring the promote switch or status map.

## Delivery Constraint

The design, implementation plan, test, and production fix will ship in exactly
one `[#1141]` story commit, per the user's one-commit-per-story requirement.
