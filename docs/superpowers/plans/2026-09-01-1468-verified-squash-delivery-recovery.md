# Verified Squash Delivery Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let governed delivery recover a historical single-commit squash only when complete provider and Git object evidence distinguishes it from rebase.

**Architecture:** Widen the already-complete PR source inventory with immutable parent, tree, and full-message evidence, and widen merge inspection with its tree. Keep the classification pure inside `delivery-verification.mjs`; the external-recovery path may convert `rewritten-one-parent` to `squash` only when every source/merge structural predicate holds and the authorized configured method is squash.

**Tech Stack:** Node.js ESM, `node:test`, GitHub GraphQL through `gh api graphql`, Git commit-object inspection.

## Global Constraints

- Repository configuration alone is never historical merge-method proof.
- Exact accepted, Test, Review, PR-head, trunk-reachability, attribution, and branch-disposition gates remain unchanged.
- Missing, malformed, multi-commit, identical-message, parent-mismatched, tree-mismatched, or non-squash evidence must fail closed before any intent or receipt comment.
- No additional chained defect may be created; any newly discovered defect stops the chain.
- Follow strict RED-GREEN-REFACTOR order.

---

### Task 1: Prove and classify a single-source squash

**Files:**

- Modify: `scripts/tests/unit/task-tracker/verbs/deliver-test-harness.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Modify: `scripts/task-tracker/lib/delivery-verification.mjs`

**Interfaces:**

- Consumes: `pullRequest.sourceCommits`, merge inspection `{ parents, tree, commitTitle, commitMessage }`, and external intent `mergeMethod`.
- Produces: pure `classifySingleSourceSquash({ pullRequest, mergeInspection, expectedHeadSha, mergeSha }) -> boolean`, used only after the existing classifier returns `rewritten-one-parent`.

- [ ] **Step 1: Extend the harness with closed source and merge evidence**

Add default source evidence shaped as:

```js
{
  oid: HEAD,
  messageHeadline: '[#939] Add governed delivery intent verb',
  message: '[#939] Add governed delivery intent verb',
  parents: ['d'.repeat(40)],
  tree: '1'.repeat(40),
}
```

Return merge inspection with the same parent/tree and a different governed delivery message for the squash fixture. Add options that independently replace the source message, parent, tree, completeness, or source-commit count.

- [ ] **Step 2: Write the failing captured-history test**

In `deliver.test.mjs`, replace the old expectation that every external one-parent rewrite refuses. Assert a fixture with `prState: 'MERGED'`, absent/null provider merge method, one complete source commit, matching parent/tree, different source/merge messages, and configured squash returns `status === 'delivered'`, `recovery === true`, and two durable comments.

- [ ] **Step 3: Write fail-closed matrix tests**

For identical messages, multiple source commits, incomplete inventory, missing fields, parent mismatch, tree mismatch, source SHA mismatch, and configured merge method `merge`, assert rejection with `delivery-verification:merge-method-unknown` or `delivery-verification:merge-method`, plus:

```js
assert.equal(harness.calls.createIssueComment, 0);
assert.equal(harness.data.comments.length, 0);
```

- [ ] **Step 4: Run RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Expected: the captured squash fixture fails with `delivery-verification:merge-method-unknown`; existing ambiguity tests remain green.

- [ ] **Step 5: Implement the minimal pure classifier**

In `delivery-verification.mjs`, validate exact closed evidence. Return true only when all predicates hold:

```js
sourceCommitsComplete === true;
sourceCommits.length === 1;
source.oid === expectedHeadSha;
mergeSha !== expectedHeadSha;
source.parents.length === 1;
mergeInspection.parents.length === 1;
source.parents[0] === mergeInspection.parents[0];
source.tree === mergeInspection.tree;
source.message !== `${mergeInspection.commitTitle}\n\n${mergeInspection.commitMessage}`;
intent.mergeMethod === 'squash';
```

Use it only for external recovery when the ordinary classifier returns `rewritten-one-parent` and no explicit provider method observation exists. Do not alter two-parent merge handling or ordinary intent verification.

- [ ] **Step 6: Run GREEN**

Run the Step 4 command. Expected: all deliver tests pass with no warning output.

### Task 2: Supply complete provider evidence

**Files:**

- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs`

**Interfaces:**

- Consumes: GitHub GraphQL `Commit` fields `oid`, `messageHeadline`, `message`, `parents`, and `tree`.
- Produces: each `pullRequest.sourceCommits[]` as `{ oid, messageHeadline, message, parents, tree }`; `inspectMergeCommit()` as `{ parents, tree, commitTitle, commitMessage }`.

- [ ] **Step 1: Write failing default-dependency tests**

Extend GraphQL fixtures in `deliver-default-deps.test.mjs` and assert the normalized pull request contains full message, exactly complete parent OIDs, and tree OID. Add malformed/missing parent or tree cases that reject `deliver:pull-request-commits`.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs
```

Expected: normalized source evidence lacks `message`, `parents`, and `tree`.

- [ ] **Step 3: Widen the paginated GraphQL query and validator**

Request full commit evidence and reject nodes unless every OID is a 40-character lowercase SHA, `message` is a string, parent pagination is complete with exactly one parent for the supported recovery shape, and the tree OID is valid. Preserve the existing total-count, cursor, duplicate-OID, and accepted-head checks.

- [ ] **Step 4: Include the merge tree in local inspection**

Parse the single `tree <sha>` header in `inspectCommitObject`; reject missing, duplicate, or malformed tree headers before returning the closed inspection object.

- [ ] **Step 5: Run focused GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs \
  scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Expected: both suites pass.

- [ ] **Step 6: Run repository verification and commit**

Run `npm run lint`, `npm run format:check`, `npm test`, and `npm run test:slow` through the governed Test workflow. Then commit:

```bash
git add scripts/task-tracker/lib/delivery-verification.mjs \
  scripts/task-tracker/verbs/deliver.mjs \
  scripts/tests/unit/task-tracker/verbs/deliver-test-harness.mjs \
  scripts/tests/unit/task-tracker/verbs/deliver.test.mjs \
  scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs \
  docs/superpowers/plans/2026-09-01-1468-verified-squash-delivery-recovery.md
git commit -m "[#1468] fix: verify historical single-commit squash delivery"
```
