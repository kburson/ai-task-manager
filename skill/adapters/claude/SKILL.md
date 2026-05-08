---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.
---

# Task For Claude Code

Load and follow the canonical shared task workflow:

`node_modules/ai-task-manager/skill/shared/SKILL.md`

Claude-specific conventions:

- `/task ...` is the primary user interface through `.claude/commands/task.md`.
- Use executable scripts from `node_modules/ai-task-manager/scripts/`.
- Runtime project state lives in `.ai-task-manager/`; read legacy `.claude/` state only as fallback when the shared file is absent.
- Claude hooks are installed at `.claude/hooks/task-tracker.sh` and delegate to `node_modules/ai-task-manager/hooks/task-tracker.sh`.
- The status line remains Claude-specific and reads `.ai-task-manager/task-tracker-state.json` with a legacy `.claude/task-tracker-state.json` fallback.

When the shared skill mentions command examples, prefer these package paths:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
"$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/gh/move-state.mjs" <N> in-progress
```
