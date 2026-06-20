---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.
---

<!-- aitm-skill-version: 0.0.0 -->

# Task For Claude Code

Load and follow the canonical shared task workflow:

`node_modules/ai-task-manager/skill/shared/router.md`

The router is a Tier-1 stub: hard cross-cutting rules + verb → rule-file routing table. Detailed contracts live in `skill/shared/rules/*.md` (Tier-2) and load JIT only when their verb runs.

Claude-specific conventions:

- `/task ...` is the primary user interface through `.claude/commands/task.md`.
- Use executable scripts from `node_modules/ai-task-manager/scripts/`.
- Runtime project state lives in `.ai-task-manager/`; read legacy `.claude/` state only as fallback when the shared file is absent.
- Claude hook settings run direct Node commands from `node_modules/ai-task-manager/scripts/task-tracker/`.
- The status line remains Claude-specific and reads `.ai-task-manager/task-tracker-state.json` with a legacy `.claude/task-tracker-state.json` fallback.

When the shared skill mentions command examples, prefer these package paths:

```bash
node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs <verb> [args...]
node node_modules/ai-task-manager/scripts/gh/move-state.mjs <N> in-progress
```

Run task commands from the project root. If an environment must invoke the
script from another directory, set `AI_TASK_MANAGER_PROJECT_DIR` to the project
root before running the command.

## Creating issues

`scripts/gh/create-issue.mjs --shape stub|epic|sub-issue|solo` is the only sanctioned path. **Never call `gh issue create` directly.** The wrapper renders the body from `templates/<shape>-body.md` (override: `.ai-task-manager/<shape>-body.md`) via `preflight-issue.mjs --shape`, then runs `gh issue create`, tethers to the project Board, and substitutes `<this-issue-#>` / `<parent-epic-#>` placeholders atomically.

Required content fragments (default `./.tmp/plan/`): `scope.md`, `acs.md` (must contain `- [ ]` checkboxes), `plan-meta.md`. For sub-issues, also pass `--parent <EPIC_N>`.

### Stub shape — capturing a raw idea at Backlog (#426)

For fast idea-capture, use `--shape stub`: it requires **only** `--title` and takes an optional `--idea-file <path>` whose free text seeds the Scope section. It does **not** require `scope.md` / `acs.md` / `plan-meta.md` — those sections are placeholders the Refine stage fills. Reach for `stub` when capturing a raw idea where the acceptance criteria, scope decomposition, and plan-metadata block do not yet exist and should not be invented; use `solo` when you already have all three worked out and want to chain straight into `promote`.

**Do not volunteer `Size` or `Estimate` at Backlog creation.** Those are Refine-exit gate fields, not creation-time fields — offering them on a stub (or any freshly-filed Backlog idea) invites premature, low-confidence sizing. Set them at Refine, where the Refine→Plan gate enforces them.

During deep dive, bind every Acceptance Criterion to automated evidence with an
`aitm-verified cmd="…"` HTML comment marker. Every non-standard command named in
those markers must be listed under the issue-specific `### Verification
Commands` section. Standard DoD commands may be used as evidence markers but
must not be duplicated there.

Refusal contracts (deterministic exit codes):

- `assignee-required` — no `--assignee` and no `assignee` in `.ai-task-manager/task-tracker.json`.
- `priority-required-at-groom` — `--status groom|refine|ready` without `--priority`.

Use `--dry-run` to print the rendered body without calling `gh`.

### Never promote a "suggested task" chip — offer a tracking issue instead

This is the Claude-session form of hard rule 12 (Track before you start). When you notice follow-up or out-of-scope work, **do not** surface it as a background-task chip (the session `spawn_task` "suggested task"). A chip kicks off work locally with no issue behind it — no board state, no estimate, no timing ledger, no audit trail. That is exactly the untracked work this workflow forbids.

Instead, tell the user what you found and offer to create a GitHub issue to track it: `/task new` (→ `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`). Only after the issue exists and you bind to it does the work begin. If the user explicitly insists on a chip anyway, name the trade-off (untracked) before proceeding.

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

## Rank rules

**Child sub-issues may not lead the parent epic in state.** `promote <child> <target>` refuses when the parent epic is in a state lower than the child target (the `child-cannot-lead-epic` invariant). Children are **not** required to all reach `refine` before the epic may move to `plan` — that exit-gate requirement was retired. Instead a WIP rule applies: at most one child advances out of Refine per epic at a time (`planRefineWipGate`), where a child parked on a dependency (`aitm-blocked-by` marker) does not count and a blocker may run ahead of the parked sibling it unblocks. No env override exists. See `templates/pickup-directive.md` ("Rank rules") for the full rule.

## Discover workflow — completing a session and promoting to an issue

When the user says "save the plan", "generate the plan", "write up the plan", or similar during an active `/task discover` session:

1. Compose the discovery findings into a markdown file at `.tmp/plan/<draft>.md` using the template at `templates/plan-file.md` (H1 title + `## Scope` required).
2. Run `/task save-plan --from-file .tmp/plan/<draft>.md` — this validates the file, saves it to `docs/plans/YYYYMMDD-<slug>.md`, and stamps `savedPlanFile` into the discover bucket.
3. Confirm the saved path to the user.

When the user then says "create the issue", "new issue", or `/task new` while still in discover state, run `/task new` — it reads `savedPlanFile` from the bucket and uses it as the title source. No arguments are needed in discover state.

To load a previously saved plan file outside of a discover session: `/task new docs/plans/<file>.md`.

## Verb disambiguation — `/task plan` vs `/task discover`

These two verbs target distinct workflows and are NOT interchangeable:

- `/task plan #N` — **Sprint-Planning entry**: promotes `#N` from Refine → Plan. Mirrors `/task refine` / `/task test` / `/task review` (one verb per kanban state). Refuses on any current state other than Refine. Use this to start the Sprint-Planning ceremony (deep-dive analysis, child-story breakdown, estimate revision).
- `/task discover` — **backlog-item generation / pre-issue ideation**: opens an untracked discovery bucket for shaping work that does not yet have a GitHub issue. Promote a bucket to a real issue with `/task new <title>`. No kanban transition occurs.

A historical alias mapped `/task plan` → `/task discover` with a deprecation warning. That alias was removed in #299; the two verbs are now permanently distinct.

## Checkpoint Pause

Before any `/task` state transition (refine/plan/develop/test/review/done), before switching the active issue, before closing, and before parallel-agent fan-out, **pause and re-read the most recent user messages**. If the latest user message is unacknowledged or contains an unaddressed question/instruction, halt and respond first — do not advance state. See the full rule in `templates/pickup-directive.md` ("Checkpoint Pause").

## Project preferences

At session start, read `.ai-task-manager/task-tracker.json#preferences` via `getPreferences()` from `scripts/task-tracker/config.mjs`. Honor each key by name — see `skill/shared/rules/preferences.md` for the table. Key examples: `noPushToOrigin`, `mainThreadOnly`, `driveSubIssuesToReview`, `pauseTimerOnBlockingQuestion`, `noConfirmAfterDeepDive`, `askGatesBeforeParallel`, `formatting.noEmojis`, `formatting.currencyInBackticks`, `scratchDir`.
