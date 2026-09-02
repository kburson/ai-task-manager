# Orphan Documentation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve two unique documentation artifacts, integrate them through the governed pull-request path, and restore the main trunk checkout to a clean state.

**Architecture:** Treat the documents as immutable recovered blobs. Commit them separately on the issue branch, prove exact blob equivalence before removing redundant untracked copies, then use AITM delivery and cleanup gates.

**Tech Stack:** Git, GitHub CLI, AI Task Manager, Markdown tooling

## Global Constraints

- Preserve the exact recovered document bytes.
- Keep the context-load design as future work; do not implement it in this issue.
- Remove the linked worktree and local branch only after the merged commit is verified on trunk.

---

### Task 1: Publish and retire the recovered WIP

**Files:**

- Create: `docs/postmortems/2026-08-20-1356-planning-implementation-model-assessment.md`
- Create: `docs/superpowers/specs/2026-08-21-codex-context-load-reduction-design.md`

**Interfaces:**

- Consumes: the two exact untracked blobs recovered from the main checkout
- Produces: two issue-linked commits and a live-verified delivery receipt on trunk

- [ ] **Step 1: Verify exact recovery content**

  Run `git rev-parse HEAD:<path>` for each committed document and compare it with the original `git hash-object <path>` value.

  Expected: both hash pairs are identical.

- [ ] **Step 2: Verify documentation quality**

  Run `npx prettier --check <both paths>`, `npx markdownlint-cli2 <both paths>`, and `npx cspell --no-progress <both paths>`.

  Expected: every command exits zero.

- [ ] **Step 3: Verify repository regression baseline**

  Run `npm test` and the issue's governed Test command set.

  Expected: the fast lane and exact-SHA receipt pass.

- [ ] **Step 4: Deliver and clean up**

  Push `codex/1483-orphan-docs`, open a PR to `trunk`, use `npx aitm deliver 1483`, close through `npx aitm close 1483`, verify the merge commit on `origin/trunk`, then remove the clean linked worktree and merged local branch.

  Expected: issue #1483 is Done, trunk is clean, and neither the worktree nor local recovery branch remains.
