# Immutable Reviewer Markdownlint Unblock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository Markdown lint pass without changing the immutable
Claude reviewer responses from #1578 rounds 2 and 4.

**Architecture:** Add exact-file exclusions for the two immutable responses to
the existing markdownlint configuration. Add an integration test that locks
their hashes, verifies both exclusions, and invokes markdownlint against the
two paths. Keep durable directory-level reviewer-collateral policy in #1581.

**Tech Stack:** Node.js 22+, `node:test`, `markdownlint-cli2`, Prettier

## Global Constraints

- Preserve both #1578 reviewer files byte-for-byte.
- Exclude only the two currently failing files; do not broadly ignore review
  collateral.
- Keep the durable policy change owned by #1581 out of this fix.
- Run repository-wide lint, format, fast tests, and slow tests before delivery.

---

### Task 1: Exclude the immutable responses with regression coverage

**Files:**

- Create:
  `scripts/tests/integration/maintenance/markdownlint-review-artifact-policy.test.mjs`
- Modify: `.markdownlint-cli2.jsonc`

**Interfaces:**

- Consumes: markdownlint's existing `ignores` array and local CLI entry point.
- Produces: two exact immutable-review exclusions and a regression test that
  checks file hashes, configuration membership, and focused lint execution.

- [x] **Step 1: Write the failing regression test**

Create a `node:test` case with the two repository-relative reviewer paths and
their current SHA-256 values:

```javascript
const REVIEW_FILES = [
  {
    path: 'docs/superpowers/reviews/1578/plan/2026-09-10-1578-package-boundary-ceiling-r2-reviewer-claude-review.md',
    sha256: 'b0cffbbadf279230590bfa9295aed21c44ca8e8474d5714b6375710bbdeb0416',
  },
  {
    path: 'docs/superpowers/reviews/1578/plan/2026-09-10-1578-package-boundary-ceiling-r4-reviewer-claude-review.md',
    sha256: 'ea86a94e36f9bf907921278cd43f691f84f90fe3dba975fa43a893c8d098ff1d',
  },
];
```

The test must parse `.markdownlint-cli2.jsonc`, assert both exact paths are in
`ignores`, verify each current file hash, and run `markdownlint-cli2 --no-globs`
against both literal paths.

- [x] **Step 2: Verify the regression test fails for the missing exclusions**

Run:

```bash
node --test scripts/tests/integration/maintenance/markdownlint-review-artifact-policy.test.mjs
```

Expected: FAIL because neither #1578 path is present in `ignores`.

- [x] **Step 3: Add the two exact-file exclusions**

Append both repository-relative paths to `.markdownlint-cli2.jsonc` beside the
existing immutable-review exclusions. Do not add a directory glob or change the
review files.

- [x] **Step 4: Verify the focused regression and Markdown lint pass**

Run:

```bash
node --test scripts/tests/integration/maintenance/markdownlint-review-artifact-policy.test.mjs
npm run lint:md
```

Expected: the regression reports one passing test and markdownlint reports zero
issues across all governed Markdown files.

- [x] **Step 5: Verify repository quality**

Run:

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
git diff --check
```

Expected: every command exits 0 and the two reviewer-file SHA-256 values remain
unchanged.

- [x] **Step 6: Commit the defect fix**

Stage only the plan, configuration, and regression test, then commit with:

```bash
git commit -m "fix: unblock immutable reviewer Markdown lint [#1580]"
```
