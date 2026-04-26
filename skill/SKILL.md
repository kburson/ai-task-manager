---
name: task
description: Bind work sessions to GitHub issues and track time + context words per issue. Use when the user types /task with no args or followed by #N, new, plan, start, pause, update, end, or config.
---

# Task Tracker

Per-issue time and context-word tracking. Writes to a "⏱ Timing Log" comment on the target GitHub issue; keeps minimal local state in `.claude/task-tracker-state.json`.

**Full design:** `.claude/skills/task/DESIGN.md`

## When Invoked

The user types one of these commands. For `/task #N`, always fetch and display the issue after tracking is activated. For other commands, just invoke the CLI:

| Command | Action |
|---|---|
| `/task` | **Default (no args)** — print active task, elapsed, words since last marker; equivalent to the old `status` verb |
| `/task #N` | **Start/switch to issue #N AND display its details.** Invoke CLI, then fetch issue with `gh issue view` and present the title + body to Claude. |
| `/task new [title]` | Create a new issue and start working on it; promotes any active plan bucket |
| `/task plan` | Open an untracked planning bucket |
| `/task start` | Resume the last active task |
| `/task pause` | Soft-stop — flush timing, keep last-active. **Run before closing Claude Code, running `/clear`, or switching sessions** to preserve the current timing window. |
| `/task update [message]` | Checkpoint — flush timing and reset counters, keep task active. Optional message becomes the row description (default: "checkpoint") |
| `/task end` | Hard-stop — flush timing, clear last-active, write totals to GitHub Projects board |
| `/task log #N` | Re-compute and write Actual Session Time + Context Length for any issue (use when closed without the skill active) |
| `/task check "<label>"` | Toggle checkbox `<label>` in the active issue body — checks if unchecked, unchecks if checked (exact match) |
| `/task config` | List all config values |
| `/task config <key> <value>` | Set a config value (project-local) |

## Implementation

### Step 1: Run the CLI
Via Bash, invoke:
```bash
node "$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
```
Print the command's stdout to the user verbatim. If it exits non-zero, print stderr and surface the error.

### Step 2: For `/task #N` only — ensure issue states are correct

After the CLI succeeds, perform these state checks **before** displaying the issue.

#### 2a. Fetch full issue metadata
```bash
gh issue view <issue-number> --json title,body,state,projectItems,parent
```

#### 2b. Ensure the sub-task is open and in-progress

If the issue is **closed**, reopen it:
```bash
gh issue reopen <issue-number>
```

Move it to "in-progress" on the Kanban board:
```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <issue-number> in-progress
```

#### 2c. If this issue is a sub-issue, ensure the parent is open and in-progress

Check whether the issue has a parent. The `gh` CLI doesn't expose parent directly, so query via GraphQL.
First, read the configured repo from `.claude/task-tracker.json` (key: `repo`, format: `owner/repo`), then split on `/` to get owner and repo name:

```bash
gh api graphql -f query='
  query($owner:String!,$repo:String!,$number:Int!) {
    repository(owner:$owner, name:$repo) {
      issue(number:$number) {
        parent { number state title }
      }
    }
  }
' -f owner=<owner> -f repo=<repo> -F number=<issue-number>
```

If a parent exists and is **closed**, reopen it and move to in-progress:
```bash
gh issue reopen <parent-number>
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <parent-number> in-progress
```

If a parent exists and is open but **not** in-progress (board state is `backlog` or `ready`), move it:
```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <parent-number> in-progress
```

Report any state changes made (e.g., "Opened parent #110 and moved to in-progress").  
Skip silently if both issue and parent are already open and in-progress.

#### 2d. Display the issue
```bash
gh issue view <issue-number> --json title,body,state
```

Parse the JSON output and display:
- **Issue title** (h2 heading)
- **Issue description** (full body text)
- **Current state** (closed/open)

This tells Claude what work needs to be done on that issue. Format it clearly so it's easy to read and understand the work scope.

### Step 3: For all other commands
Just invoke the CLI and print its output — don't fetch issue details.

## Validation

- Issue refs must match `^#\d+$`.
- Unknown config keys must be rejected with the list of valid keys (CLI handles this).
- `/task new` without an active plan bucket still works — it just creates the issue without any "Planning:" prefix rows.

## Hooks

The PreCompact, PostCompact, and SessionStart hooks (defined in `.claude/settings.json`) call the hook handler automatically. The skill itself does not need to do anything for compaction/session events.

**SessionStart behavior** (runs automatically when Claude opens):
- **No active task, nothing paused** → prints `[task-tracker] No active task.`
- **Task paused** → prints `[task-tracker] #N is paused. Use /task start to resume.`
- **Task was active when session closed** (forgot to `/task pause`) → posts a `session-end-recovery` row with wall-clock elapsed time, then a fresh `session-start` row, and prints a summary with the recovered minutes.

## Error handling

If GH API fails (network down, auth expired), the skill queues the event and reports it as queued. Next successful `/task` call drains the queue.
