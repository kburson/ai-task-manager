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

## Delivery Recovery Amendment — 2026-09-11

The implementation above was included in shared carrier PR #1582 at accepted
head `369934e676c88727033cc012bd23eddba2453f47`. GitHub squash-merged that pull
request to trunk as `fd2b0830d9c214aac087de4c29efbd13f4c85b0d`, with every
required hosted check green. AITM initially refused #1580's external receipt
because the GitHub-default multi-source squash title led with `[#1531]`, even
though `[#1580]` was present in the complete, exact source-derived token set.

Defect #1583 repaired that fail-closed recovery boundary and was independently
delivered by PR #1584 as trunk commit
`561c922319b5bb4c935f6274b30ac3b94fa17783`. The existing governed
`codex/ai-peer-review-design` branch was then synchronized by ordinary merge
commit `e02a9a166c6399d716bd4a97415ce3b48a8de443`; its merge tree
`f676b9d8447567b447b243c93b4b8f17531af949` is byte-identical to current trunk.
No rebase, reset, force-push, branch substitution, reviewer-byte edit, or issue
lineage change occurred.

Because PR #1582's head is immutable, this amendment is the real tracked delta
for a new #1580 delivery receipt. It records the recovery provenance without
claiming that the original lint exclusions landed anywhere other than PR #1582.
The final Test and Review evidence must bind to the amended branch head, and the
new pull request must carry only this audit amendment relative to trunk.
