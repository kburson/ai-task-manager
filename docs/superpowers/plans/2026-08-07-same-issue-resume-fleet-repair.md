# Same-Issue Resume Fleet Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. No subagent delegation is authorized for this story.

**Goal:** Make an idempotent same-issue resume restore missing fleet workspace evidence without adding timing events.

**Architecture:** Extend only the existing same-issue early-return branch in `verbResume`. Reuse the injected/default fleet registration and branch-resolution boundaries so the behavior is directly testable and remains consistent with fresh binding.

**Tech Stack:** Node.js ESM, `node:test`, AITM fleet registry and session-state modules.

## Global Constraints

- Keep close's workspace-evidence gate fail-closed.
- Do not append a timing row or rewrite session state on same-issue resume.
- Preserve best-effort fleet registration semantics.
- Deliver all #1140 files in exactly one commit based on `c8bbf8eb1c32c27d02408dd345383aea972b1775`.

---

### Task 1: Reconcile fleet evidence on same-issue resume

**Files:**

- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/self-bind-resume.test.mjs`
- Modify: `scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs`
- Create: `docs/superpowers/specs/2026-08-07-same-issue-resume-fleet-repair-design.md`
- Create: `docs/superpowers/plans/2026-08-07-same-issue-resume-fleet-repair.md`

**Interfaces:**

- Consumes: `registerTask(projectDir, issueRef, worktreePath, branch)` and `currentBranch(projectDir)`.
- Produces: an active fleet entry for the invoking worktree whenever `ownBoundIssue(projectDir)` already equals the requested target.

- [ ] **Step 1: Write the failing regression**

Extend the same-issue resume test with injected fleet and branch collaborators.
Assert one registration call receives the project directory as both project and
worktree path, the normalized issue reference, and the injected branch. Assert
the queue/timing collaborators are not invoked.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/core/self-bind-resume.test.mjs
```

Expected: failure because the same-issue early return makes zero registration
calls.

- [ ] **Step 3: Implement the minimal repair**

Read `registerTask` and `currentBranch` from injected context when provided,
falling back to their existing module imports. In the same-issue branch, invoke
registration inside the same best-effort `try/catch` convention used later in
the fresh-bind path, then print `already active` and return.

- [ ] **Step 4: Verify GREEN**

Run the focused test again and expect all assertions to pass, including the
existing timing-idempotency checks.

- [ ] **Step 5: Run repository verification**

Run `npm test`, `npm run test:slow`, `npm run lint`, `npm run format:check`,
`node scripts/dev-env/verify-local-worktree.mjs`, and `git diff --check`.

If the added resume lines move the characterized timing-emitter call sites,
update only their two exact line numbers in
`state-engine-policy-baseline.mjs`; the event expressions and vocabulary remain
unchanged.

- [ ] **Step 6: Commit the story once**

Stage only the five files listed above and commit:

```bash
git commit -m "[#1140] fix(resume): repair missing fleet evidence"
```
