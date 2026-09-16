# Promote Decomposition Refusal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. Subagent dispatch is prohibited for this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the structured Plan-to-Develop decomposition refusal as an actionable exit-4 policy refusal instead of an unknown-status error.

**Architecture:** Keep `runPromote` and the decomposition guard unchanged. Add the existing `decomposition-refused` status to `verbPromote`'s established grouped refusal renderer, with a wrapper-level regression that drives the real guard-to-result-to-renderer path.

**Tech Stack:** Node.js ESM, `node:test`, AITM guard registry and promote verb dependency seams.

## Global Constraints

- Preserve decomposition thresholds, waiver behavior, and all unrelated result statuses.
- Unknown statuses continue to exit 1 through the generic fallback.
- Use test-driven development: observe the wrapper regression fail before editing production code.
- Deliver exactly one `[#1141]` commit containing design, plan, test, and implementation.

---

### Task 1: Render the Known Decomposition Refusal

**Files:**

- Modify: `scripts/task-tracker/tests/unit/verbs/coverage-promote.test.mjs`
- Modify: `scripts/task-tracker/verbs/promote.mjs`
- Verify: `docs/superpowers/specs/2026-08-07-promote-decomposition-refusal-design.md`
- Verify: `docs/superpowers/plans/2026-08-07-promote-decomposition-refusal.md`

**Interfaces:**

- Consumes: `runPromote`'s `{ status, message, blockers }` mapped-refusal result and the existing `runVerb(rest, deps)` wrapper test helper.
- Produces: `verbPromote` output containing the refusal message and `BLOCKED:` lines with process exit 4 for `decomposition-refused`.

- [ ] **Step 1: Add the failing wrapper regression**

Append this test beside the other `verbPromote` refusal cases:

```js
test('verbPromote: decomposition refusal renders blockers and exits 4', async () => {
  const { deps } = makeDeps({ body: bodyWithState('plan'), live: 'plan' });
  plannedEstimateOk(deps, 1134);
  deps.decomposition.projectValuesForIssue = async () => ({ size: 'XL', estimate: 24 });

  const r = await runVerb(['1134'], deps);

  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /Refusing to promote #1134 to develop/);
  assert.match(r.stderr, /BLOCKED:.*Decomposition Waiver/s);
  assert.doesNotMatch(r.stderr, /unknown result status/);
  assert.doesNotMatch(r.stdout, /promoted:/);
});
```

- [ ] **Step 2: Run the focused file and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/verbs/coverage-promote.test.mjs
```

Expected: the new test fails because the current wrapper exits 1 and prints
`promote: unknown result status: decomposition-refused`.

- [ ] **Step 3: Add the minimal production case**

In the grouped policy-refusal cases in `verbPromote`, add exactly:

```js
case 'decomposition-refused':
```

Place it beside the other Plan-exit refusal statuses before the shared branch
that prints the message and blockers and exits 4.

- [ ] **Step 4: Run the focused file and verify GREEN**

Run:

```bash
node --test scripts/task-tracker/tests/unit/verbs/coverage-promote.test.mjs
```

Expected: every test in the file passes; the new case exits 4, prints the
decomposition guidance, and emits no unknown-status or success output.

- [ ] **Step 5: Run story and repository verification**

Run:

```bash
node --test scripts/task-tracker/tests/unit/verbs/coverage-promote.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0 with no new test, lint, format, or whitespace
failure.

- [ ] **Step 6: Create the single story commit**

Stage only the four #1141 files and commit once:

```bash
git add \
  docs/superpowers/specs/2026-08-07-promote-decomposition-refusal-design.md \
  docs/superpowers/plans/2026-08-07-promote-decomposition-refusal.md \
  scripts/task-tracker/tests/unit/verbs/coverage-promote.test.mjs \
  scripts/task-tracker/verbs/promote.mjs
git commit -m "[#1141] fix(promote): render decomposition refusal"
```

Expected: one new commit on the story branch, with no unrelated path staged or
committed.
