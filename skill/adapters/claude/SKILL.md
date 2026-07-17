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
- Invoke support scripts via the `aitm` orchestrator, never by filepath (see below).
- Runtime project state lives in `.ai-task-manager/`; read legacy `.claude/` state only as fallback when the shared file is absent.
- Claude hook settings run direct Node commands from `node_modules/ai-task-manager/scripts/task-tracker/`.
- **Worktree seeding (#869):** in a fresh `git worktree`, `node_modules` may be absent — the skill reads below would fail, or module resolution would silently fall through to the parent checkout. The SessionStart hook runs `scripts/task-tracker/ensure-worktree-seeded.mjs` to inspect and self-heal the `ai-task-manager` self-link before any other hook resolves a `node_modules` path. The reachable `.claude/skills/task/SKILL.md` stub also carries a `## Step 0` self-heal command as a backstop for the case where this packaged copy is itself unreachable.
- The status line remains Claude-specific and reads `.ai-task-manager/task-tracker-state.json` with a legacy `.claude/task-tracker-state.json` fallback.

Command examples run through the `aitm` orchestrator (the form a user types):

```bash
npx aitm <verb> [args...]   # /task verbs (refine, plan, promote, ...)
npx aitm <name> help        # any command self-documents its API
```

`move-state` is internal — drive board state with `npx aitm promote`/`demote`.
Run from the project root, or set `AI_TASK_MANAGER_PROJECT_DIR` first.

## Creating issues

Make issues only through `scripts/gh/create-issue.mjs --shape stub|epic|sub-issue|solo` — never `gh issue create`. The shape menu, required `./.tmp/plan/` fragments, the deterministic refusal contracts (`assignee-required`, `priority-required-at-groom`), binding each Acceptance Criterion to an `aitm-verified cmd="…"` marker listed under `### Verification Commands`, and the never-promote-a-"suggested task"-chip rule all live in `rules/create-issue.md` (loads JIT on `/task new`).

## Review & approve details

Field units (board `Estimate` in hours, timing fields in minutes — normalize
before any comparison), the Full-Auto approve footnote (`TT_FULL_AUTO=1` stamps a
visible "no human reviewed" blockquote plus the hidden `aitm-full-auto-approved`
marker), and the Review-Notes → Drivers comment flow all live in
`rules/review.md` (rule-id `review`, loads JIT on `/task review`).

## Rank rules

The full Rank rules (the `child-cannot-lead-epic` invariant, the Refine WIP gate, and dependency representation) live in `templates/pickup-directive.md` ("Rank rules").

## Discover workflow — completing a session and promoting to an issue

When the user says "save the plan", "generate the plan", "write up the plan", or similar during an active `/task discover` session:

1. Compose the discovery findings into a markdown file at `.tmp/plan/<draft>.md` using the template at `templates/plan-file.md` (H1 title + `## Scope` required).
2. Run `/task save-plan --from-file .tmp/plan/<draft>.md` — this validates the file, saves it to `docs/plans/YYYYMMDD-<slug>.md`, and stamps `savedPlanFile` into the discover bucket.
3. Confirm the saved path to the user.

When the user then says "create the issue", "new issue", or `/task new` while still in discover state, run `/task new` — it reads `savedPlanFile` from the bucket and uses it as the title source. No arguments are needed in discover state.

To load a previously saved plan file outside of a discover session: `/task new docs/plans/<file>.md`.

## Verb disambiguation — `/task plan` vs `/task discover`

`/task plan #N` (Refine → Plan sprint-planning entry, refuses on any other state) and `/task discover` (untracked pre-issue ideation bucket, no kanban move) are permanently distinct verbs — the historical `plan → discover` alias was removed in #299. The full note lives in `shared/router.md`.

## Checkpoint Pause

The Checkpoint Pause rule — re-read the conversation queue before any state transition, active-issue switch, close, or parallel-agent fan-out — lives in `templates/pickup-directive.md` ("Checkpoint Pause").

## Project preferences

Read `.ai-task-manager/task-tracker.json#preferences` via `getPreferences()` (`scripts/task-tracker/config.mjs`) at session start and apply every key. The key table and per-key contracts live in `rules/preferences.md` (rule-id `project-preferences`).
