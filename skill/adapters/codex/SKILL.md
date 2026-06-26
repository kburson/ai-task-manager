---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user asks to manage a task, start or close issue work, run /task commands, create backlog issues, track active work, log time, update task status, or inspect the active task fleet.
---

# Task For Codex

## Load-once sentinel

Installed packages stamp this adapter with `<!-- aitm-skill-version: X.Y.Z -->`.
On load:

1. Read this adapter's marker version.
2. If `aitm-skill-loaded:codex-adapter:<version>` is already present in live context, skip re-reading this adapter.
3. Otherwise read this file fully, follow it, and emit `aitm-skill-loaded:codex-adapter:<version>` once so later task invocations can detect the load.

After `/clear`, `/compact`, or a package update, treat the sentinel as absent and reload.

Load and follow the canonical shared task workflow:

`node_modules/ai-task-manager/skill/shared/router.md`

The router is a Tier-1 stub: hard cross-cutting rules + verb → rule-file routing table. Detailed contracts live in `skill/shared/rules/*.md` (Tier-2) and load JIT only when their verb runs. Rule files are tool-agnostic — any Codex-specific divergence stays in this adapter file.

Codex-specific conventions:

- Treat `/task ...` as a natural-language request unless the environment provides a native slash command. Run the task-tracker script directly when needed.
- Use executable scripts from `node_modules/ai-task-manager/scripts/`.
- Runtime project state lives in `.ai-task-manager/`; read legacy `.claude/` state only as fallback when the shared file is absent.
- Codex repo-local skills are installed under `.agents/skills/task/SKILL.md`.
- Codex hooks are installed under `.codex/hooks.json`; project-local hooks require a trusted project and may need `/hooks` review before they run.
- Respect Codex sandbox and approval requirements. If a `gh`, `git push`, or networked script fails because credentials or network access are sandboxed, rerun with the required approval instead of bypassing the task workflow.
- Do not assume Claude hooks or `.claude/settings.json` are available unless the project was installed with `--agent claude` or `--agent both`.

Primary command form — invoke through the `aitm` orchestrator, never by a
support script's `node_modules/ai-task-manager/scripts/...` filepath:

```bash
npx aitm <verb> [args...]      # /task state-machine verbs
npx aitm <name> help           # any command self-documents its full API
```

Run task commands from the project root. If an environment must invoke the
command from another directory, set `AI_TASK_MANAGER_PROJECT_DIR` to the project
root before running it.

## Shared policy lives in the Tier-2 rule files

Every contract below is tool-agnostic and lives **once** in a shared rule file
(or `templates/pickup-directive.md`). This adapter only points to them — do not
restate their prose here. Each rule file carries an `<!-- aitm-rule-id: … -->`
anchor so a reviewer can name the single authoritative source:

- **Creating issues** (`issue-create`) → `skill/shared/rules/create-issue.md`.
  The shape menu (`stub|epic|sub-issue|solo`), the required `./.tmp/plan/`
  fragments, the deterministic refusal contracts, binding each Acceptance
  Criterion to an `aitm-verified` marker under `### Verification Commands`, and
  the never-promote-untracked-work rule all live there. Loads JIT on `/task new`.
- **Review & approve** (`review`) → `skill/shared/rules/review.md`. Field units
  (board `Estimate` in hours, timing fields in minutes — normalize before any
  comparison), the Full-Auto approve footnote, and the Review-Notes → Drivers
  flow live there. Loads JIT on `/task review`.
- **State movement** (`state-movement`) → `skill/shared/rules/state-walk.md`.
- **Project preferences** (`project-preferences`) →
  `skill/shared/rules/preferences.md`. Read
  `.ai-task-manager/task-tracker.json#preferences` via `getPreferences()`
  (`scripts/task-tracker/config.mjs`) at session start and apply every key.
- **Rank rules** and **Checkpoint Pause** → `templates/pickup-directive.md`
  (items "Rank rules" and "Checkpoint Pause").
- **Verb disambiguation** (`/task plan` vs `/task discover`) →
  `skill/shared/router.md`.
