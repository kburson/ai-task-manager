# Task Tracker Skill — Design

**Date:** 2026-04-24
**Updated:** 2026-08-07
**Status:** Living — rewritten to describe the current ~50-verb dispatch surface and the 8-state kanban workflow (state machine + guard-registry). The v1 spec this superseded is preserved verbatim in git history.

## Problem

Manually logging session time and context words onto GitHub issues is lossy — sessions get forgotten, work spanning multiple compactions is under-reported, and time gets misattributed when a session touches multiple issues.

## Solution

A project-local AI agent skill that binds the active work session to a specific GitHub issue. Claude Code can invoke it through `/task`; Codex can invoke the same workflow through its `.agents/skills` task skill. Time and context-word deltas are recorded to a single "⏱ Timing Log" comment on that issue, appended on every skill invocation and every supported session hook. GitHub is the source of truth; the skill keeps only a tiny local state file pointing at the active task.

## Vocabulary

The `/task` skill and the underlying `scripts/task-tracker/task-tracker.mjs` CLI
share one dispatch surface — every verb below works as `/task <verb>` (Claude
Code / Codex skill), `node scripts/task-tracker/task-tracker.mjs <verb>`, or
`npx aitm <verb>` (installed alias). This has grown from the ~16-command v1
list to ~50 verb groups as the state machine, evidence model, and discovery
workflow were added. `scripts/task-tracker/verbs/help-data.mjs` (`VERB_REFERENCE`)
is the canonical, self-documenting source — `/task help` prints the topic
index and `/task help <verb>` prints a verb's full reference, including exit
codes and related verbs. The table below mirrors `VERB_REFERENCE`, grouped by
its own `topic` field so a new reader can scan by concern instead of an
alphabetical wall.

`start` and `end` are accepted as aliases for `resume` and `close`; `next` is
an alias for `promote`; `stop`/`switch` are aliases folded into the lifecycle
group below.

### Lifecycle verbs (`topic: lifecycle`) — timing and session binding

| Verb          | Purpose                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `status`      | Show the active task, elapsed time, and words since the last marker.       |
| `#N`          | Start or switch the timer to issue #N (binds it as the active task).       |
| `start`       | Bind to issue #N and start the timer (same path as `/task #N`).            |
| `pause`       | Flush timing and pause the active task; sets the paused flag.              |
| `resume`      | Resume the last paused task, or return to a specific paused/stopped issue. |
| `stop`        | End the current session and unbind the active task.                        |
| `update`      | Checkpoint — flush timing, reset counters, keep the task active.           |
| `words-count` | Print the word count for the current session (agent bookkeeping).          |

### Board verbs (`topic: board`) — state-machine transitions and board metadata

| Verb                | Purpose                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `promote` / `next`  | Advance one forward state (Backlog→Refine→Ready for Planning→Plan→Develop→Test→Review→Done).                                                                             |
| `demote`            | Return one state backward (from Test or Review back to Develop).                                                                                                         |
| `shelve`            | Return Refine or Ready for Planning work to Backlog with immutable refinement history and cleared active refinement evidence.                                            |
| `park`              | Compatibility alias for Shelve; no estimate-preserving Park path remains.                                                                                                |
| `refine`            | Start active refinement from Backlog, or complete current Refine work into Ready for Planning with a current snapshot.                                                   |
| `plan`              | Ready for Planning→Plan (Sprint-Planning entry); distinct from `discover`'s backlog-item generation. Refuses on any other current state.                                 |
| `plan-approve`      | Record plan approval with durable human or Full-Auto provenance (stamps the `aitm-plan-approved` marker Plan→Develop needs).                                             |
| `plan-estimate`     | Converge the detailed human Plan estimate and publish a separate AI forecast.                                                                                            |
| `decompose-check`   | Classify whether a planned issue is atomic or requires decomposition.                                                                                                    |
| `approve`           | Record final review approval (Review→Done gate). In Full-Auto, pair with an audit comment.                                                                               |
| `review`            | Move an issue through Test to Review, flush timing, and pause.                                                                                                           |
| `reject`            | Reject an issue under review (returns it for rework). Reason required.                                                                                                   |
| `test`              | Develop→Test verification — finalizes Develop lint/format evidence, then runs Test-owned commands in an isolated worktree.                                               |
| `reconcile`         | Drift recovery — align recorded state with the live board or restore the saga-verified sentinel.                                                                         |
| `board`             | Read the live Project-board `Status` for an issue (resolved via the bound `projectId` — never a guessed project number).                                                 |
| `epic-reconcile`    | Record that an epic's Acceptance Criteria were reconciled against what its children delivered (stamps the epic-only marker `gateCodeComplete` requires to exit Develop). |
| `pull-next`         | JIT child-pull: promote the next dependency-ready R4P child of an epic (by rank) exactly one edge into Plan.                                                             |
| `close`             | Close the active or specified task (runs the pre-close gate).                                                                                                            |
| `inflate-estimate`  | Adjust Size/Estimate mid-flight and record the change on the board + comment.                                                                                            |
| `kind`              | Set the issue kind, or clear its marker by selecting the default code lane.                                                                                              |
| `block` / `unblock` | Mark #N blocked by one or more other issues (label + board field + body marker) / clear a block.                                                                         |
| `supersede`         | Mark a dead issue as superseded by another and close it out.                                                                                                             |
| `auto`              | Toggle Full-Auto gate overrides for the session (disable plan→dev and/or review→done human gates).                                                                       |

### Evidence & DoD verbs (`topic: evidence`) — proof that gates a checkbox

| Verb               | Purpose                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `ac-stamp`         | Run an AC's declared verifier and stamp its `aitm-ac-evidence` marker (refuses on non-zero exit).   |
| `dod-stamp`        | Run a Functional DoD item's verifier and stamp its `aitm-dod-evidence` marker.                      |
| `check`            | Deprecated alias of `ensureChecked` (no longer toggles) — tick a checkbox if its proof gate passes. |
| `ensureChecked`    | Ensure a checkbox is ticked (idempotent; never unticks). Refuses stampable items without evidence.  |
| `ensureUnchecked`  | Ensure a checkbox is unticked (idempotent; never ticks).                                            |
| `evidence-markers` | Audit or backfill AC evidence markers against the Verification Commands.                            |
| `commit-trace`     | Create or update the canonical commit-trace comment from HEAD.                                      |
| `mirror-deep-dive` | Mirror a deep-dive analysis from an existing comment into the issue body.                           |

### Discovery & backlog verbs (`topic: discovery`) — pre-issue and issue-authoring

| Verb         | Purpose                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `new`        | Create a new issue (via the sanctioned create-issue script) and start tracking it.                                                      |
| `discover`   | Open an untracked discovery bucket for pre-issue ideation / backlog item generation (distinct from `/task plan` Sprint-Planning entry). |
| `save-plan`  | Save a discovery plan markdown to `docs/plans/` and stamp its path into the active bucket.                                              |
| `save-draft` | Autosave the in-progress discovery brainstorm to a tracked draft (safe to repeat).                                                      |
| `cancel`     | Discard the active discovery bucket (no timing recorded).                                                                               |
| `report`     | File a defect/feature report (optionally pre-filled from a machine-readable defect hint).                                               |
| `user-story` | Write the Connextra 3-line User Story onto an issue.                                                                                    |
| `split-plan` | Draft or create sanctioned child issues from numbered plan sections.                                                                    |

### Meta verbs (`topic: meta`) — configuration and cross-cutting tools

| Verb         | Purpose                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| `config`     | List config values, set one, or run the interactive interview.                  |
| `migrate`    | Migrate repo issues into the selected/configured project.                       |
| `fleet`      | Show active tasks across worktrees, or prune stale fleet registrations.         |
| `log`        | Re-compute and write Engaged/Session/Review/Plan for an issue.                  |
| `chore-mode` | Toggle chore-mode so unrelated edits are allowed past the source-edit gate.     |
| `help`       | Show the top-level help, or a full per-verb reference with `/task help <verb>`. |

## Semantics

The lifecycle verbs below (session binding, timing) are detailed here because
they're the highest-traffic surface. Board, evidence, and discovery verb
behavior is documented at the verb's own `VERB_REFERENCE` entry (`/task help
<verb>`) and, for the state-machine transitions specifically, in the
[State Machine](#state-machine) section below — duplicating ~40 verbs' worth
of behavior in prose here would drift out of sync with the code faster than
either canonical source.

### `/task #N`

- If a task is currently active → flush its pending entry to its issue's timing comment (auto-end behavior, controlled by `autoEndOnSwitch` config, default `true`).
- Validate issue #N exists via `gh issue view`.
- Write `start` entry to #N's timing comment: `YYYY-MM-DDTHH:MMZ  start  words=<cumulative>`.
- Update local state: `{ active: "#N", lastEventTs, wordsAtLastEvent, entryStartTs }`.
- Report to user: `Active: #N. Previous: #M ended (+X min, +Y words).`

### `/task new [title]`

- If `/task plan` bucket is active → this is the **promotion path**:
  - Determine title: (a) `[title]` arg if given, (b) first H1 of most recent spec doc if exists, (c) prompt inline with a suggestion pulled from recent conversation.
  - Create issue via the sanctioned wrapper `scripts/gh/create-issue.mjs --shape solo --assignee kburson --label needs-triage` (never raw `gh issue create`).
  - Post plan bucket's accumulated timing (labeled "Planning") as the first block of the new issue's timing comment.
  - Clear plan bucket, switch active to new `#N`.
- If no plan bucket active → straight create + start.
- Follow same auto-end-previous logic as `/task #N`.

### `/task plan`

- Does NOT require a prior `/task end`. Implicitly ends any active task (same semantics as `/task #N`).
- Creates a plan bucket in local state: `{ active: "plan", startedAt, wordsAtStart, entries: [] }`.
- No GitHub activity until `/task new` promotes it.
- If another `/task plan` is called while one is active, the old plan bucket is discarded with a warning.

### `/task start`

- Reads `lastActive` from state. Errors if none.
- Does NOT end any current active task (would be redundant — `start` only makes sense if nothing is active).
- Writes `resume` entry to the issue's timing comment.

### `/task log #N`

- Reads the issue's `⏱ Timing Log` comment and computes `Session`, `Engaged`, `Review`, and `Plan`.
- Writes those values to the GitHub Projects V2 board via `updateProjectV2ItemFieldValue` mutation.
- Field IDs are looked up by name at runtime — no extra config required.
- Called automatically by `/task end`. Run manually for issues closed without the skill active.
- Supports `--dry-run` to print computed values without writing.

### `/task update [message]`

- Flush current entry: compute active minutes, idle minutes, and word delta since last marker; append a row to the timing comment.
- Reset `entryStartTs` and `wordsAtEntryStart` to current values — next measurement starts from this point.
- Accumulates `totalActiveMinutes` in state across checkpoints.
- `message` sets the Description column; defaults to `"checkpoint"`.
- Prints: `Update #N: +X active min, +Y idle min, +Z words. Total: A active min, B words.`

### `/task pause` / `/task end`

- Flush current task's entry: compute minutes since `entryStartTs` and words since `wordsAtLastEvent`, post to the issue's timing comment.
- `pause`: leaves `lastActive` set for future `/task start`.
- `end`: clears `lastActive`. If a plan bucket is active, discards it.

### `/task status`

- Prints active task (or plan bucket or none), elapsed minutes since entry start, words since last marker.
- Also prints `lastActive` if nothing is currently active.

### `/task fleet`

- Reads `.ai-task-manager/task-fleet.json` from the main worktree (located via `git worktree list --porcelain` — first entry is always the main worktree), with legacy `.claude/task-fleet.json` fallback.
- Displays all registered tasks: issue ref, status (`active`|`paused`), branch, and age since `startedAt`.
- If the file is missing or empty: prints `No fleet tasks registered.`
- Read-only from any worktree — only the owning agent writes its own entry.

### `/task config` and `/task config <key> <value>`

- `/task config` → print all effective config values with source annotations (`*` for project-local overrides).
- `/task config <key> <value>` → validate type, write to project-local `.ai-task-manager/task-tracker.json`, echo back the new value.
- Validation:
  - Numeric keys require numeric values.
  - Boolean keys accept `true`/`false`/`1`/`0`/`yes`/`no`.
  - Array keys (like `defaultLabels`) accept comma-separated strings.
  - Known GH field IDs validated with a lightweight `gh api graphql` existence check.
- Unknown keys rejected with the list of valid keys.

## State Machine

Every tracked issue lives in exactly one of eight kanban states, and every
transition between them is gated. This section covers the state-object model,
the guard-registry that enforces it, and the `onEnter` action slot — none of
which existed in the v1 spec above.

### The eight states

```
Backlog → Refine → Ready for Planning → Plan → Develop → Test → Review → Done
```

| State            | Board column       | What happens here                                                                                                      |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `backlog`        | Backlog            | Collection of raw, unvetted backlog items. Assignment is an orthogonal ownership field and may be used to filter work. |
| `refine`         | Refine             | Active WIP that shapes acceptance criteria, estimate, size, priority, labels, and rank.                                |
| `ready-for-plan` | Ready for Planning | Durable parking queue for work with a current refinement snapshot.                                                     |
| `plan`           | Plan               | Short-lived JIT deep dive, estimate refresh, decomposition decision, and plan approval.                                |
| `develop`        | Develop            | Code changes are made and committed against the story, including test automation.                                      |
| `test`           | Test               | Committed source is verified against ACs and automation in an isolated worktree.                                       |
| `review`         | Review             | Story waits for independent review and approval.                                                                       |
| `done`           | Done               | All ACs and Definition of Done are satisfied. Terminal — no exit guards.                                               |

`promote` walks this chain forward one state at a time; `demote` walks Test or
Review back to Develop. `refine`, `park`, `plan`, `plan-approve`, `pull-next`,
and `reconcile` are the other verbs that move or realign an issue's state (see
the Board-verb table above).

### The state-object contract

Each state is a frozen module under `scripts/task-tracker/states/*.mjs`
exporting `{ name, entryGuards, exitGuards, onEnter }`:

```js
// Guard = { id, run(ctx) -> { ok: true } | { ok: false, reason } | Promise<…> }
//   Refuses a transition by returning { ok: false, reason }. May be sync or
//   async (shells out to git/gh). A guard that throws is treated as a refusal
//   whose reason is the stringified error — one buggy guard can't crash the
//   pipeline. Guards do NOT mutate state on success; the only sanctioned
//   side effect is stashing a value on `ctx` for a later guard to read.

// Action = { id, run(ctx) -> void | Promise<void> }
//   Fires AFTER a successful Status write into the target state. Short,
//   idempotent setup hooks only (stamp an entry timestamp, post a pickup
//   directive, write a timing-log row). Actions never refuse a transition —
//   a failure is logged and the transition stands. Re-firing on a later
//   re-entry into the same state must be safe.
```

`scripts/task-tracker/states/index.mjs` re-exports every state as a `STATES`
map keyed by name, plus a `FORWARD_CHAIN` projection (derived from
`lib/lifecycle-policy/`) that `promote` walks. Backward movement is queried
directly from the lifecycle policy package rather than a second hardcoded
chain.

`onEnter` is explicitly **not** for the deep work of a state — refining the
issue body, writing code, running tests, reviewing changes all happen inside
`/task <verb>` sessions that inhabit the state. The verb commands are
inhabitants of states, not parts of the state object. Most `onEnter` lists are
empty; `develop`'s, for example, is `Object.freeze([])` even though its exit
list is not — a state can have real exit-guard teeth with no onEnter work at
all:

```js
// scripts/task-tracker/states/develop.mjs
export default Object.freeze({
  name: 'develop',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  exitGuards: Object.freeze([
    blockedByGuard,
    developExitCodeCompleteGuard,
    developExitSandboxProofGuard,
    developExitCommitTrailHeadGuard,
    developExitEpicChildrenDoneGuard,
    childCannotLeadEpicExitGuard,
  ]),
  onEnter: Object.freeze([]),
});
```

### The guard-registry runtime

Guards are declared per-state (above) but dispatched through a flat runtime
registry, not read directly off the state objects at call time:

```
states/*.mjs                 state-bootstrap.mjs              guard-registry.mjs
(per-state declarations)  →  (registerGuard for each)     →  GUARDS[state].{exit,entry}
                                                                      │
                                                                      ▼
move-state.mjs / promote.mjs / close.mjs / review.mjs  ──calls──►  runGuards(from, to, ctx)
                                                                      │
                                              iterate GUARDS[from].exit, then GUARDS[to].entry
                                                                      │
                                                          aggregate refusals → allow / block
```

- **`lib/guard-registry.mjs`** holds the flat `GUARDS` map. `registerGuard(state,
kind, guard)` is idempotent on `guard.id`. `runGuards(from, to, ctx)` is
  async: it iterates `GUARDS[from].exit` then `GUARDS[to].entry`, awaiting
  each `guard.run(ctx)` and aggregating every refusal (no short-circuit) so a
  single blocked transition reports every reason at once. The module ships
  with an empty registry on import — nothing self-registers.
- **`lib/state-bootstrap.mjs`**'s `bootstrapGuards()` walks `STATES` once and
  feeds the registry from each state's declared `exitGuards`/`entryGuards`.
  Idempotent, so re-importing is safe.
- **Call sites** — `scripts/gh/move-state.mjs` (the single state-mutator; every
  Status write passes through `runGuards`), `verbs/promote.mjs`,
  `verbs/close.mjs`, and `verbs/review.mjs`. There is no transition path that
  skips the registry.

A transition `from → to` runs two ordered slot lists: `GUARDS[from].exit`
("may this issue leave `from`?") and `GUARDS[to].entry` ("may this issue enter
`to`?"). Both lists always run; refusals from either are merged into one
result. `done` has no exit guards — it's terminal. Full registration
procedure and the guard inventory: `docs/guides/guard-architecture.md`.

## Config Schema

File: `.ai-task-manager/task-tracker.json` (project-local) or `~/.ai-task-manager/task-tracker-config.json` (user-global; legacy `~/.claude/task-tracker-config.json` is read as fallback).

Precedence: project-local > user-global > hardcoded defaults.

**User-settable keys** (`/task config <key> <value>` or `~/.ai-task-manager/task-tracker-config.json`):

| Key                    | Type     | Default                                    | Purpose                                                           |
| ---------------------- | -------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `wpm`                  | number   | `180`                                      | Reading speed for context-hours conversion in value reports       |
| `repo`                 | string   | `''`                                       | Repo slug (`owner/repo`) for `gh` commands — required             |
| `assignee`             | string   | `'@me'`                                    | Assignee for issues created via `/task new`                       |
| `defaultLabels`        | string[] | `[]`                                       | Labels applied on `/task new`                                     |
| `autoEndOnSwitch`      | boolean  | `true`                                     | `/task #X` while another active → auto-end previous               |
| `idleThresholdMinutes` | number   | `5`                                        | Gap length (minutes) before time stops counting as active         |
| `recordWallClock`      | boolean  | `true`                                     | Record wall-clock time in addition to active time                 |
| `hookNetworkTimeoutMs` | number   | `2000`                                     | PreCompact GH API timeout before queue-fallback                   |
| `pickupDirective`      | boolean  | `true`                                     | Inject Pickup Directive block into issues created via `/task new` |
| `queuePath`            | string   | `.ai-task-manager/task-tracker-queue.json` | Where failed hook posts get queued                                |
| `statePath`            | string   | `.ai-task-manager/task-tracker-state.json` | Active-task state file                                            |

**Internal keys** (managed by `npx ai-task-manager init` — do not set manually):

| Key                                                                                                                                                                                                                                                                                     | Purpose                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `projectId`                                                                                                                                                                                                                                                                             | GH Projects V2 project node ID           |
| `kanbanFieldId`                                                                                                                                                                                                                                                                         | Kanban single-select field ID            |
| `kanbanOptionBacklog` / `kanbanOptionRefine` / `kanbanOptionReadyForPlan` / `kanbanOptionPlan` / `kanbanOptionDevelop` / `kanbanOptionTest` / `kanbanOptionReview` / `kanbanOptionDone` (canonical config keys; legacy `kanbanOptionAssigned` remains read-compatible during migration) | Kanban option IDs                        |
| `rankFieldId` (legacy config fallback: `sequenceFieldId`)                                                                                                                                                                                                                               | Numeric Rank field ID (fan-out ordering) |
| `priorityFieldId`                                                                                                                                                                                                                                                                       | Priority single-select field ID          |
| `priorityOptionP0` / `P1` / `P2` / `P3`                                                                                                                                                                                                                                                 | Priority option IDs                      |

## State File

Location: `.ai-task-manager/task-tracker-state.json` (gitignored).

```json
{
  "active": "#107",
  "lastActive": "#107",
  "entryStartTs": "2026-04-24T14:02:00Z",
  "wordsAtEntryStart": 82140,
  "planBucket": null
}
```

When a plan bucket is active:

```json
{
  "active": "plan",
  "lastActive": "#107",
  "planBucket": {
    "startedAt": "2026-04-24T14:02:00Z",
    "wordsAtStart": 82140,
    "entries": [
      { "ts": "...", "event": "start", "words": 82140 },
      { "ts": "...", "event": "pre-compact-flush", "deltaWords": 12400, "deltaMin": 45 }
    ]
  }
}
```

## Fleet Registry

Location: `.ai-task-manager/task-fleet.json` in the **main worktree** (gitignored). Legacy `.claude/task-fleet.json` is read as fallback. Written atomically (temp file + rename). Last-write-wins is safe — this is a status display file, not a coordination lock.

```json
{
  "#42": {
    "worktreePath": "/path/to/worktrees/feature-42",
    "branch": "feature/issue-42",
    "startedAt": "2026-04-26T10:00:00.000Z",
    "status": "active"
  },
  "#55": {
    "worktreePath": "/path/to/worktrees/feature-55",
    "branch": "feature/issue-55",
    "startedAt": "2026-04-26T09:30:00.000Z",
    "status": "paused"
  }
}
```

Each agent worktree discovers the main worktree path via `git worktree list --porcelain` (first entry). Falls back to `projectDir` in single-worktree setups — the registry still works, it just lives alongside the state file.

## Timing Comment Structure

Each tracked GH issue gets exactly one comment with a `⏱ Timing Log` heading. The skill locates it by scanning issue comments for that heading; if not found, creates it.

Append-only format. Each row captures a point-in-time measurement; deltas are relative to the previous row's baseline.

```markdown
⏱ Timing Log

| Timestamp         | Event               | Active Min | Idle Min | Δ Words | Word Marker | Description           | Δ Words (full) |
| ----------------- | ------------------- | ---------- | -------- | ------- | ----------- | --------------------- | -------------- |
| 2026-04-24T14:02Z | start               | 0          | 0        | 0       | 8,541       | task opened           | 0              |
| 2026-04-24T14:47Z | pre-compact-flush   | 38         | 7        | 12,400  | 20,941      | context compacted     | 41,900         |
| 2026-04-24T14:48Z | post-compact-resume | 0          | 0        | 0       | 20,941      | resumed after compact | 0              |
| 2026-04-24T15:30Z | update              | 40         | 2        | 6,800   | 27,741      | checkpoint            | 18,300         |
| 2026-04-24T15:30Z | pause               | 4          | 0        | 312     | 28,053      | task paused           | 940            |
| 2026-04-24T16:10Z | resume              | 0          | 0        | 0       | 28,053      | task resumed          | 0              |
| 2026-04-24T16:55Z | end                 | 45         | 3        | 9,200   | 37,253      | task ended            | 24,600         |
```

Column semantics:

- **Active Min** / **Idle Min** — minutes in this window where Claude was engaged vs. idle (gap > `idleThresholdMinutes`). Deltas since the last baseline reset.
- **Δ Words** — the **stay-abreast** word tier and primary metric: monologue + user prose + tool-summary chips (one short chip per tool call — a Bash command's description, or `<tool> <file/path/query>`). Words added since the last baseline reset. This is what a reviewer would read to stay abreast of the session.
- **Word Marker** — absolute stay-abreast word-count position in the session JSONL at the time of this row; useful as a reference point for manual inspection.
- **Description** — human-readable label; free-text for `/task update`, fixed strings for automated events.
- **Δ Words (full)** — the **full-expansion** word tier: everything in **Δ Words** plus the full `tool_use` inputs and full `tool_result` outputs (injected/prompt-injection content filtered out), since the last baseline reset. This column is opt-in — rows emitted by callers that don't supply the full count omit it entirely, so legacy tables stay byte-identical. Always ≥ **Δ Words**; the gap is the weight of tool I/O the stay-abreast tier collapses to chips.

On each event, the skill pulls the current comment, appends a row, and replaces via GraphQL mutation.

When a task review/log/close path flushes timing, the skill updates the Projects V2 fields (`Session`, `Engaged`, `Review`, and `Plan`) with the cumulative totals.

## Hook Behavior

Three hooks, all project-local, all routing directly to `node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs`:

### PreCompact

1. Read state. If no active task (and no plan bucket), exit 0.
2. Count words from marker line to current EOF of session JSONL.
3. Compute minutes since `entryStartTs`.
4. Post `pre-compact-flush` row to active task's timing comment (or append to plan bucket's `entries` array).
5. Update state: `entryStartTs = now`, `wordsAtEntryStart = newCumulative`.
6. On network failure: write the event to `queuePath`, exit 0. Next successful `/task` invocation drains the queue first.

### PostCompact

1. Read state. If no active task (and no plan bucket), exit 0.
2. Marker is reset to the new (shorter) JSONL's EOF by `tally-chat-words.mjs` — reuse existing logic.
3. Post `post-compact-resume` row to the active task's timing comment.

### SessionStart

1. If state shows an active task AND the previous session's JSONL exists on disk:
   - Count any unlogged words from the last marker to previous session's EOF.
   - Post `session-end-recovery` row to the active task's timing comment (covers forgot-to-pause-before-clear case).
2. Reset marker to new session's EOF.
3. Post `session-start` row to active task's timing comment.
4. Also runs the existing `setup-nvm.sh` — merge, don't replace.

All hooks: best-effort. Timeout = `hookNetworkTimeoutMs`. Never block the user.

## Skill loading model

The skill is delivered as a just-in-time loader to minimize context burden. Three tiers:

- **Tier 0 — installed shim** (`.claude/skills/task/SKILL.md`, copied from `skill/SKILL.md`): minimal pointer plus the load-once procedure. Stays in agent context idle. Carries an `<!-- aitm-skill-version: X.Y.Z -->` marker stamped from `package.json#version` so `npm update` forces a reload.
- **Tier 1 — router stub** (`skill/shared/router.md`): the only Tier-1 file loaded on first `/task` invocation. Carries the hard cross-cutting rules, the CLI invocation pattern, the verb → rule-file routing table, and the `gh issue` command policy. Budget ≤1,500 tokens. Emits a single sentinel line `aitm-skill-loaded:router:<version>` on first read.
- **Tier 2 — per-context rule files** (`skill/shared/rules/*.md`): loaded only when the verb that needs them is about to run. Each emits its own sentinel `aitm-skill-loaded:rules/<name>:<version>` on first read; subsequent verbs within the same session find the sentinel and skip the re-read. Routing:

| Verb / situation                                                                    | Rule file                    |
| ----------------------------------------------------------------------------------- | ---------------------------- |
| `/task #N`, `/task resume #N`                                                       | `rules/bind.md`              |
| `/task review`                                                                      | `rules/review.md`            |
| `/task close`                                                                       | `rules/close.md`             |
| `/task promote`, `demote`, `next`, `reconcile`, `plan-approve`, `approve`, `reject` | `rules/state-walk.md`        |
| `/task new` while `active=="plan"`                                                  | `rules/plan-mode-backlog.md` |
| `/task config init`                                                                 | `rules/config-init.md`       |
| Parallel fan-out (≥2 candidate children, any worktree dispatch)                     | `rules/parallel.md`          |
| Session start (preferences detail)                                                  | `rules/preferences.md`       |
| First commit / commit-trail troubleshooting                                         | `rules/commit-trail.md`      |
| Hook-output diagnosis                                                               | `rules/hooks.md`             |

Both Claude and Codex adapters point at the same router; Tier-2 rule files are tool-agnostic. Tool-specific divergence (e.g. how the agent surfaces a `PROMPT_REQUIRED:` line) stays in the adapter `SKILL.md`.

After `/clear` or `/compact`, sentinels are wiped from context and the router reloads on the next `/task` call; only the Tier-2 rule files needed by the next verb reload — unrelated rules stay unloaded. Budget targets (asserted by `scripts/tests/unit/task-tracker/core/measure-context.test.mjs`): idle ≤1,500 tokens, invoked ≤8,000 tokens, active ≤12,000 tokens. Measurement tool: `scripts/task-tracker/measure-context.mjs [--idle | --invoked | --active [N] | --all]`.

## File Layout

The tree below is current as of this rewrite (file counts are direct
`find`/`ls` counts, not estimates). `scripts/task-tracker/` has grown from a
flat 7-file module into a directory-per-concern layout: a `verbs/` package
holding every `/task <verb>` implementation, a `lib/` package holding shared
logic organized into 8 sub-packages, and a `states/` package holding the
state-machine objects described above.

```
.ai-task-manager/
├── task-tracker.json              # Project-local config
├── task-tracker-state.json        # Active state (gitignored)
├── task-tracker-queue.json        # Failed-post queue (gitignored)
├── task-fleet.json                # Multi-agent fleet registry (gitignored, main worktree only)
├── pickup-directive.md
└── definition-of-done.md

.claude/
├── skills/
│   └── task/
│       └── SKILL.md               # Claude adapter stub or symlink
└── settings.json                  # Hook registrations and permissions

scripts/task-tracker/
├── task-tracker.mjs               # Main CLI entry — dispatches to verbs/
├── verify-develop.mjs             # Develop-phase lint+targeted-test gate
├── bash-guard.mjs                 # PreToolUse hook: gh-edit / body-write refusals
├── ...                            # 68 top-level .mjs files total (config, state,
│                                   # fleet-registry, gh-timing-comment, word-counter,
│                                   # queue, and every other single-file concern that
│                                   # hasn't grown large enough to earn its own package)
│
├── verbs/                         # 55 files — one (or a few) per /task <verb>:
│   ├── promote.mjs                #   promote.mjs, demote.mjs, refine.mjs, plan.mjs,
│   ├── demote.mjs                 #   review.mjs, close.mjs, ac-stamp.mjs, dod-stamp.mjs,
│   ├── close.mjs                  #   commit-trace.mjs, plan-estimate.mjs, help-data.mjs
│   ├── review.mjs                 #   (VERB_REFERENCE — canonical verb metadata), ...
│   ├── ac-stamp.mjs
│   ├── dod-stamp.mjs
│   ├── commit-trace.mjs
│   ├── help-data.mjs
│   └── ...                        #   (55 files total)
│
├── lib/                           # 271 files across 8 sub-packages:
│   ├── agent-review/              #   Agent Review Gate: audit-comment matching, tick guards
│   ├── command-surface/           #   shared CLI parsing/dispatch helpers
│   ├── config-init/               #   config scaffolding for `/task config` / init flows
│   ├── estimation/                #   plan-estimate schema + WBS/risk evidence handling
│   ├── github-records/            #   gh API read/write wrappers (issues, projects, comments)
│   ├── lifecycle-policy/          #   FORWARD_CHAIN / backward-move policy consumed by states/
│   ├── move-state/                #   single state-mutator internals (see move-state.mjs)
│   ├── timing-events/             #   timing-log row construction and queue draining
│   ├── issue-body-mutate.mjs      #   mutateIssueBody() — sole sanctioned body-write transaction
│   ├── body-invariants.mjs        #   findLostMarkers() — MarkerLossError guard
│   ├── vc-emit.mjs                #   appendVcCommands() — Verification Commands section writer
│   ├── plan-metadata.mjs          #   upsertPlanMetadataField()
│   ├── deep-dive.mjs              #   ensureDeepDive() — canonical deep-dive authoring helper
│   ├── guard-registry.mjs         #   registerGuard() / runGuards() — flat GUARDS map
│   ├── state-bootstrap.mjs        #   bootstrapGuards() — feeds guard-registry from states/
│   └── ...                        #   (271 files total, most outside the 8 named sub-packages)
│
├── states/                        # 9 files — one per kanban state plus the index:
│   ├── index.mjs                  #   STATES map, FORWARD_CHAIN, Guard/Action contract docs
│   ├── backlog.mjs
│   ├── ready-for-plan.mjs
│   ├── refine.mjs
│   ├── plan.mjs
│   ├── develop.mjs                #   worked example in State Machine section above
│   ├── test.mjs
│   ├── review.mjs
│   └── done.mjs                   #   terminal — no exitGuards
│
├── hooks/                         # PreToolUse/PostToolUse hook implementations
└── tools/                         # standalone maintenance/inspection scripts

scripts/tests/
├── unit/                          # Canonical unit lane
│   ├── task-tracker/              # Example source-relative subsystem subtree
│   └── ...                        # Other package subsystem mirrors
├── integration/                   # Canonical integration lane
│   ├── task-tracker/              # Example source-relative subsystem subtree
│   └── ...                        # Other package subsystem mirrors
├── slow/                          # Canonical slow lane
│   ├── task-tracker/              # Example source-relative subsystem subtree
│   └── ...                        # Other package subsystem mirrors
├── fixtures/                      # Package-level static test fixtures
├── helpers/                       # Package-level shared test helpers
└── tools/                         # Package-level test audits and maintenance tools

scripts/gh/
├── move-state.mjs                 # THE single state-mutator; every Status write goes through it
├── set-rank.mjs                   # Sets the Rank project-board field
├── set-priority.mjs               # Sets Priority [--cascade]
└── ...

scripts/reports/
├── generate-value-report.mjs      # Value/ROI report generator
├── heal-backlog-attribution.mjs   # Maintenance: repair `[#N]` attribution across the backlog
├── value-report-config.json       # Report configuration
└── lib/                           # Report helpers
```

> The v1 design routed word counting through a thin
> `scripts/reports/tally-chat-words.mjs` wrapper. That file has since been deleted
> entirely — its logic now lives solely in
> `scripts/task-tracker/word-counter.mjs`.

## Migration from Current Setup

Current state (must be preserved during migration):

- `.claude/hooks/chat-word-count.sh` → replaced by direct Node task-tracker hook commands
- `.claude/settings.json` PreCompact/PostCompact entries → updated to call `node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs`
- `scripts/reports/tally-chat-words.mjs` → logic extracted to module, script kept as thin wrapper for backward compat
- `scripts/reports/chat-word-tally.json` → kept; `generate-value-report.mjs` still reads it as fallback when no task state exists
- Existing `<session-id>.word-marker` files → read as-is, extended with `task` field on next write

Migration steps (executed during implementation):

1. Add new `scripts/task-tracker/` module files.
2. Refactor `tally-chat-words.mjs` to delegate to `word-counter.mjs`.
3. Add direct Node task-tracker hook registrations.
4. Update `.claude/settings.json` to call the packaged hook handler.
5. Remove `chat-word-count.sh`.
6. Create `.claude/skills/task-tracker/SKILL.md`.
7. Create default `.ai-task-manager/task-tracker.json` with this repo's GH field IDs.
8. Add state/queue file paths to `.gitignore`.
9. Copy this spec to `.claude/skills/task-tracker/DESIGN.md` so the skill ships with its own reference doc. Keep the two files in sync when the spec evolves (future edits should update both — or make `DESIGN.md` a symlink to the spec, decision deferred to the plan).
10. Smoke test: `/task status` returns "no active task"; `/task #107` starts; `/task pause` flushes; verify timing comment on #107.

**Backward compat:** The existing value report (`generate-value-report.mjs`) keeps working. If a closed issue has no timing comment, it falls back to the Projects V2 fields and `--chat-words` argument as before.

## Edge Cases

- **Issue doesn't exist** (`/task #999`) → fail fast with `gh issue view` error before touching state.
- **Network down during hook** → queue the event, drain on next online `/task` call.
- **Two simultaneous `/task` calls** → state file uses lockfile (best-effort `flock`); second call waits or errors.
- **Plan bucket abandoned** (user calls `/task #N` while plan active) → plan timing is discarded with a one-line notice. Not flushed to any issue.
- **`/task end` with no active task** → no-op with informational message.
- **`/task start` with no `lastActive`** → error with suggested alternatives.
- **Word marker missing or corrupt** → reset to current EOF with zero baseline; log a warning.
- **Timing comment grows huge** → cap at 500 rows; roll oldest into a compressed "prior history" block at the top. (Defer to v2 if not hit quickly.)

## Testing Strategy

This section reflects the original v1 plan (no formal test framework, a manual
smoke-test checklist). Both have since been superseded: the repo now runs
`node --test` across the canonical `scripts/tests/{unit,integration,slow}/` lane
roots. Their task-tracker subtrees are
`scripts/tests/{unit,integration,slow}/task-tracker/`; other package subsystems are
nested beside them. The suite runs with `c8` coverage (see
[`guides/test-authoring.md`](./guides/test-authoring.md) for current
conventions). `docs/task-tracker-smoke-test.md` was never created — its
coverage is now the automated test tree instead.

- **Hook dry-run:** hook-handler dry-run mode that prints what it would do without touching GH.

## Backlog Orchestration

Added post-v1. Full details in `skill/SKILL.md` and `README.md`.

### Plan Mode

`/task plan` opens an untracked planning bucket. `/task new <title>` while in plan mode prompts to build a full backlog from a spec document in context. Replying yes triggers end-to-end orchestration — no stopping between issues.

### Label Taxonomy

Two label classes are created automatically:

- `plan:<slug>` — one per master plan, e.g. `plan:nexus-saas`
- Purpose labels: `backend`, `client`, `infrastructure`, `security`, `data`, `test`, `dx` — inferred from each issue's scope and applied at creation

Labels use plain names (no `purpose/` namespace) to keep them short in the GitHub UI.

### Sequencing

Every issue in a spec should include a numeric Rank and explicit dependencies.
Rank orders dependency-ready children; it is not a parallel-wave identifier.
Locally, only one child may occupy Plan, Develop, Test, or Review at a time.

**Rule:** Local epic children run sequentially. Parallel execution is not
authorized until a separately governed cloud-isolation capability explicitly
re-triages and records an approved wave.

### Pickup Directive

Every issue created from a master plan (and optionally single issues when `pickupDirective: true`) gets a structured block injected at creation time:

```markdown
### Definition of Done

<contents of definition-of-done.md>

## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

- [ ] Deep dive complete
```

The block is built by `scripts/task-tracker/preflight-issue.mjs`, which also acts as a gate: it verifies that `.ai-task-manager/templates/pickup-directive.md` and `.ai-task-manager/templates/definition-of-done.md` exist before any issue is created. If either is missing, the skill aborts with a "(re)install the skill" message — no issues are created until the templates are in place.

On first pickup, the agent runs a just-in-time deep dive against the current repo state and appends it to the issue body, including a required dependency map:

```
## Dependency Map
Depends on: #N (reason)   ← or "none"
Blocks: #P (reason)       ← or "none"
```

Full agent instructions live in `.ai-task-manager/templates/pickup-directive.md` — installed per project and editable. The `pickup-directive.md` "Hard Rules" section is the authoritative process contract: Deep Dive must be complete before any code, every DoD/AC item must be individually verified before its checkbox is ticked, and every box must be checked before close.

**Enforcement.** Both `/task close` (in `task-tracker.mjs`) and `move-state.mjs <issue> done` fail-closed when any `- [ ]` remains in the body, or when the body contains a Pickup Directive but the Deep Dive line is unchecked. No env override exists. The GitHub UI (drag a card, delete an issue) is not gated; legitimate abandonment moves through the UI.

### Multi-Agent Orchestration

The active task should always match the work being performed in the current session:

- Dispatching/reviewing/orchestrating → `/task #epic`
- Performing a child issue's work directly (no sub-agent) → `/task #child`
- Return to `/task #epic` the moment work goes to a sub-agent

`/task fleet` shows all active tasks across parallel worktrees.

---

## Out of Scope (v1)

- Plugin packaging / `/task init` / `/task uninstall` (deferred to when sharing with others).
- Non-GitHub backends (GitLab, Linear, Jira).
- Multi-project simultaneous tracking.
- Automatic time-zone conversion for display.
- Web UI / dashboard.
- Timing comment rollup across issues.

## Open Questions

None at spec-approval time. All design questions resolved during brainstorming.

## Success Criteria

1. `/task #107` binds work to issue 107. After 30 min + one compaction + `/task end`, issue 107 has a timing comment with ≥2 rows and correct cumulative total.
2. `generate-value-report.mjs` reads timing-comment totals when present, falls back to Projects V2 fields when absent. No existing report breaks.
3. After `/clear` without `/task pause`, next session's `SessionStart` hook recovers the lost segment from disk and posts it to the still-active issue.
4. `/task config wpm 100` persists across sessions.
5. GH API failure in PreCompact hook does not block compaction; event lands in queue; next `/task status` drains it.
