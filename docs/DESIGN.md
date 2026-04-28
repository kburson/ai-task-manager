# Task Tracker Skill — Design

**Date:** 2026-04-24
**Updated:** 2026-04-28
**Status:** Released

## Problem

Manually logging session time and context words onto GitHub issues is lossy — sessions get forgotten, work spanning multiple compactions is under-reported, and time gets misattributed when a session touches multiple issues.

## Solution

A project-local Claude Code skill (`/task`) that binds the active work session to a specific GitHub issue. Time and context-word deltas are recorded to a single "⏱ Timing Log" comment on that issue, appended on every skill invocation and every compaction hook. GitHub is the source of truth; the skill keeps only a tiny local state file pointing at the active task.

## Vocabulary

```
/task                   Print active task, elapsed, words since last marker
/task #N                Work on existing issue #N
/task new [title]       Create a new issue and start working on it
/task plan              Open an untracked planning bucket (no issue yet)
/task resume            Resume the last paused task (no body reload)
/task resume #N         Switch back to a paused task and display its body
/task pause             Soft-stop — flushes timing, keeps task as "last active"
/task update [message]  Checkpoint — flush timing, reset counters, keep task active
/task close             Hard-stop — flush, update board fields, move to Done
/task close --force     Close even if unchecked Definition of Done items remain
/task log #N            Re-compute and write Actual Session Time + Context Length to GitHub Projects
/task check "<label>"   Toggle a checkbox in the active issue body (exact label match)
/task fleet             Show all active tasks across parallel agent worktrees
/task config            List all config values with sources
/task config <key> <value>   Set a config value (project-local)
/task config init       Interactive interview — review and set all config values
/task help              Print command reference
```

`start` and `end` are accepted as aliases for `resume` and `close`.

## Semantics

### `/task #N`
- If a task is currently active → flush its pending entry to its issue's timing comment (auto-end behavior, controlled by `autoEndOnSwitch` config, default `true`).
- Validate issue #N exists via `gh issue view`.
- Write `start` entry to #N's timing comment: `YYYY-MM-DDTHH:MMZ  start  words=<cumulative>`.
- Update local state: `{ active: "#N", lastEventTs, wordsAtLastEvent, entryStartTs }`.
- Report to user: `Active: #N. Previous: #M ended (+X min, +Y words).`

### `/task new [title]`
- If `/task plan` bucket is active → this is the **promotion path**:
  - Determine title: (a) `[title]` arg if given, (b) first H1 of most recent spec doc if exists, (c) prompt inline with a suggestion pulled from recent conversation.
  - Create issue via `gh issue create --assignee kburson --label needs-triage`.
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
- Reads the issue's `⏱ Timing Log` comment, sums all `Active Min` deltas for `Actual Session Time`, takes the last `Word Marker` for `Context Length`.
- Writes both to the GitHub Projects V2 board via `updateProjectV2ItemFieldValue` mutation.
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
- Reads `.claude/task-fleet.json` from the main worktree (located via `git worktree list --porcelain` — first entry is always the main worktree).
- Displays all registered tasks: issue ref, status (`active`|`paused`), branch, and age since `startedAt`.
- If the file is missing or empty: prints `No fleet tasks registered.`
- Read-only from any worktree — only the owning agent writes its own entry.

### `/task config` and `/task config <key> <value>`
- `/task config` → print all effective config values with source annotations (`*` for project-local overrides).
- `/task config <key> <value>` → validate type, write to project-local `.claude/task-tracker.json`, echo back the new value.
- Validation:
  - Numeric keys require numeric values.
  - Boolean keys accept `true`/`false`/`1`/`0`/`yes`/`no`.
  - Array keys (like `defaultLabels`) accept comma-separated strings.
  - Known GH field IDs validated with a lightweight `gh api graphql` existence check.
- Unknown keys rejected with the list of valid keys.

## Config Schema

File: `.claude/task-tracker.json` (project-local) or `~/.claude/task-tracker-config.json` (user-global).

Precedence: project-local > user-global > hardcoded defaults.

**User-settable keys** (`/task config <key> <value>` or `~/.claude/task-tracker-config.json`):

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `wpm` | number | `180` | Reading speed for context-hours conversion in value reports |
| `repo` | string | `''` | Repo slug (`owner/repo`) for `gh` commands — required |
| `assignee` | string | `'@me'` | Assignee for issues created via `/task new` |
| `defaultLabels` | string[] | `[]` | Labels applied on `/task new` |
| `autoEndOnSwitch` | boolean | `true` | `/task #X` while another active → auto-end previous |
| `idleThresholdMinutes` | number | `5` | Gap length (minutes) before time stops counting as active |
| `recordWallClock` | boolean | `true` | Record wall-clock time in addition to active time |
| `hookNetworkTimeoutMs` | number | `2000` | PreCompact GH API timeout before queue-fallback |
| `pickupDirective` | boolean | `true` | Inject Pickup Directive block into issues created via `/task new` |
| `queuePath` | string | `.claude/task-tracker-queue.json` | Where failed hook posts get queued |
| `statePath` | string | `.claude/task-tracker-state.json` | Active-task state file |

**Internal keys** (managed by `npx claude-gh-task-manager init` — do not set manually):

| Key | Purpose |
|-----|---------|
| `projectId` | GH Projects V2 project node ID |
| `kanbanFieldId` | Kanban single-select field ID |
| `kanbanOptionBacklog` / `Ready` / `InProgress` / `InReview` / `Done` | Kanban option IDs |
| `sequenceFieldId` | Numeric Sequence field ID (fan-out ordering) |
| `priorityFieldId` | Priority single-select field ID |
| `priorityOptionP0` / `P1` / `P2` | Priority option IDs |

## State File

Location: `.claude/task-tracker-state.json` (gitignored).

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

Location: `.claude/task-fleet.json` in the **main worktree** (gitignored). Written atomically (temp file + rename). Last-write-wins is safe — this is a status display file, not a coordination lock.

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

| Timestamp | Event | Active Min | Idle Min | Δ Words | Word Marker | Description |
|---|---|---|---|---|---|---|
| 2026-04-24T14:02Z | start | 0 | 0 | 0 | 8,541 | task opened |
| 2026-04-24T14:47Z | pre-compact-flush | 38 | 7 | 12,400 | 20,941 | context compacted |
| 2026-04-24T14:48Z | post-compact-resume | 0 | 0 | 0 | 20,941 | resumed after compact |
| 2026-04-24T15:30Z | update | 40 | 2 | 6,800 | 27,741 | checkpoint |
| 2026-04-24T15:30Z | pause | 4 | 0 | 312 | 28,053 | task paused |
| 2026-04-24T16:10Z | resume | 0 | 0 | 0 | 28,053 | task resumed |
| 2026-04-24T16:55Z | end | 45 | 3 | 9,200 | 37,253 | task ended |
```

Column semantics:
- **Active Min** / **Idle Min** — minutes in this window where Claude was engaged vs. idle (gap > `idleThresholdMinutes`). Deltas since the last baseline reset.
- **Δ Words** — context words added since the last baseline reset.
- **Word Marker** — absolute word-count position in the session JSONL at the time of this row; useful as a reference point for manual inspection.
- **Description** — human-readable label; free-text for `/task update`, fixed strings for automated events.

On each event, the skill pulls the current comment, appends a row, and replaces via GraphQL mutation.

When a task `end` fires, the skill also updates the Projects V2 fields (`Actual Session Time`, `Context Length`, `Actual Hours`) with the cumulative total.

## Hook Behavior

Three hooks, all project-local, all routing through `.claude/hooks/task-tracker.sh`:

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

## File Layout

```
.claude/
├── skills/
│   └── task-tracker/
│       ├── SKILL.md               # Skill definition + command routing
│       └── DESIGN.md               # Copy of this spec — kept with the skill for long-term reference
├── hooks/
│   ├── task-tracker.sh            # Dispatches to lib based on event
│   ├── setup-nvm.sh               # (existing, unchanged)
│   └── chat-word-count.sh         # REMOVED — logic absorbed into task-tracker
├── task-tracker.json              # Project-local config (gitignored initially; committed once stable)
├── task-tracker-state.json        # Active state (gitignored)
├── task-tracker-queue.json        # Failed-post queue (gitignored)
└── task-fleet.json                # Multi-agent fleet registry (gitignored, main worktree only)

scripts/task-tracker/
├── task-tracker.mjs               # Main CLI entry — handles /task verbs
├── gh-timing-comment.mjs          # GH API: locate/create/append/edit timing comment
├── fleet-registry.mjs             # Fleet registry read/write for multi-agent worktrees
├── state.mjs                      # Load/save state file with validation
├── config.mjs                     # Load/merge config with precedence
├── queue.mjs                      # Queue drain logic for offline events
└── word-counter.mjs               # Reuses tally-chat-words.mjs logic (refactored into module)

scripts/reports/
├── tally-chat-words.mjs           # KEPT — refactored to import from scripts/task-tracker/word-counter.mjs
├── generate-value-report.mjs      # (existing, unchanged)
└── value-report-config.json       # (existing, unchanged)
```

## Migration from Current Setup

Current state (must be preserved during migration):
- `.claude/hooks/chat-word-count.sh` → replaced by `task-tracker.sh`
- `.claude/settings.json` PreCompact/PostCompact entries → updated to call `task-tracker.sh`
- `scripts/reports/tally-chat-words.mjs` → logic extracted to module, script kept as thin wrapper for backward compat
- `scripts/reports/chat-word-tally.json` → kept; `generate-value-report.mjs` still reads it as fallback when no task state exists
- Existing `<session-id>.word-marker` files → read as-is, extended with `task` field on next write

Migration steps (executed during implementation):
1. Add new `scripts/task-tracker/` module files.
2. Refactor `tally-chat-words.mjs` to delegate to `word-counter.mjs`.
3. Add `task-tracker.sh` hook.
4. Update `.claude/settings.json` to call new hook.
5. Remove `chat-word-count.sh`.
6. Create `.claude/skills/task-tracker/SKILL.md`.
7. Create default `.claude/task-tracker.json` with this repo's GH field IDs.
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

No formal test framework in this repo — follow project conventions:
- **Unit-ish:** small `.mjs` scripts under `scripts/task-tracker/tests/` invoked via `node <file>` that exercise state/config/queue modules with temp files.
- **Integration:** a manual smoke-test checklist in `docs/task-tracker-smoke-test.md` covering all 10 command patterns + the 3 hooks.
- **Hook dry-run:** `task-tracker.sh --dry-run` mode that prints what it would do without touching GH.

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

Every issue in a spec should include `**Sequence:** N`. Issues with the same number can be fanned out in parallel; higher-sequence issues are blocked until all lower-sequence issues in the same epic close. The value is written to the `sequenceFieldId` numeric field on the GitHub Projects board, making fan-out order machine-readable.

**Rule:** Once an epic is in progress, all parallel work runs within that epic's sub-issues. No cross-epic fan-out until the active epic closes.

### Pickup Directive

Every issue created from a master plan (and optionally single issues when `pickupDirective: true`) gets a structured block injected at creation time:

```markdown
## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
<contents of definition-of-done.md>
```

On first pickup, the agent runs a just-in-time deep dive against the current repo state and appends it to the issue body, including a required dependency map:

```
## Dependency Map
Depends on: #N (reason)   ← or "none"
Blocks: #P (reason)       ← or "none"
```

Full agent instructions live in `.claude/task-tracker/pickup-directive.md` — installed per project and editable.

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
