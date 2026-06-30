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

After bind succeeds, follow `.ai-task-manager/templates/pickup-directive.md` — but only when the bound issue's kanban state is `plan` or later (`plan`, `develop`, `test`, `review`, `done`). That file is Tier-2 and is JIT-loaded on bind by the same sentinel mechanism (`aitm-skill-loaded:pickup:<version>`).

**Board-state gate (#673).** Pickup Directive's deep-dive/implementation
instructions only make sense once an issue has been through Refine/Plan. If
the CLI prints a `🚧 PICKUP DIRECTIVE DEFERRED — #N (state: <state>)` banner on
bind, the issue is still at `backlog`/`on-deck`/`refine` — do NOT load or
follow the pickup directive. Instead continue the state walk with the verb the
banner names (`/task refine #N` or `/task promote #N`). The gate is computed
by `isPickupDirectiveEligible` (`scripts/task-tracker/lib/pickup-directive-gate.mjs`)
from the session's already-seeded `kanbanState` — no extra state-fetch needed.

The pickup directive enforces:

- Deep-dive checkpoint with `<!-- aitm-deep-dive-complete: <ts> -->` marker before any code edits (Plan state).
- Per-AC verification with `/task ensureChecked "<label>"`, never bulk-checking.
- `aitm-verified-by` HTML comment markers on each AC.

## `{discuss}` brainstorming trigger (#405, #486)

If, on bind, the CLI prints a `💬 DISCUSSION REQUESTED — #N` banner, run an
open-ended brainstorming dialog with the user **before** any deep-dive or refine
step. The request marks a sparse, user-filed item that needs to be fleshed into a
refine-ready definition.

**Chat-delimiter convention (#495).** Mirror the CLI banners in your own chat log
so the session scroll-back reads consistently across both surfaces. When you
pause to open the discussion, emit a blank line then a 💬-led delimiter
(`💬 DISCUSSION REQUESTED — #N`). When agreement is reached and implementation is
about to begin, emit a blank line then a ✅-led delimiter
(`✅ DISCUSSION RESOLVED — #N · implementation may commence`). Use the same two
icons the CLI uses (`DISCUSS_START_ICON` / `DISCUSS_END_ICON` in
`discuss-marker.mjs`); these delimiters are presentation only and never replace
the marker writes below.

**Carrier model (#486).** The signal has two synced carriers: the authoritative
hidden marker `aitm-discuss-requested`, and a visible mirror label (default
**Discuss**, configurable via `task-tracker.json#discussLabel`). On bind,
`reconcileDiscuss` strips any visible `{discuss}` token, ensures one hidden
marker, and syncs the label. The banner and the promotion guard (#473) key on
`isDiscussPending`, so stripping the token never disables the gate. Full
semantics live in `docs/guides/discuss-trigger.md`.

1. Brainstorm purpose, constraints, success criteria one at a time.
2. On resolution, call `finalizeDiscussion({ issueNumber, repo, scope, acs })`
   (`scripts/task-tracker/lib/discuss-marker.mjs`): rewrites `## Scope` (+ optional
   `## Acceptance Criteria`), strips the token and request marker, and stamps a
   hidden `aitm-discussed` marker so the dialog never re-fires. `/task check
"discussion complete"` does the same and also removes the label.
3. Proceed to deep-dive / refine.

## Legacy state recovery

If `.ai-task-manager/task-tracker-state.json` is missing but `.claude/task-tracker-state.json` exists, the CLI reads the legacy path as a one-time fallback. No manual action required; the next state write lands in the new location.

## Issue lifecycle reminders

- **Never call `move-state.mjs done` directly.** Use `/task close` (which the router stub already forbids cross-cuttingly).
- **Never call `gh issue create` directly.** Use `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`.
- **Never call `move-state.mjs <state>` to skip stages.** Always use `/task promote` or `/task next` to advance one step at a time.

## Session recovery

If the session was resumed and there is no active task in `task-tracker-state.json`, re-run `/task #N` to re-register. "I remember which issue I was on" is not a valid substitute — the timer ledger requires the explicit bind.
