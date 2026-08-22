---
name: task
description: Bind Grok work sessions to GitHub issues and track time, context words, state, and completion workflow.
user-invocable: true
---

# Task For Grok

## Load-once sentinel

Installed packages stamp this adapter with `<!-- aitm-skill-version: X.Y.Z -->`.
On load, emit `aitm-skill-loaded:grok-adapter:<version>` once and skip a repeat
read when that exact sentinel is already present in live context.

Load and follow the canonical shared task workflow:

`node_modules/ai-task-manager/skill/shared/router.md`

Grok-specific host facts:

- The project skill installs at `.grok/skills/task`.
- Project hooks install under `.grok/hooks` and require project trust.
- Use Grok's native `/task` command surface.
- Do not assume `.codex/hooks.json` is loaded.
- `github.merge-pull-request` is `missing-capability` for this adapter. Leave the delivery intent pending unless this adapter later declares an equivalent sanctioned integration; never use a shell fallback.
