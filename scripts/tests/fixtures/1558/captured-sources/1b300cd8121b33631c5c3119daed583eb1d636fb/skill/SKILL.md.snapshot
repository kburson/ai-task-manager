---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow.
---

<!-- aitm-skill-version: 1.0.0 -->

# Task

This legacy entrypoint is kept for compatibility. Load and follow:

`skill/shared/router.md`

Agent-specific installers use:

- Claude Code: `skill/adapters/claude/SKILL.md`
- Codex: `skill/adapters/codex/SKILL.md`

## Load-Once Contract

Frequently-loaded skill detail files carry a `<!-- aitm-skill-version: X.Y.Z -->` marker stamped at install time from `package.json#version`. The installed shim (`.claude/skills/task/SKILL.md`) instructs the agent to read just the marker, grep its context for `aitm-skill-loaded:<id>:<version>`, and skip a full re-read when the sentinel is present. After `/clear`, `/compact`, or `npm update ai-task-manager`, the sentinel/marker mismatches and a reload happens automatically. v1 is text-instruction only; no hook enforcement.
