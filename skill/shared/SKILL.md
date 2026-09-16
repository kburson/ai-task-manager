---
name: task
description: Bind work sessions to GitHub issues and track time + context words per issue. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, review, close, log, check, fleet, or config.
---

<!-- aitm-skill-version: 1.0.0 -->

# Task (legacy entrypoint)

This path is retained as a redirect for installations that still point at `shared/SKILL.md`. The canonical Tier-1 router is now:

`node_modules/@kburson/ai-task-manager/skill/shared/router.md`

Only in an AITM source checkout, when the scoped package is absent, load
`skill/shared/router.md` from that checkout instead. Installed consumer projects
use the scoped path and require no dogfood self-link or worktree seeding.

Load and follow the router. Detailed verb contracts live in `skill/shared/rules/*.md` (Tier-2) and load JIT.
