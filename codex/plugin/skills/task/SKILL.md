---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user asks to manage a task, start or close issue work, run /task commands, create backlog issues, track active work, log time, update task status, or inspect the active task fleet.
---

# Task

Load and follow the Codex adapter instructions from the npm package when it is installed:

`node_modules/ai-task-manager/skill/adapters/codex/SKILL.md`

The plugin provides skill discovery. The npm package is still required in the project for executable scripts, templates, and hooks:

```bash
npm install --save-dev ai-task-manager
npx ai-task-manager install --agent codex
```
