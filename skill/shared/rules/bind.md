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

## `{discuss}` brainstorming trigger (#405, #486)

If, on bind, the CLI prints a `DISCUSS REQUESTED — #N` banner, run an open-ended
brainstorming dialog with the user **before** any deep-dive or refine step. The
request marks a sparse, user-filed item that needs to be fleshed into a
refine-ready definition.

**Carrier model (#486).** The "needs pre-implementation discussion" signal has
two carriers that bind keeps in sync:

- a hidden, durable body marker `aitm-discuss-requested` — the authoritative
  state that travels with the issue body, and
- a visible project label (default **Discuss**, configurable via
  `task-tracker.json#discussLabel`) — its mirror on boards and tables.

There are three entry affordances, all converging to the same resting state on
first reference (bind, or a `heal-backlog` sweep): typing the visible `{discuss}`
token into the body, clicking the **Discuss** label, or AITM stamping at
creation. On bind, `reconcileDiscuss` **converges** the body — strips the visible
`{discuss}` token and ensures exactly one hidden `aitm-discuss-requested` marker
— and syncs the label to the pending state, in one pass. The banner and the
blocking promotion guard (#473) both key on `isDiscussPending` (token **or**
request marker, not-yet-discussed), so stripping the visible token never silently
disables the gate.

1. Brainstorm: clarify purpose, constraints, and success criteria one question at
   a time (see the brainstorming skill if available).
2. On resolution, call `finalizeDiscussion({ issueNumber, repo, scope, acs })`
   from `scripts/task-tracker/lib/discuss-marker.mjs`. It rewrites `## Scope`
   (and optional preliminary `## Acceptance Criteria` from `acs`), strips the
   `{discuss}` token **and** the `aitm-discuss-requested` marker, and stamps a
   hidden `aitm-discussed` audit marker so the dialog does not re-fire — all in
   one `mutateIssueBody` transaction. Equivalently, `/task check "discussion
complete"` resolves it and additionally removes the visible label.
3. Then proceed to deep-dive / refine as normal.

Re-adding `{discuss}` after a prior discussion does **not** re-trigger: once
`aitm-discussed` is stamped, `isDiscussPending` short-circuits to false and
convergence is a no-op (completed issues never re-acquire a request marker).

**v1 limitation — no label-based cancel.** The label is a pure mirror of the
marker. Removing the **Discuss** label by hand does not cancel a pending request;
the next bind/sweep re-adds it from the surviving `aitm-discuss-requested`
marker. Cancellation is only via completing the discussion. Label-based cancel is
an explicit v1 non-goal.

## Legacy state recovery

If `.ai-task-manager/task-tracker-state.json` is missing but `.claude/task-tracker-state.json` exists, the CLI reads the legacy path as a one-time fallback. No manual action required; the next state write lands in the new location.

## Issue lifecycle reminders

- **Never call `move-state.mjs done` directly.** Use `/task close` (which the router stub already forbids cross-cuttingly).
- **Never call `gh issue create` directly.** Use `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`.
- **Never call `move-state.mjs <state>` to skip stages.** Always use `/task promote` or `/task next` to advance one step at a time.

## Session recovery

If the session was resumed and there is no active task in `task-tracker-state.json`, re-run `/task #N` to re-register. "I remember which issue I was on" is not a valid substitute — the timer ledger requires the explicit bind.
