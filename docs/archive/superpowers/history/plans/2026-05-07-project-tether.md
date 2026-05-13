# Project Tether Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure AI Task Manager only reports project-backed backlog creation when issues are visible from the configured GitHub Project V2 item collection.

**Architecture:** Add a reusable `scripts/gh/lib/project-tether.mjs` module plus a CLI wrapper. The module uses existing GitHub helpers, verifies membership from `ProjectV2.items`, repairs issue-side phantom project items with bounded retries, writes fields after verification, and optionally links sub-issues.

**Tech Stack:** Node ESM, `gh api graphql`, GitHub Projects V2 GraphQL, existing task-tracker config and project field helpers.

---

### Task 1: Add Project Tether Module Tests

**Files:**

- Create: `scripts/task-tracker/tests/project-tether.test.mjs`

- [ ] **Step 1: Write tests that fail because the module does not exist**

Run: `node scripts/task-tracker/tests/project-tether.test.mjs`
Expected: FAIL with module not found.

- [ ] **Step 2: Cover behaviors**

The test file must cover:

- existing project-side item is reused;
- missing item is added and verified from project side;
- issue-side phantom item is deleted and retried;
- retry exhaustion throws a diagnostic mentioning `ProjectV2.items`;
- `parentIssueNumber` links sub-issue after project verification;
- loose leaf tasks omit parent linking.

### Task 2: Implement Project Tether Module

**Files:**

- Create: `scripts/gh/lib/project-tether.mjs`

- [ ] **Step 1: Export `tetherIssueToProject(options)`**

The function accepts `cfg`, `issueNumber`, optional `parentIssueNumber`, optional project field values, `runGql`, `sleep`, `maxAttempts`, and `retryDelayMs`.

- [ ] **Step 2: Query from project side**

Add a helper that queries `ProjectV2.items(first: 100)` and returns the item whose content issue number matches the target.

- [ ] **Step 3: Repair phantom items**

If `Issue.projectItems` shows items for the project but project-side verification fails, delete those issue-side item IDs and retry.

- [ ] **Step 4: Set fields after verification**

Write Status, Priority, Size, Estimate, and Sequence only after a project-side item ID is found.

- [ ] **Step 5: Link parent only after project verification**

Call `addSubIssue` only when `parentIssueNumber` is present.

### Task 3: Add CLI Wrapper

**Files:**

- Create: `scripts/gh/project-tether.mjs`

- [ ] **Step 1: Parse flags**

Support `--issue`, `--parent`, `--status`, `--priority`, `--size`, `--estimate`, and `--sequence`.

- [ ] **Step 2: Load config and call the module**

Load `.ai-task-manager/task-tracker.json` through existing config code and print the verified item ID.

### Task 4: Integrate Migration

**Files:**

- Modify: `scripts/gh/migrate-project.mjs`

- [ ] **Step 1: Replace `projectItemForIssue || addIssueToProject`**

Call `tetherIssueToProject` and use its verified `itemId` before field writes.

### Task 5: Update Orchestration Instructions

**Files:**

- Modify: `skill/shared/SKILL.md`
- Modify: `README.md`

- [ ] **Step 1: Replace raw `addProjectV2ItemById` instructions**

Tell agents to call `scripts/gh/project-tether.mjs` for epics, sub-issues, and loose tasks.

- [ ] **Step 2: Document project-side verification**

State that `Issue.projectItems` is not sufficient; `ProjectV2.items` must contain the issue before creation is considered successful.

### Task 6: Verify

**Files:**

- Test: `scripts/task-tracker/tests/project-tether.test.mjs`
- Test: `scripts/task-tracker/tests/github-projects.test.mjs`

- [ ] **Step 1: Run focused tests**

Run:

```bash
node scripts/task-tracker/tests/project-tether.test.mjs
node scripts/task-tracker/tests/github-projects.test.mjs
```

Expected: both pass.
