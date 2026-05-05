---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user asks to manage a task, start or close issue work, run /task commands, create backlog issues, track active work, log time, update task status, or inspect the active task fleet.
---

# Task For Codex

Load and follow the canonical shared task workflow:

`node_modules/ai-task-manager/skill/shared/SKILL.md`

Codex-specific conventions:

- Treat `/task ...` as a natural-language request unless the environment provides a native slash command. Run the task-tracker script directly when needed.
- Use executable scripts from `node_modules/ai-task-manager/scripts/`.
- Runtime project state lives in `.ai-task-manager/`; read legacy `.claude/` state only as fallback when the shared file is absent.
- Codex repo-local skills are installed under `.agents/skills/task/SKILL.md`.
- Respect Codex sandbox and approval requirements. If a `gh`, `git push`, or networked script fails because credentials or network access are sandboxed, rerun with the required approval instead of bypassing the task workflow.
- Do not assume Claude hooks or `.claude/settings.json` are available unless the project was installed with `--agent claude` or `--agent both`.

Primary script form:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
```
