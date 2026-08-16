# Child Source-Plan Section Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify a generated non-epic child from its assigned `Source-plan-section` while preserving whole-plan decomposition for epics and standalone work.

**Architecture:** Extend the existing decomposition policy with a pure, Markdown-aware source-section selector and linked-plan metadata identity. Apply that selector to the single resolved plan snapshot before classification, then make Plan exit and `decompose-check` fail closed for an explicit contradictory section claim.

**Tech Stack:** Node.js ES modules, Node test runner, existing metadata-section and decomposition-policy helpers.

## Global Constraints

- Use the exact task heading written by `split-plan` as the section identity.
- Apply section scoping only when `Source-plan` is the active metadata source and no explicit plan override is in use.
- Preserve `Implementation-plan`, `Plan`, explicit override, epic WBS, waiver, and genuine non-epic `must-split` behavior.
- Treat duplicate fields, unknown headings, and duplicate matching headings as invalid requested selections.
- Do not treat an absent `Source-plan-section` as a waiver; retain whole-plan classification.
- Reuse the existing Markdown masking and `extractPlanTasks`; do not add a second parser.
- Do not modify the accepted #1268 specification or plan, and do not include #1272.
- Use strict TDD and observe RED before every production change.
- Do not push, merge, rebase, force-update, or open a pull request.

---

### Task 1: Select a bounded source-plan task in decomposition policy

**Files:**

- Modify: `scripts/task-tracker/lib/decomposition-policy.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs`

**Interfaces:**

- Produces: `linkedPlanReference(body) -> { key, path } | null` while preserving `linkedPlanPath(body) -> string | null`.
- Produces: `selectDecompositionPlanSection({ body, planText, activePlanKey }) -> { ok, applied, planText, heading, diagnostic }`.
- Consumes: existing `visibleStructuralLines`, `parseMetadataField`, `sectionBounds`, and `extractPlanTasks`.

- [ ] **Step 1: Write failing policy tests**

Add `linkedPlanReference` and `selectDecompositionPlanSection` to the test import.
Add these tests:

```js
test('selects exactly one bounded task from the active Source-plan', () => {
  const planText = taskPlan(6, 6);
  const body = [
    '## Plan Metadata',
    '- **Source-plan**: docs/parent.md',
    '- **Source-plan-section**: ### Task 2: Deliver part 2',
  ].join('\n');
  const selected = selectDecompositionPlanSection({
    body,
    planText,
    activePlanKey: 'Source-plan',
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.applied, true);
  assert.equal(classifyDecomposition({ planText: selected.planText }).taskCount, 1);
  assert.match(selected.planText, /^### Task 2: Deliver part 2/m);
  assert.doesNotMatch(selected.planText, /Task 1|Task 3/);
});

test('fails closed for duplicate fields, unknown headings, and duplicate tasks', () => {
  const metadata = (sections) =>
    ['## Plan Metadata', '- **Source-plan**: docs/parent.md', ...sections].join('\n');
  const duplicateField = selectDecompositionPlanSection({
    body: metadata([
      '- **Source-plan-section**: ### Task 1: Deliver part 1',
      '- **Source-plan-section**: ### Task 2: Deliver part 2',
    ]),
    planText: taskPlan(2, 2),
    activePlanKey: 'Source-plan',
  });
  assert.equal(duplicateField.ok, false);
  assert.match(duplicateField.diagnostic, /duplicate Source-plan-section/);

  const unknown = selectDecompositionPlanSection({
    body: metadata(['- **Source-plan-section**: ### Task 9: Missing']),
    planText: taskPlan(2, 2),
    activePlanKey: 'Source-plan',
  });
  assert.equal(unknown.ok, false);
  assert.match(unknown.diagnostic, /not found/);

  const ambiguous = selectDecompositionPlanSection({
    body: metadata(['- **Source-plan-section**: ### Task 1: Repeated']),
    planText: '### Task 1: Repeated\n\n### Task 1: Repeated',
    activePlanKey: 'Source-plan',
  });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.diagnostic, /ambiguous/);
});

test('keeps whole-plan text when source-section scoping is inactive', () => {
  const planText = taskPlan(4, 4);
  const withSection = [
    '## Plan Metadata',
    '- **Implementation-plan**: docs/child.md',
    '- **Source-plan**: docs/parent.md',
    '- **Source-plan-section**: ### Task 1: Deliver part 1',
  ].join('\n');
  const implementationPlan = selectDecompositionPlanSection({
    body: withSection,
    planText,
    activePlanKey: linkedPlanReference(withSection).key,
  });
  assert.equal(implementationPlan.applied, false);
  assert.equal(implementationPlan.planText, planText);

  const absentSection = selectDecompositionPlanSection({
    body: '## Plan Metadata\n- **Source-plan**: docs/parent.md',
    planText,
    activePlanKey: 'Source-plan',
  });
  assert.equal(absentSection.applied, false);
  assert.equal(absentSection.planText, planText);
});
```

- [ ] **Step 2: Run the policy test and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs
```

Expected: FAIL because the two new exports do not exist.

- [ ] **Step 3: Implement the minimal pure selector**

Add a visible-field collector that retains duplicates, make the linked-plan
helper return the winning key, and reconstruct the selected plan from the one
matching task:

```js
export function linkedPlanReference(body = '') {
  for (const key of PLAN_METADATA_KEYS) {
    const value = visibleMetadataFieldValue(body, 'Plan Metadata', key);
    if (value == null) continue;
    const candidate = value.replace(/\s+@\s+[0-9a-f]{7,40}\s*$/i, '').trim();
    if (isSubstantiveMetadataValue(candidate)) return { key, path: candidate };
  }
  return null;
}

export function linkedPlanPath(body = '') {
  return linkedPlanReference(body)?.path || null;
}

export function visibleMetadataFieldValues(body, heading, key) {
  const lines = visibleStructuralLines(body);
  const bounds = sectionBounds(lines, heading);
  if (!bounds) return [];
  const wanted = String(key).toLowerCase();
  return lines
    .slice(bounds.start, bounds.end)
    .map(parseMetadataField)
    .filter((field) => field?.key.toLowerCase() === wanted)
    .map((field) => field.value.trim());
}

export function selectDecompositionPlanSection({
  body = '',
  planText = '',
  activePlanKey = null,
} = {}) {
  const inactive = {
    ok: true,
    applied: false,
    planText: String(planText),
    heading: null,
    diagnostic: null,
  };
  if (activePlanKey !== 'Source-plan') return inactive;
  const values = visibleMetadataFieldValues(body, 'Plan Metadata', 'Source-plan-section');
  if (values.length === 0) return inactive;
  if (values.length !== 1) {
    return {
      ...inactive,
      ok: false,
      applied: true,
      diagnostic: 'duplicate Source-plan-section fields',
    };
  }
  const heading = values[0];
  if (!isSubstantiveMetadataValue(heading)) {
    return {
      ...inactive,
      ok: false,
      applied: true,
      heading,
      diagnostic: 'Source-plan-section is empty',
    };
  }
  const matches = extractPlanTasks(planText).filter((task) => task.heading === heading);
  if (matches.length !== 1) {
    return {
      ...inactive,
      ok: false,
      applied: true,
      heading,
      diagnostic:
        matches.length === 0
          ? `Source-plan-section not found: ${heading}`
          : `Source-plan-section is ambiguous: ${heading}`,
    };
  }
  const [task] = matches;
  return {
    ok: true,
    applied: true,
    planText: `${task.heading}\n${task.body}`,
    heading,
    diagnostic: null,
  };
}
```

- [ ] **Step 4: Run the policy test and confirm GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the policy unit**

```bash
git add scripts/task-tracker/lib/decomposition-policy.mjs \
  scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs
git commit -m "[#1281] fix: scope child decomposition to source section"
```

### Task 2: Enforce selection in Plan exit and decompose-check

**Files:**

- Modify: `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs`
- Modify: `scripts/task-tracker/verbs/decompose-check.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`

**Interfaces:**

- Consumes: `linkedPlanReference(body)` and `selectDecompositionPlanSection(...)` from Task 1.
- Extends evaluator results with `planSelection`.
- Preserves: existing `classification`, `waiver`, `effectiveStatus`, `planDiagnostic`, and `values` fields.

- [ ] **Step 1: Write failing guard and CLI tests**

Add a source-child context whose resolved plan contains six tasks but whose
metadata names Task 1. Assert:

```js
const evaluated = await evaluateIssueDecomposition(sourceChildContext());
assert.equal(evaluated.classification.status, 'story-ok');
assert.equal(evaluated.classification.taskCount, 1);
assert.equal(evaluated.planSelection.applied, true);

const admitted = await decompositionPlanExitGuard.run(sourceChildContext());
assert.equal(admitted.ok, true);
```

Add an unknown-section context with M/8 board fields and assert the guard blocks
with `invalid Source-plan-section`. Assert `runDecomposeCheck` returns exit code 3
for the same invalid selection. Retain the existing test proving a whole non-epic
four-task plan remains blocked.

- [ ] **Step 2: Run the Plan-exit test and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs
```

Expected: FAIL because evaluation still classifies all six tasks and exposes no
`planSelection` result.

- [ ] **Step 3: Apply the selector to the resolved snapshot**

In `evaluateIssueDecompositionSnapshot`, compute the winning reference only when
`planOverride == null`, select the effective plan text, classify that text, and
return `planSelection`. In the guard, refuse `!result.planSelection.ok` before the
existing classification branches:

```js
if (!result.planSelection.ok) {
  const blockers = [
    `plan-exit-decomposition: invalid Source-plan-section`,
    result.planSelection.diagnostic,
  ];
  return { ok: false, reason: blockers.join('; '), blockers };
}
```

In `runDecomposeCheck`, set exit code 3 when the selection is invalid or the
classification is unwaived `must-split`. In `formatDecomposeCheck`, print the
selection diagnostic when invalid and the selected heading when applied.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs
```

Expected: both PASS.

- [ ] **Step 5: Confirm trunk-rooted fail-closed behavior, then defer live #1273 proof to parent integration**

Run:

```bash
npx aitm decompose-check 1273 --json
```

Expected in the trunk-rooted #1281 worktree: exit 3 with `plan path is not a
readable file`, because #1273's accepted source plan lives on the #1268 branch
lineage rather than trunk. This proves the new selector fails closed when its
source is unavailable.

After #1281 is integrated into #1273's parent-based worktree, run the same
command there. Expected: `classification.status` is `story-ok`, `taskCount` is
`1`, and `planSelection.heading` is
`### Task 1: Add authenticated active-session budget adjustment`.

- [ ] **Step 6: Run repository verification**

Run:

```bash
node scripts/task-tracker/verify-develop.mjs
```

Expected: exit 0.

- [ ] **Step 7: Commit the integration unit**

```bash
git add scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs \
  scripts/task-tracker/verbs/decompose-check.mjs \
  scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs
git commit -m "[#1281] fix: enforce bounded child plan classification"
```
