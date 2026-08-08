# Definition of Done Phase Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split AITM's canonical non-Functional Definition of Done items into Review-owned Lifecycle and Close-owned Housekeeping sections without breaking legacy combined-section bodies.

**Architecture:** Keep the existing lifecycle keys and public helper signatures. Extend `lifecycle-dod.mjs` with exact canonical and legacy section locators, aggregate new sections for reads, and route mutations by key ownership with a legacy fallback. Update both templates and the architecture guide only after parser compatibility is proven.

**Tech Stack:** Node.js ESM, built-in `node:test`, Markdown templates, Prettier, ESLint, AITM sanctioned verification.

## Global Constraints

- Canonical headings are exactly `### Functional (verified at Test)`, `### Lifecycle (verified at Review)`, and `### Housekeeping (verified at Close)`.
- Existing lifecycle keys and visible checkbox labels must not change.
- Legacy `Lifecycle (auto-ticked at Review/Close)` bodies must remain readable and mutable.
- Canonical sections take precedence over the legacy combined section when both forms appear.
- No historical corpus rewrite or new persisted marker schema is in scope.
- Dogfood and packaged Definition of Done templates must remain identical.
- Every implementation change follows red-green-refactor TDD and carries `[#982]` commit attribution.

---

### Task 1: Add canonical section location and aggregate parsing

**Files:**

- Modify: `scripts/task-tracker/lib/lifecycle-dod.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs`

**Interfaces:**

- Consumes: the existing `locateBy(headingRe, body)` bounded-section helper.
- Produces: `locateHousekeepingSection(body)`, compatibility-preserving `locateLifecycleSection(body)`, and `parseLifecycleItems(body)` returning all owned items in document order.

- [ ] **Step 1: Write failing canonical-section parser tests**

Add a `CANONICAL_TEMPLATE` fixture with the exact three headings and assertions:

```js
const CANONICAL_TEMPLATE = [
  '## Definition of Done',
  '',
  '### Functional (verified at Test)',
  '',
  '- [ ] Acceptance criteria met',
  '',
  '### Lifecycle (verified at Review)',
  '',
  '- [ ] Agent Review Passed',
  '- [ ] Final Review Passed',
  '',
  '### Housekeeping (verified at Close)',
  '',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
].join('\n');

test('#982 canonical sections expose all owned keys in document order', () => {
  assert.deepEqual(
    parseLifecycleItems(CANONICAL_TEMPLATE).map(({ key }) => key),
    ['agent-review-passed', 'passed-final-review', 'story-closed', 'timing-flushed']
  );
  assert.match(locateLifecycleSection(CANONICAL_TEMPLATE).section, /Agent Review Passed/);
  assert.doesNotMatch(locateLifecycleSection(CANONICAL_TEMPLATE).section, /Story closed/);
  assert.match(locateHousekeepingSection(CANONICAL_TEMPLATE).section, /Story closed/);
});
```

Also add a body containing `### Housekeeping notes` before the canonical
Housekeeping heading and assert the descriptive heading is ignored.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs
```

Expected: FAIL because `locateHousekeepingSection` is not exported and the new
Lifecycle heading does not match the old combined-heading regular expression.

- [ ] **Step 3: Implement exact heading locators and aggregate reads**

Add exact expressions and ownership constants:

```js
const CANONICAL_LIFECYCLE_HEADING_RE = /^#{3,4}\s+Lifecycle\s+\(verified at Review\)\s*$/im;
const HOUSEKEEPING_HEADING_RE = /^#{3,4}\s+Housekeeping\s+\(verified at Close\)\s*$/im;
const LEGACY_LIFECYCLE_HEADING_RE = /^#{3,4}\s+Lifecycle\s+\(auto-ticked at Review\/Close\)\s*$/im;

export const REVIEW_OWNED_LIFECYCLE_KEYS = new Set(['agent-review-passed', 'passed-final-review']);
export const HOUSEKEEPING_KEYS = new Set(['story-closed', 'timing-flushed']);
```

Make `locateLifecycleSection` prefer the canonical Lifecycle section and fall
back to the legacy combined section. Add `locateHousekeepingSection` for the
exact canonical Housekeeping heading. Refactor checkbox parsing into a private
`parseOwnedItems(loc)` helper. `parseLifecycleItems` must parse both canonical
locations when Housekeeping exists, otherwise parse the single legacy location.

- [ ] **Step 4: Run the focused test and confirm green**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs
```

Expected: all existing legacy tests and the new canonical tests PASS.

- [ ] **Step 5: Commit the parser slice**

```bash
git add scripts/task-tracker/lib/lifecycle-dod.mjs scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs
git commit -m "[#982] refactor(dod): locate phase-owned sections"
TT_FULL_AUTO=1 npx aitm commit-trace 982
```

### Task 2: Route lifecycle mutations to the owning section

**Files:**

- Modify: `scripts/task-tracker/lib/lifecycle-dod.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/lifecycle-satisfaction.test.mjs`

**Interfaces:**

- Consumes: `REVIEW_OWNED_LIFECYCLE_KEYS`, `HOUSEKEEPING_KEYS`, and both canonical locators from Task 1.
- Produces: unchanged public contracts for `lifecycleItemState`, `tickLifecycleItem`, `untickLifecycleItem`, `detectLifecyclePretick`, and `lifecycleSatisfaction` across canonical and legacy bodies.

- [ ] **Step 1: Write failing ownership and compatibility tests**

Add tests that:

```js
test('#982 ticks each key only in its owning canonical section', () => {
  const reviewed = tickLifecycleItem(CANONICAL_TEMPLATE, 'agent-review-passed');
  assert.match(reviewed, /### Lifecycle[\s\S]*- \[x\] Agent Review Passed/);
  assert.match(reviewed, /### Housekeeping[\s\S]*- \[ \] Story closed/);

  const closed = tickLifecycleItem(reviewed, 'story-closed');
  assert.match(closed, /### Housekeeping[\s\S]*- \[x\] Story closed and moved to Done/);
});

test('#982 pre-tick detection scans Lifecycle and Housekeeping', () => {
  const body = tickLifecycleItem(
    tickLifecycleItem(CANONICAL_TEMPLATE, 'agent-review-passed'),
    'timing-flushed'
  );
  const result = detectLifecyclePretick(body);
  assert.deepEqual(
    result.regressions.map(({ key }) => key),
    ['agent-review-passed', 'timing-flushed']
  );
});
```

Extend satisfaction tests with a canonical body whose review items are ticked
and housekeeping items are unticked; `assertLifecycleSatisfied` must not block
on the two close-owned keys. Keep the existing legacy combined fixture tests.

- [ ] **Step 2: Run focused tests and confirm red**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs scripts/task-tracker/tests/unit/lib/lifecycle-satisfaction.test.mjs
```

Expected: FAIL because mutation helpers still operate on only one located
section and cannot tick Housekeeping keys in the canonical layout.

- [ ] **Step 3: Implement key-to-section routing**

Add a private locator:

```js
function locateSectionForKey(body, key) {
  const legacy = locateBy(LEGACY_LIFECYCLE_HEADING_RE, body);
  if (legacy) return legacy;
  if (HOUSEKEEPING_KEYS.has(key)) return locateHousekeepingSection(body);
  return locateLifecycleSection(body);
}
```

Use it in `lifecycleItemState` and `_toggleLifecycleItem`. Keep unknown-key
errors unchanged. Make `detectLifecyclePretick` iterate the aggregated
`parseLifecycleItems` result and call `untickLifecycleItem` per key, preserving
markers and item order.

- [ ] **Step 4: Run focused tests and confirm green**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs scripts/task-tracker/tests/unit/lib/lifecycle-satisfaction.test.mjs
```

Expected: canonical and legacy tests PASS with no changed public signatures.

- [ ] **Step 5: Commit the mutation slice**

```bash
git add scripts/task-tracker/lib/lifecycle-dod.mjs scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs scripts/task-tracker/tests/unit/lib/lifecycle-satisfaction.test.mjs
git commit -m "[#982] feat(dod): route phase-owned lifecycle ticks"
TT_FULL_AUTO=1 npx aitm commit-trace 982
```

### Task 3: Render the three canonical categories

**Files:**

- Modify: `templates/definition-of-done.md`
- Modify: `.ai-task-manager/templates/definition-of-done.md`
- Modify: `scripts/task-tracker/tests/unit/core/templates.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/preflight-issue.test.mjs`

**Interfaces:**

- Consumes: the canonical headings and parser behavior established in Tasks 1-2.
- Produces: identical packaged and dogfood templates that render the three phase categories in order.

- [ ] **Step 1: Write failing template and render assertions**

In `templates.test.mjs`, assert both files are equal and contain exactly one of
each canonical heading in increasing order. Assert the old combined heading is
absent. In `preflight-issue.test.mjs`, render a solo body and assert the Review
items occur between Lifecycle and Housekeeping while Close items occur after
Housekeeping.

- [ ] **Step 2: Run the focused tests and confirm red**

Run:

```bash
node --test scripts/task-tracker/tests/unit/core/templates.test.mjs scripts/task-tracker/tests/unit/lib/preflight-issue.test.mjs
```

Expected: FAIL because both templates still render the combined Lifecycle
heading and have no Housekeeping heading.

- [ ] **Step 3: Update both templates identically**

Replace the combined block with:

```markdown
### Lifecycle (verified at Review)

- [ ] Agent Review Passed
- [ ] Final Review Passed

### Housekeeping (verified at Close)

- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue
```

Update the leading template comment to describe Lifecycle and Housekeeping as
separate verb-owned categories. Do not change Functional declarations or label
text.

- [ ] **Step 4: Run focused tests and confirm green**

Run:

```bash
node --test scripts/task-tracker/tests/unit/core/templates.test.mjs scripts/task-tracker/tests/unit/lib/preflight-issue.test.mjs
```

Expected: both template parity and rendered-body assertions PASS.

- [ ] **Step 5: Commit the rendering slice**

```bash
git add templates/definition-of-done.md .ai-task-manager/templates/definition-of-done.md scripts/task-tracker/tests/unit/core/templates.test.mjs scripts/task-tracker/tests/unit/lib/preflight-issue.test.mjs
git commit -m "[#982] feat(template): split lifecycle and housekeeping DoD"
TT_FULL_AUTO=1 npx aitm commit-trace 982
```

### Task 4: Align Review, Close, and documentation contracts

**Files:**

- Modify: `scripts/task-tracker/tests/unit/verbs/approve-full-auto-unified.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/approve-review-notes.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/close-convergence-wiring-helpers.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/close-reconcile-lifecycle.test.mjs`
- Modify: `docs/architecture/lifecycle-dod.md`
- Modify: `docs/guides/workflow.md`

**Interfaces:**

- Consumes: unchanged approval and close verbs plus canonical parser routing.
- Produces: integration fixtures and operator documentation that reflect Review-owned Lifecycle and Close-owned Housekeeping sections.

- [ ] **Step 1: Convert authoritative Review and Close fixtures**

Replace the combined heading only in fixtures that assert canonical current
output. Put review labels under `### Lifecycle (verified at Review)` and close
labels under `### Housekeeping (verified at Close)`. Leave dedicated legacy
compatibility fixtures unchanged.

- [ ] **Step 2: Run Review and Close tests**

Run:

```bash
node --test scripts/task-tracker/tests/unit/verbs/approve-full-auto-unified.test.mjs scripts/task-tracker/tests/unit/verbs/approve-review-notes.test.mjs scripts/task-tracker/tests/unit/verbs/close-reconcile-lifecycle.test.mjs
```

Expected: PASS, proving approval ticks Lifecycle and close convergence ticks
Housekeeping without caller changes.

- [ ] **Step 3: Update architecture and workflow documentation**

Document all four keys using the current labels:

```markdown
| `agent-review-passed` | Lifecycle | `Agent Review Passed` | Agent Review |
| `passed-final-review` | Lifecycle | `Final Review Passed` | `/task approve` |
| `story-closed` | Housekeeping | `Story closed and moved to Done` | `/task close` |
| `timing-flushed` | Housekeeping | `Timing data flushed to issue` | close timing flush |
```

Describe the legacy combined heading as a supported read/mutation fallback,
not canonical output. Update workflow prose that says Lifecycle owns Close.

- [ ] **Step 4: Run documentation and focused regression checks**

Run:

```bash
npx prettier --check docs/architecture/lifecycle-dod.md docs/guides/workflow.md
npx markdownlint-cli2 docs/architecture/lifecycle-dod.md docs/guides/workflow.md
node --test scripts/task-tracker/tests/unit/lib/lifecycle-dod.test.mjs scripts/task-tracker/tests/unit/lib/lifecycle-satisfaction.test.mjs scripts/task-tracker/tests/unit/core/templates.test.mjs scripts/task-tracker/tests/unit/verbs/approve-full-auto-unified.test.mjs scripts/task-tracker/tests/unit/verbs/approve-review-notes.test.mjs scripts/task-tracker/tests/unit/verbs/close-reconcile-lifecycle.test.mjs
```

Expected: formatting, Markdown lint, and all focused regressions PASS.

- [ ] **Step 5: Commit the integration/documentation slice**

```bash
git add scripts/task-tracker/tests/unit/verbs/approve-full-auto-unified.test.mjs scripts/task-tracker/tests/unit/verbs/approve-review-notes.test.mjs scripts/task-tracker/tests/unit/verbs/close-convergence-wiring-helpers.mjs scripts/task-tracker/tests/unit/verbs/close-reconcile-lifecycle.test.mjs docs/architecture/lifecycle-dod.md docs/guides/workflow.md
git commit -m "[#982] docs(dod): document phase ownership"
TT_FULL_AUTO=1 npx aitm commit-trace 982
```

### Task 5: Final verification and governed delivery

**Files:**

- Verify: the complete `trunk...HEAD` delta and live #982 body.

**Interfaces:**

- Consumes: all Tasks 1-4.
- Produces: exact-SHA verification receipt, Agent Review evidence, and an integration-ready branch.

- [ ] **Step 1: Run repository quality checks**

Run:

```bash
npm run lint
npm run format:check
git diff --check trunk...HEAD
```

Expected: all commands exit 0.

- [ ] **Step 2: Run sanctioned issue verification**

Run:

```bash
TT_FULL_AUTO=1 npx aitm test 982
```

Expected: sandbox verification passes at the exact branch SHA and #982 moves
to Test or is reverified in place.

- [ ] **Step 3: Run independent review and AITM Agent Review**

Review `trunk...HEAD` for correctness and compatibility, fix any prioritized
finding test-first, then run:

```bash
TT_FULL_AUTO=1 npx aitm review 982
```

Expected: every registered validator passes and #982 moves to Review.

- [ ] **Step 4: Approve, integrate, and close**

After Full-Auto approval, fetch `origin/trunk`, prove ancestry and mergeability,
rebase only if the remote advanced, rerun exact-SHA verification if rewritten,
fast-forward trunk, push, and run:

```bash
TT_FULL_AUTO=1 npx aitm approve 982
TT_FULL_AUTO=1 npx aitm close 982
```

Expected: the qualifying `[#982]` commits are reachable from `origin/trunk`,
the issue and board converge to Done, lifecycle and housekeeping items are
ticked by their owning verbs, and terminal timing is durable.
