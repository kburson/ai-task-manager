# Numeric Timing Issue Identifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Timing Log writer accept the numeric issue identifiers used
by lifecycle verbs and restore #1133 approval reconciliation.

**Architecture:** Normalize issue identifiers at the two leaf GitHub helpers
that render `gh issue` arguments. A focused regression drives the real exported
writer boundary and proves all supported identifier shapes converge.

**Tech Stack:** Node.js ESM, `node:test`, GitHub CLI timing-comment helpers.

## Global Constraints

- Exactly one git commit for story #1138.
- Base and dependency commit: `f684ef3bbe429fc499f5e65ff36235f27901d2b8`.
- Do not rewrite or squash #1133.
- Do not change timing rows, approval markers, or rollup semantics.
- All scratch data stays below `.tmp/`.

---

### Task 1: Pin the Numeric Writer Failure

**Files:**

- Create:
  `scripts/task-tracker/tests/unit/core/gh-timing-comment-issue-number.test.mjs`
- Read: `scripts/task-tracker/gh-timing-comment.mjs`

**Interfaces:**

- Consumes: `findTimingComment(issueNumber, repo, options)` and
  `postTimingEvent({ issueNumber, repo, row, lock })`.
- Produces: regression evidence that numeric, string, and `#`-prefixed values
  render the same GitHub issue number.

- [ ] **Step 1: Write the failing production-boundary test**

Use an executable shim under `projectScratchDir('test')` to capture the
arguments passed by the real helper. Return an empty comments payload for
lookup, then a fake comment URL for creation. Invoke the exported helpers with
`1133`, `'1133'`, and `'#1133'`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/core/gh-timing-comment-issue-number.test.mjs
```

Expected: the numeric case fails with
`TypeError: issueNumber.replace is not a function`.

### Task 2: Normalize at the Shared GitHub Boundary

**Files:**

- Modify: `scripts/task-tracker/gh-timing-comment.mjs`
- Test:
  `scripts/task-tracker/tests/unit/core/gh-timing-comment-issue-number.test.mjs`

**Interfaces:**

- Consumes: numeric, string, or hash-prefixed `issueNumber`.
- Produces: a plain numeric string passed to `gh issue view` or
  `gh issue comment`.

- [ ] **Step 1: Implement the minimal fix**

Change both helper normalizers from:

```js
issueNumber.replace('#', '');
```

to:

```js
String(issueNumber).replace('#', '');
```

- [ ] **Step 2: Verify GREEN**

Run the focused verifier and confirm all identifier shapes pass.

- [ ] **Step 3: Run affected regressions**

```bash
node --test scripts/task-tracker/tests/unit/core/gh-timing-comment.test.mjs \
  scripts/task-tracker/tests/unit/verbs/approve-timing-boundary.test.mjs
```

Expected: all cases pass with no new warnings.

### Task 3: Verify and Commit Once

**Files:**

- Include the design, plan, production change, and focused regression.

**Interfaces:**

- Consumes: the green Task 2 patch.
- Produces: one #1138-attributed commit ready for governed Test and Review.

- [ ] **Step 1: Run repository verification**

```bash
npm run format:check
npm run lint
npm test
npm run test:slow
node scripts/dev-env/verify-local-worktree.mjs
git diff --check
```

- [ ] **Step 2: Create exactly one commit**

```bash
git add docs/superpowers/specs/2026-08-06-numeric-timing-issue-identifiers-design.md \
  docs/superpowers/plans/2026-08-06-numeric-timing-issue-identifiers.md \
  scripts/task-tracker/gh-timing-comment.mjs \
  scripts/task-tracker/tests/unit/core/gh-timing-comment-issue-number.test.mjs
git commit -m "[#1138] fix(timing): accept numeric issue identifiers"
```

- [ ] **Step 3: Complete governed delivery**

Run exact-SHA Test, repository Agent Review, Full-Auto approval, show the stack
delta against `origin/trunk`, fast-forward and verify trunk, push, close #1138,
then resume #1133 and retry its existing approval marker reconciliation.
