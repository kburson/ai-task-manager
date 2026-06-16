<!-- aitm-skill-version: 1.0.0 -->

# rules/bind.md

Tier-2 rule file. Loaded JIT on `/task #N` and `/task resume #N`. On first read, emit a single line in your reply:

```
aitm-skill-loaded:rules/bind:1.0.0
```

If the sentinel is already present in context, do not re-read.

## What `/task #N` does

1. Starts the timer for issue `#N` and registers it as the active task in `.ai-task-manager/task-tracker-state.json`.
2. Flips the issue's Project Board status to `in-progress` (the modern slug equivalent depends on the issue's current state — promote walks one step at a time).
3. Appends a `start` row to the issue's ⏱ Timing Log comment.
4. Emits the `aitm-bound:#N` sentinel so downstream verbs can find the active task.

## Pre-bind invariants

- **Timer must not already be running on a different issue.** If it is, pause first: `/task pause "switching to #N"`.
- **Workspace check.** If `WORKSPACE: MAIN` appears in the SessionStart hook output and the work is parallel fan-out scope, create a worktree first (see `rules/parallel.md`). Solo / sequential edits on trunk are fine in MAIN.
- **Drift check.** If `task-tracker.mjs` reports drift between board state and recorded state, run `task-tracker.mjs reconcile <accept-live|revert-to-recorded> #N` before continuing.

## Pickup directive

After bind succeeds, follow `.ai-task-manager/pickup-directive.md`. That file is Tier-2 and is JIT-loaded on bind by the same sentinel mechanism (`aitm-skill-loaded:pickup:<version>`).

The pickup directive enforces:

- Deep-dive checkpoint with `<!-- aitm-deep-dive-complete: <ts> -->` marker before any code edits (Plan state).
- Per-AC verification with `/task check "<label>"`, never bulk-checking.
- `aitm-verified-by` HTML comment markers on each AC.

## `{discuss}` brainstorming trigger (#405)

If, on bind, the CLI prints a `DISCUSS REQUESTED — #N` banner (the issue body
carries a visible `{discuss}` token and has not yet been discussed), run an
open-ended brainstorming dialog with the user **before** any deep-dive or refine
step. The token marks a sparse, user-filed request that needs to be fleshed into
a refine-ready definition.

1. Brainstorm: clarify purpose, constraints, and success criteria one question at
   a time (see the brainstorming skill if available).
2. On resolution, call `finalizeDiscussion({ issueNumber, repo, scope, acs })`
   from `scripts/task-tracker/lib/discuss-marker.mjs`. It rewrites `## Scope`
   (and optional preliminary `## Acceptance Criteria` from `acs`), strips the
   `{discuss}` token, and stamps a hidden `aitm-discussed` audit marker so the
   dialog does not re-fire — all in one `mutateIssueBody` transaction.
3. Then proceed to deep-dive / refine as normal.

Detection keys on the visible token, not the audit marker: deliberately
re-adding `{discuss}` after a prior discussion re-triggers the dialog.

## Legacy state recovery

If `.ai-task-manager/task-tracker-state.json` is missing but `.claude/task-tracker-state.json` exists, the CLI reads the legacy path as a one-time fallback. No manual action required; the next state write lands in the new location.

## Issue lifecycle reminders

- **Never call `move-state.mjs done` directly.** Use `/task close` (which the router stub already forbids cross-cuttingly).
- **Never call `gh issue create` directly.** Use `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`.
- **Never call `move-state.mjs <state>` to skip stages.** Always use `/task promote` or `/task next` to advance one step at a time.

## Session recovery

If the session was resumed and there is no active task in `task-tracker-state.json`, re-run `/task #N` to re-register. "I remember which issue I was on" is not a valid substitute — the timer ledger requires the explicit bind.
