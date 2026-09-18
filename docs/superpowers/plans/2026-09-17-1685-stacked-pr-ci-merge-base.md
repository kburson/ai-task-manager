# #1685 Stacked PR CI Merge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make required pull-request CI classify stacked epic-child diffs without failing because shallow history hides the `trunk...HEAD` merge base.

**Architecture:** Retain the existing pull-request-only local `trunk` materialization from #745, but make the fast-lane checkout history-complete so three-dot diff classification works for both direct-to-trunk and stacked epic PRs. Extend the existing #745 workflow contract test rather than creating a second overlapping source-inspection test.

**Tech Stack:** GitHub Actions YAML, Node.js built-in test runner, repository lint and format gates.

**Spec:** GitHub issue #1685.

## Global Constraints

- Preserve `git diff --name-only trunk...HEAD` as the docs-only classification command.
- Preserve both pull-request-only `git fetch --no-tags origin trunk:trunk` steps required by #745.
- Do not change slow-lane scheduling or package-compatibility behavior.
- Implement test-first and keep the change limited to CI history depth plus its contract test.

---

### Task 1: Make the Fast CI Checkout History-Complete

**Files:**

- Modify: `scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the GitHub pull-request merge ref, the local `trunk` ref materialized by #745, and the existing `trunk...HEAD` docs-only classifier.
- Produces: a fast-lane checkout with complete ancestry and a source-level contract that refuses restoration of shallow depth 2.

- [ ] **Step 1: Write the failing workflow-contract assertion**

Update AC3 in `ci-745-trunk-ref.test.mjs` to require exactly one `fetch-depth: 0`, require it inside `FAST_JOB`, and reject `fetch-depth: 2`. Retain the assertions for `DOCS_ONLY_DIFF`, both #745 materialization steps, and no explicit depth in `SLOW_JOB`.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `node --test scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs`

Expected: FAIL because `.github/workflows/ci.yml` still contains `fetch-depth: 2` and no `fetch-depth: 0`.

- [ ] **Step 3: Implement the minimal workflow change**

Change only the fast job's checkout setting to `fetch-depth: 0`. Update the adjacent comment to explain that complete ancestry is required for stacked epic-child PR merge-base discovery; retain the #745 local-trunk step unchanged.

- [ ] **Step 4: Verify the focused and repository gates**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the defect fix**

```bash
git add .github/workflows/ci.yml scripts/tests/unit/task-tracker/core/ci-745-trunk-ref.test.mjs docs/superpowers/plans/2026-09-17-1685-stacked-pr-ci-merge-base.md
git commit -m "[#1685] fix(ci): retain ancestry for stacked pull requests"
```
