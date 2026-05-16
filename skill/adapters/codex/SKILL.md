---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user asks to manage a task, start or close issue work, run /task commands, create backlog issues, track active work, log time, update task status, or inspect the active task fleet.
---

# Task For Codex

Load and follow the canonical shared task workflow:

`node_modules/ai-task-manager/skill/shared/router.md`

The router is a Tier-1 stub: hard cross-cutting rules + verb → rule-file routing table. Detailed contracts live in `skill/shared/rules/*.md` (Tier-2) and load JIT only when their verb runs. Rule files are tool-agnostic — any Codex-specific divergence stays in this adapter file.

Codex-specific conventions:

- Treat `/task ...` as a natural-language request unless the environment provides a native slash command. Run the task-tracker script directly when needed.
- Use executable scripts from `node_modules/ai-task-manager/scripts/`.
- Runtime project state lives in `.ai-task-manager/`; read legacy `.claude/` state only as fallback when the shared file is absent.
- Codex repo-local skills are installed under `.agents/skills/task/SKILL.md`.
- Respect Codex sandbox and approval requirements. If a `gh`, `git push`, or networked script fails because credentials or network access are sandboxed, rerun with the required approval instead of bypassing the task workflow.
- Do not assume Claude hooks or `.claude/settings.json` are available unless the project was installed with `--agent claude` or `--agent both`.

Primary script form:

```bash
node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs <verb> [args...]
```

Run task commands from the project root. If an environment must invoke the
script from another directory, set `AI_TASK_MANAGER_PROJECT_DIR` to the project
root before running the command.

## Creating issues

`scripts/gh/create-issue.mjs --shape epic|sub-issue|solo` is the only sanctioned path. **Never call `gh issue create` directly** — bodies authored that way miss the assignee, project tether, fields block, `## Scope`, `- [ ]` Acceptance Criteria, Definition of Done, and Pickup Directive (see issue #103 for the failure mode). The wrapper renders the body from `templates/<shape>-body.md` (override: `.ai-task-manager/<shape>-body.md`) via `preflight-issue.mjs --shape`, runs `gh issue create`, tethers to the project Board, and substitutes `<this-issue-#>` / `<parent-epic-#>` placeholders — atomic.

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

At session start, read `.ai-task-manager/task-tracker.json#preferences` via `getPreferences()` from `scripts/task-tracker/config.mjs`. Honor each key by name — see `skill/shared/rules/preferences.md` for the table. Key examples: `noPushToOrigin`, `mainThreadOnly`, `driveSubIssuesToReview`, `pauseTimerOnBlockingQuestion`, `noConfirmAfterDeepDive`, `askGatesBeforeParallel`, `formatting.noEmojis`, `formatting.currencyInBackticks`, `scratchDir`.
