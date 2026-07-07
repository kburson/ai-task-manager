---
name: project_worktree_seed_sync_todo
description: Open TODO (deferred 2026-06-24) — fix worktree seed & sync so fresh worktrees reliably get .ai-task-manager runtime templates; current seed-worktree path leaves gaps.
metadata: 
  node_type: memory
  type: project
  originSessionId: 08658b87-c477-4c15-845c-85276f0a4baf
---

Deferred work item (raised 2026-06-24): the git-worktree **seed & sync** path is unreliable — fresh `.claude/worktrees/*` checkouts can be missing the gitignored `.ai-task-manager/` runtime templates (`pickup-directive.md`, `definition-of-done.md`), which makes `/task test` sandbox runs red on `create-issue-gate-compliance.test.mjs` even when the issue's own code is clean.

The intended mechanism is `scripts/task-tracker/seed-worktree.mjs` / `seedWorktreeBackfill` (see [[feedback_worktree_seed_templates]]), but it did not seed those templates in worktree `zealous-cohen-d600c7` during #539. The user decided to stop debugging it inside a worktree and continue #539 from a non-worktree session that already has everything installed: "We will have to go back and solve the worktree seed & sync issue later."

**How to apply:** When picking this up, investigate why `seedWorktreeBackfill` left `pickup-directive.md`/`definition-of-done.md` absent — does it copy `templates/` → `.ai-task-manager/`? Is it invoked at worktree creation or only inside the Test sandbox? File/track it as its own issue. Note #539's code is already merged to trunk (`77b4015`) but #539 itself had not cleared the Test gate when the session moved.
