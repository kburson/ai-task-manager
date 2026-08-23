# Current-Head Pull Request Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select the unique branch-associated pull request for the current local head without breaking merged delivery recovery.

**Architecture:** Filter fetched PR snapshots by exact `headRefOid === localHeadSha` before check lookup and preflight validation. Reuse the existing one-PR preflight invariant for zero and duplicate matches.

**Tech Stack:** Node.js ES modules, `node:test`, AITM exact-head delivery preflight.

## Global Constraints

- Preserve `--state all` PR discovery so merged receipt recovery remains possible.
- Preserve fail-closed count refusal for ambiguous branch history and the existing head-mismatch refusal for one wrong-head PR.
- Do not add a manual PR override or change provider action bytes.

---

### Task 1: Select the Unique Current-Head PR

**Files:**

- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`

**Interfaces:**

- Consumes: fetched PR snapshots containing `number`, `state`, and `headRefOid`; `localHeadSha`.
- Produces: a zero-, one-, or multiple-element exact-head PR set consumed by existing delivery preflight.

- [ ] **Step 1: Write failing exact-head selection tests**

Add a harness option for multiple PR snapshots. Verify that one old-head PR plus one current-head PR yields an action for the current PR. Add zero-match and duplicate-match cases that reject with `delivery-preflight:pull-request-count`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`

Expected: the historical/current case fails with `delivery-preflight:pull-request-count` before implementation.

- [ ] **Step 3: Implement minimal exact-head filtering**

After fetching branch-associated snapshots, add:

```js
const exactHeadPullRequests = pullRequests.filter(
  (pullRequest) => pullRequest.headRefOid === localHeadSha
);
```

When multiple PRs were discovered, use `exactHeadPullRequests` for merged-state detection, required-check lookup, commit-subject selection, and `preflightInput.pullRequests`. When exactly one wrong-head PR was discovered, pass it through so the existing preflight retains its specific `head-mismatch` refusal.

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0; existing merged recovery and provider-action tests remain green.

- [ ] **Step 5: Commit the implementation**

```bash
git add scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
git commit -m "[#1392] fix: select delivery PR by exact head"
```

- [ ] **Step 6: Complete governed verification and live acceptance**

Run `/task test #1392`, Review, full-auto approval, update PR #1391, require both CI lanes at the exact head, and rerun `/task deliver #1392`.

Expected: one provider action names PR #1391; no historical PR is selected.
