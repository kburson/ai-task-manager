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

Primary script form:

```bash
node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs <verb> [args...]
```

Run task commands from the project root. If an environment must invoke the
script from another directory, set `AI_TASK_MANAGER_PROJECT_DIR` to the project
root before running the command.

## Creating issues

`scripts/gh/create-issue.mjs --shape stub|epic|sub-issue|solo` is the only sanctioned path. **Never call `gh issue create` directly** — bodies authored that way miss the assignee, project tether, fields block, `## Scope`, `- [ ]` Acceptance Criteria, Definition of Done, and Pickup Directive (see issue #103 for the failure mode). The wrapper renders the body from `templates/<shape>-body.md` (override: `.ai-task-manager/<shape>-body.md`) via `preflight-issue.mjs --shape`, runs `gh issue create`, tethers to the project Board, and substitutes `<this-issue-#>` / `<parent-epic-#>` placeholders — atomic.

Required content fragments (default `./.tmp/plan/`): `scope.md`, `acs.md` (must contain `- [ ]` checkboxes), `plan-meta.md`. For sub-issues, also pass `--parent <EPIC_N>`.

### Stub shape — capturing a raw idea at Backlog (#426)

For fast idea-capture, use `--shape stub`: it requires **only** `--title` and takes an optional `--idea-file <path>` whose free text seeds the Scope section. It does **not** require `scope.md` / `acs.md` / `plan-meta.md` — those sections are placeholders the Refine stage fills. Reach for `stub` when capturing a raw idea where the acceptance criteria, scope decomposition, and plan-metadata block do not yet exist and should not be invented; use `solo` when you already have all three worked out. **Do not volunteer `Size` or `Estimate` at Backlog creation** — those are Refine-exit gate fields, not creation-time fields; set them at Refine.

During deep dive, bind every Acceptance Criterion to automated evidence with an
`aitm-verified cmd="…"` HTML comment marker. Every non-standard command named in
those markers must be listed under the issue-specific `### Verification
Commands` section. Standard DoD commands may be used as evidence markers but
must not be duplicated there.

Refusal contracts (deterministic exit codes):

- `assignee-required` — no `--assignee` and no `assignee` in `.ai-task-manager/task-tracker.json`.
- `priority-required-at-groom` — `--status groom|refine|ready` without `--priority`.

Use `--dry-run` to print the rendered body without calling `gh`.

### Never promote untracked background work — offer a tracking issue instead

This is the hard rule: Track before you start. When you notice follow-up or out-of-scope work, **do not** start it without an issue. Do not spawn untracked background sessions with no board state, no estimate, no timing ledger, and no audit trail. That is exactly the untracked work this workflow forbids.

Instead, tell the user what you found and offer to create a GitHub issue to track it: `/task new` (→ `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`). Only after the issue exists and you bind to it does the work begin. If the user explicitly insists on untracked work anyway, name the trade-off before proceeding.

## Field units

The project-board `Estimate` is denominated in **hours**; the timing fields
(`engagedTime`, `sessionTime`, `reviewTime`) are denominated in **minutes**.
The Review delta renderer normalizes both to seconds and displays `H:MM:SS`.
If you read these values directly (board API or `aitm-fields` JSON), **do not
compare them raw** — a 3-hour estimate vs. a 22.5-minute actual is −87%, not
+650%. Internal compute is second-precision; the board still stores rounded
minutes.

## Full-Auto footnote

When `/task approve` runs under `TT_FULL_AUTO=1` (or any signal `detectFullAuto`
fires on), it appends a visible blockquote footnote under the Lifecycle DoD
subsection between `<!-- aitm-full-auto-footnote:start -->` and
`<!-- aitm-full-auto-footnote:end -->` delimiters so a reader can see at a
glance that no human reviewed the issue. The hidden `aitm-full-auto-approved`
marker still records the audit signals. The footnote is idempotent (re-runs
replace the block in place). `gh-edit-guard` protects the delimiters from
accidental drop. If the body lacks a recognized `Passed final human review`
checklist line, approve emits a stderr warning
(`approve: lifecycle-tick-noop`) but does not fail.

## Review Notes → Drivers

`/task approve` posts a `### 📝 Review Notes` comment with bullet drivers before
stamping `aitm-review-approved`. In human-review mode it prompts stdin (one
bullet per line, blank line to finish); under `TT_FULL_AUTO=1` it auto-derives
drivers from misestimate Δ%, sandbox-failure count, develop-stage re-entry, and
oversized commit diffs, tagging the comment `<!-- aitm-review-notes-source: auto -->`.
The close-time `### 📊 Review delta` comment reads the most-recent notes comment
and renders its bullets under a `Drivers:` section; empty drivers omit the
section entirely.

## Sequence rules

**Child sub-issues may not lead the parent epic in state.** `promote <child> <target>` refuses when the parent epic is in a state lower than the child target (the `child-cannot-lead-epic` invariant). Children are **not** required to all reach `refine` before the epic may move to `plan` — that exit-gate requirement was retired. Instead a WIP rule applies: at most one child advances out of Refine per epic at a time (`planRefineWipGate`), where a child parked on a dependency (`aitm-blocked-by` marker) does not count and a blocker may run ahead of the parked sibling it unblocks. No env override exists. See `templates/pickup-directive.md` ("Sequence rules") for the full rule.

## Verb disambiguation — `/task plan` vs `/task discover`

These two verbs target distinct workflows and are NOT interchangeable:

- `/task plan #N` — **Sprint-Planning entry**: promotes `#N` from Refine → Plan. Mirrors `/task refine` / `/task test` / `/task review` (one verb per kanban state). Refuses on any current state other than Refine. Use this to start the Sprint-Planning ceremony (deep-dive analysis, child-story breakdown, estimate revision).
- `/task discover` — **backlog-item generation / pre-issue ideation**: opens an untracked discovery bucket for shaping work that does not yet have a GitHub issue. Promote a bucket to a real issue with `/task new <title>`. No kanban transition occurs.

A historical alias mapped `/task plan` → `/task discover` with a deprecation warning. That alias was removed in #299; the two verbs are now permanently distinct.

## Checkpoint Pause

Before any `/task` state transition (refine/plan/develop/test/review/done), before switching the active issue, before closing, and before parallel-agent fan-out, **pause and re-read the most recent user messages**. If the latest user message is unacknowledged or contains an unaddressed question/instruction, halt and respond first — do not advance state. See the full rule in `templates/pickup-directive.md` ("Checkpoint Pause").

## Project preferences

At session start, read `.ai-task-manager/task-tracker.json#preferences` via `getPreferences()` from `scripts/task-tracker/config.mjs`. Honor each key by name — see `skill/shared/rules/preferences.md` for the table. Key examples: `noPushToOrigin`, `mainThreadOnly`, `driveSubIssuesToReview`, `pauseTimerOnBlockingQuestion`, `noConfirmAfterDeepDive`, `askGatesBeforeParallel`, `formatting.noEmojis`, `formatting.currencyInBackticks`, `scratchDir`.
