# GitHub PR Merge Timestamp Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canonicalize live GitHub pull-request merge timestamps at the adapter boundary so an already-merged governed delivery can be verified and receipted.

**Architecture:** Reuse `normalizeGitHubInstant` in the default GitHub pull-request dependency immediately after deriving merged state. Merged snapshots with absent or invalid timestamps fail as provider-adapter errors; the strict delivery verifier remains unchanged.

**Tech Stack:** Node.js ES modules, GitHub CLI JSON adapter, `node:test`, AITM governed delivery records.

## Global Constraints

- Preserve strict canonical timestamp validation in `delivery-verification.mjs`.
- Do not rewrite intent `01M0PC83J1G7N2T7DZK0DJDCGC` or fabricate a delivery receipt.
- Do not issue a second merge action for PR #1385.
- Restrict production changes to the GitHub pull-request adapter boundary.

---

### Task 1: Canonicalize Merged Pull-Request Timestamps

**Files:**

- Modify: `scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`

**Interfaces:**

- Consumes: `normalizeGitHubInstant(value: unknown): string | null` from `github-comment-store.mjs`.
- Produces: `fetchPullRequest({ prNumber })` snapshots whose `mergedAt` is canonical whenever `merged === true`, or a `deliver:pull-request-merged-at` refusal.

- [ ] **Step 1: Write the failing live-shape normalization test**

Add a focused test that injects a merged `gh pr view` response with `mergedAt: '2026-08-23T03:57:33Z'`, stubs the source-ref lookup as a 404, calls `fetchPullRequest`, and asserts:

```js
assert.equal(pullRequest.mergedAt, '2026-08-23T03:57:33.000Z');
```

- [ ] **Step 2: Write the failing invalid-value test**

Use the same dependency boundary with merged responses whose `mergedAt` is `null` and `'not-an-instant'`, and require both calls to reject:

```js
await assert.rejects(
  deps.fetchPullRequest({ prNumber: 1385 }),
  /deliver:pull-request-merged-at/
);
```

- [ ] **Step 3: Run the tests and verify RED**

Run: `node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs`

Expected: the whole-second assertion receives `2026-08-23T03:57:33Z`; invalid merged timestamps are not rejected by the adapter.

- [ ] **Step 4: Implement the minimal adapter normalization**

Immediately after deriving `pr.merged`, normalize and validate only merged snapshots:

```js
pr.merged = String(pr.state || '').toUpperCase() === 'MERGED';
if (pr.merged) {
  const mergedAt = normalizeGitHubInstant(pr.mergedAt);
  if (mergedAt === null) throw deliverError('pull-request-merged-at');
  pr.mergedAt = mergedAt;
}
```

Do not modify `delivery-verification.mjs`.

- [ ] **Step 5: Run focused verification and verify GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
npm run lint
npm run format:check
git diff --check
```

Expected: every command exits 0; strict delivery-verification regressions remain unchanged and green.

- [ ] **Step 6: Commit the implementation**

```bash
git add scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs
git commit -m "[#1390] fix: normalize GitHub PR merge timestamps"
```

- [ ] **Step 7: Complete governed verification and live recovery**

Run the issue verification commands through `/task test #1390`, record Review and full-auto approval, then rerun `/task deliver #1389` against the existing merged PR.

Expected: AITM writes a delivery receipt observing merge commit `7c508fb6258390c577ad1091fa4827500e4e70e4`, emits no provider action, and permits #1389 closure.
