---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.
---

<!-- aitm-skill-version: 0.0.0 -->

# Task For Claude Code

Load and follow the canonical shared task workflow:

`node_modules/ai-task-manager/skill/shared/SKILL.md`

Claude-specific conventions:

- `/task ...` is the primary user interface through `.claude/commands/task.md`.
- Use executable scripts from `node_modules/ai-task-manager/scripts/`.
- Runtime project state lives in `.ai-task-manager/`; read legacy `.claude/` state only as fallback when the shared file is absent.
- Claude hook settings run direct Node commands from `node_modules/ai-task-manager/scripts/task-tracker/`.
- The status line remains Claude-specific and reads `.ai-task-manager/task-tracker-state.json` with a legacy `.claude/task-tracker-state.json` fallback.

When the shared skill mentions command examples, prefer these package paths:

```bash
node "$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
"$(git rev-parse --show-toplevel)/node_modules/ai-task-manager/scripts/gh/move-state.mjs" <N> in-progress
```

## Creating issues

`scripts/gh/create-issue.mjs --shape epic|sub-issue|solo` is the only sanctioned path. **Never call `gh issue create` directly.** The wrapper renders the body from `templates/<shape>-body.md` (override: `.ai-task-manager/<shape>-body.md`) via `preflight-issue.mjs --shape`, then runs `gh issue create`, tethers to the project Board, and substitutes `<this-issue-#>` / `<parent-epic-#>` placeholders atomically.

Required content fragments (default `./tmp/`): `scope.md`, `acs.md` (must contain `- [ ]` checkboxes), `plan-meta.md`. For sub-issues, also pass `--parent <EPIC_N>`.

During deep dive, bind every Acceptance Criterion to automated evidence with an
`aitm-verified-by` HTML comment marker. Every non-standard command named in
those markers must be listed under the issue-specific `### Verification
Commands` section. Standard DoD commands may be used as evidence markers but
must not be duplicated there.

Refusal contracts (deterministic exit codes):

- `assignee-required` — no `--assignee` and no `assignee` in `.ai-task-manager/task-tracker.json`.
- `priority-required-at-groom` — `--status groom|refine|ready` without `--priority`.

Use `--dry-run` to print the rendered body without calling `gh`.

## Project preferences

At session start, read `.ai-task-manager/task-tracker.json#preferences` via `getPreferences()` from `scripts/task-tracker/config.mjs`. Honor each key by name — see "Project Preferences" in the shared SKILL.md for the table. Key examples: `noPushToOrigin`, `mainThreadOnly`, `driveSubIssuesToReview`, `pauseTimerOnBlockingQuestion`, `noConfirmAfterDeepDive`, `askGatesBeforeParallel`, `formatting.noEmojis`, `formatting.currencyInBackticks`, `scratchDir`.
