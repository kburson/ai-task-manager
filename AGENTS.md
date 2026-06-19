<!-- ai-task-manager:codex-superpowers:start -->

## AI Task Manager: Codex Superpowers Bootstrap

AITM added this this workspace AGENTS.md block to approximate Claude Code Superpowers startup behavior in Codex.

- At the start of a new Codex conversation in this workspace, if the `using-superpowers` skill is available, load it before acting.
- Before planning, debugging, testing, implementing, dispatching agents, using worktrees, finishing a branch, or handling review, check whether a matching Superpowers skill is available and follow it.
- Treat Superpowers skills as optional mirrored Codex skills under `~/.codex/skills`; AITM does not install Superpowers as a package dependency.
- Keep AI Task Manager task workflow instructions separate at `.agents/skills/task/SKILL.md`.

**FORBIDDEN — breaks the issue workflow, must never be done:**

- Never call `gh issue create` directly. Always use `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`. Direct calls skip project tether, `aitm-fields` injection, placeholder substitution, and assignee/priority gates — the resulting issue cannot be closed via the normal workflow.
- Never call `move-state.mjs <N> <state>` directly to jump to an arbitrary kanban state. Always use `/task promote` (or `next`) to advance one step and `/task demote` to step back — they enforce one-step-at-a-time movement and prevent stage-skipping (e.g., jumping from backlog straight to development).
<!-- ai-task-manager:codex-superpowers:end -->
