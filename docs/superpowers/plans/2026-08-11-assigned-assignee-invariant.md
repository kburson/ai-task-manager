# Assigned and Assignee Invariant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a two-way invariant between the Assigned board state and the presence of at least one GitHub assignee without affecting later lifecycle states.

**Architecture:** A pure invariant module supplies strict parsing, drift classification, and the Assigned entry guard. The central mover remains the only Status writer; assignment, creation, and reconcile compose through it and use compensation where GitHub cannot provide a cross-resource transaction.

**Tech Stack:** Node.js ESM, `node:test`, GitHub CLI/GraphQL adapters, AITM state registry and command catalog.

## Global Constraints

- Only Assigned is coupled to assignees; Refine through Done never require assignment or move backward.
- At least one assignee satisfies the invariant.
- Assignee transport and payload failures fail closed.
- Reconcile is dry-run by default and requires `--apply` for writes.
- Local assignment uses configured `assignee` with `@me` fallback.
- All Status changes flow through the central mover.

---

### Task 1: Invariant Policy and Assigned Entry Guard

**Files:**

- Create: `scripts/task-tracker/lib/assigned-assignee-invariant.mjs`
- Modify: `scripts/task-tracker/states/assigned.mjs`
- Modify: `scripts/task-tracker/lib/guard-registry.mjs`
- Modify: `scripts/task-tracker/lib/move-state/guard-execution.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/assigned-assignee-invariant.test.mjs`
- Test: `scripts/task-tracker/tests/unit/core/move-state-assigned.test.mjs`
- Test: `scripts/task-tracker/tests/unit/core/guard-registry.test.mjs`

**Interfaces:**

- Produces: `EXIT_ASSIGNED_REQUIRES_ASSIGNEE`, `parseAssigneeLogins(payload)`, `classifyAssignedAssigneeDrift({state, assignees})`, `resolveAssignmentTarget(cfg)`, and `assignedRequiresAssigneeGuard.run(ctx)`.
- Consumes: guard context `{issueNumber, repo, fromState, toState, deps}` and an injectable `fetchAssignees` adapter.

- [x] Write pure policy tests for empty, one, multiple, malformed, and error responses plus all lifecycle states.
- [x] Run `node --test scripts/task-tracker/tests/unit/lib/assigned-assignee-invariant.test.mjs` and verify RED because the module does not exist.
- [x] Implement strict parsing, narrow drift classification, target fallback, guard reason, and exit code.
- [x] Run the policy tests and verify GREEN.
- [x] Extend mover/registry tests to require no board write and the distinct exit code on Assigned entry refusal.
- [x] Run the mover/registry tests and verify RED before wiring the guard.
- [x] Register the guard and propagate its exit code through the registry/mover refusal result.
- [x] Run the focused mover/registry tests and verify GREEN.

### Task 2: Local Assignment and Create-Issue Coupling

**Files:**

- Create: `scripts/task-tracker/verbs/assign.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/runtime.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/routing.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/worktree-binding-guard.mjs`
- Modify: `scripts/gh/create-issue.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/assign-verb.test.mjs`
- Test: `scripts/task-tracker/tests/unit/gh/create-issue-assignee.test.mjs`

**Interfaces:**

- Produces: `runAssign({issueNumber, login, remove, cfg, deps})` and `verbAssign(rest, cfg, deps)`.
- Consumes: `resolveAssignmentTarget`, strict assignee reads, live Status reads, `gh issue edit` adapters, and central `runMoveState`.

- [x] Write assign tests for configured/fallback target, add-and-move, idempotence, compensation, final-assignee demotion, multi-assignee removal, and later-state removal.
- [x] Run the assign test and verify RED because the verb does not exist.
- [x] Implement `runAssign` with precise mutation ownership and compensation, then add CLI parsing/output.
- [x] Wire the command catalog, dispatcher, help, numeric issue normalization, and worktree guard.
- [x] Run the assign test and command-surface tests and verify GREEN.
- [x] Write create-issue tests asserting explicit assignee selects Assigned tether/entry while omission remains Backlog.
- [x] Run the create-issue test and verify RED against the current hard-coded Backlog behavior.
- [x] Implement assignee-selected entry state in create-issue and run its focused tests GREEN.

### Task 3: Assigned-Invariant Reconcile

**Files:**

- Modify: `scripts/task-tracker/verbs/reconcile.mjs`
- Modify: `scripts/task-tracker/heal-backlog.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/reconcile-assigned-invariant.test.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/reconcile-verb.test.mjs`
- Test: `scripts/task-tracker/tests/unit/core/heal-backlog-assigned-invariant.test.mjs`

**Interfaces:**

- Produces: `runAssignedInvariantReconcile({issueNumber, apply, cfg, deps})`, CLI mode `reconcile assigned-invariant <N> [--apply]`, and `heal-backlog --assigned-invariant [--apply]` project-wide reuse.
- Consumes: `classifyAssignedAssigneeDrift`, strict assignee reads, live state, and central adjacent `runMoveState`.

- [x] Write tests for both violation shapes, compliant states, every later-state exemption, dry-run no writes, apply repairs, failed repairs, and project-wide healer reporting.
- [x] Run reconcile focused tests and verify RED.
- [x] Implement the mode before legacy board/body drift logic, with no ordinary assignee-lock auto-claim on this audit path, then reuse its classifier in the healer's existing enumeration/apply scaffold.
- [x] Add CLI output and help metadata, then run focused reconcile tests GREEN.

### Task 4: Documentation and Surface Coverage

**Files:**

- Modify: `docs/guides/workflow.md`
- Modify: `CLAUDE.md`
- Modify: `skill/shared/rules/state-walk.md`
- Modify: `node_modules/ai-task-manager/skill/shared/rules/state-walk.md` only through the repository self-link
- Create: `scripts/task-tracker/tests/unit/core/assigned-assignee-docs.test.mjs`

**Interfaces:**

- Consumes: public command and exit-code contracts implemented in Tasks 1–3.
- Produces: greppable operator guidance for invariant, assignment, assignee removal, and reconcile.

- [x] Write the documentation contract test and verify RED.
- [x] Update the three authoritative documentation surfaces and command examples.
- [x] Run documentation and command-surface tests GREEN.

### Task 5: Verification, Review, and Governed Test

**Files:**

- Modify only files already listed if verification reveals a #1207 defect.

**Interfaces:**

- Consumes: issue #1207 Verification Commands and AITM evidence stampers.
- Produces: committed implementation, commit-trace receipt, Test-state sandbox receipt, and CODE_COMPLETE handoff.

- [x] Run verification commands `vc:1` through `vc:6` and fix any failures TDD-first.
- [x] Run `npm run lint`, `npm run format:check`, `npm test`, and `npm run test:slow` sequentially.
- [x] Run `git diff --check` and inspect the complete base-to-head diff.
- [x] Perform structured self-review against all eight ACs and repair Critical/Important findings TDD-first.
- [ ] Commit only #1207 files with a `[#1207]` attribution token and run `npx aitm commit-trace 1207`.
- [ ] Run `TT_FULL_AUTO=1 npx aitm test 1207`, verify the sandbox receipt and live Test state, then report CODE_COMPLETE without review, push, merge, close, or cleanup.
