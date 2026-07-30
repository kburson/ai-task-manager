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

**State Transition Verb Map (8-state model)**

States: `Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done`.

- `/task promote #N` or `/task next #N` — advance one state along the chain when no dedicated stage verb applies.
- `/task refine #N --size <XS|S|M|L|XL> --estimate <hours> --priority <p0|p1|p2> --rank <N> --reason "<text>"` — Backlog/On Deck → Refine with required fields.
- `/task plan #N` — Refine → Plan for Sprint-Planning entry; distinct from `/task discover`.
- `/task plan-approve #N` — records the Plan-approval marker required before Develop.
- `/task test #N` — Develop → Test after implementation verification.
- `/task approve #N --human` — records human approval for the current Review epoch and verified proof; use only after an actual human approval.
- `/task close #N` — Review → Done (refused without current Review authority; historical markers or checked boxes are insufficient).

Test → Review: agent self-report REVIEW_COMPLETE (no CLI verb).
<!-- ai-task-manager:codex-superpowers:end -->
