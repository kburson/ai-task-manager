# #1601 Merge-Back Child Branch Authority Implementation Plan

> **For Codex:** Follow the governed AITM lifecycle, use test-driven development, and preserve exact branch/worktree authority.

**Goal:** Make `aitm merge-back` land a child whose governed branch is noncanonical without inventing `feature/child/<N>`.

**Architecture:** Extend the existing graph-node adapter to carry the current issue's strict worktree-location record as its own branch/path authority, while retaining #1485's separate parent authority. Validate the CLI-supplied worktree path and its checked-out branch before any mutating Git command. Keep canonical branch fallback only for legacy issues without an own authority marker.

**Tech stack:** Node.js ESM, `node:test`, Git worktrees, GitHub issue graph adapters.

## Task 1: Add failing authority tests

**Files:**

- Modify: `scripts/tests/unit/task-tracker/merge-back.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/lib/epic-tree.test.mjs`

Add unit cases for a custom own branch/path, legacy fallback, malformed or ambiguous own authority, supplied-path mismatch, and actual-branch mismatch. Extend the slow fixture so both parent and child use opaque recorded refs. Run the focused files and retain the expected RED output.

## Task 2: Carry strict own worktree authority

**Files:**

- Modify: `scripts/task-tracker/lib/issue-worktree-location.mjs`
- Modify: `scripts/task-tracker/lib/resolve-epic-lineage.mjs`
- Modify: `scripts/task-tracker/merge-back.mjs`

Expose a strict current-location resolver, derive `authoritativeBranch` and `authoritativeWorktree` from the current issue body, and keep `parentAuthoritativeBranch` independent. Make CLI production wiring fetch each node's own body. Validate the supplied worktree and checked-out branch before opportunistic sync, rebase, test, merge, or cleanup.

## Task 3: Verify and deliver

Run focused unit and slow tests, format, lint, fast/integration/slow suites, and the governed exact-SHA Test gate. Complete Review, Full-Auto approval, provider-gated PR delivery, and close #1601. Then resume #1599's merge-back without adding another blocker.
