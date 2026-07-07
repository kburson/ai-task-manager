---
name: feedback_worktree_seed_templates
description: "Worktree Test runs failing on \"missing .ai-task-manager templates\" are a seed-worktree gap, not a code regression — use seedWorktreeBackfill, never copy files or full-install."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 08658b87-c477-4c15-845c-85276f0a4baf
---

When a `/task test` sandbox (or any git worktree) fails with `STOP - ai-task-manager templates are missing: .ai-task-manager/pickup-directive.md / definition-of-done.md`, the cause is that the worktree was never seeded with the gitignored runtime templates — NOT a code regression in the issue under test.

The repo already has the seeding mechanism: `scripts/task-tracker/seed-worktree.mjs` (`seedWorktreeBackfill`), which `verbs/test.mjs` imports to provision `.ai-task-manager/` into the fresh sandbox worktree.

**Why:** I diagnosed this correctly as environmental twice (in #539's Develop and Test stages) but both times reached for ad-hoc fixes (copy the two template files / `npx ai-task-manager install`) and forgot the dedicated seed script exists. The user called this out: "you messed this up twice for the same reason and forgot both times there is a seed-worktree script."

**How to apply:** On a missing-template failure in a worktree, first run / invoke `seedWorktreeBackfill` (or `node scripts/task-tracker/seed-worktree.mjs`) against the worktree path — do not copy files by hand and do not run a blind full install (which can reset `.ai-task-manager/task-tracker-state.json` and lose the active-task binding/timing). See [[project_worktree_seed_sync_todo]].
