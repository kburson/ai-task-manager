---
name: task
description: Bind work sessions to GitHub issues and track time + context words per issue. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.
---

# Task Tracker

Per-issue time and context-word tracking. Writes to a "⏱ Timing Log" comment on the target GitHub issue; keeps minimal local state in `.claude/task-tracker-state.json`.

**Full design:** `.claude/skills/task/DESIGN.md`

## Commands

| Command | Action |
|---|---|
| `/task` | Print active task, elapsed, words since last marker |
| `/task #N` | **Start/switch to issue #N and display its full body** |
| `/task new [title]` | Create a new issue and start working on it |
| `/task plan` | Open an untracked planning bucket |
| `/task resume` | Resume the last paused task (no body reload — context still warm) |
| `/task resume #N` | **Switch back to a specific paused task and display its body** |
| `/task pause` | Flush timing, keep last-active. Run before `/clear` or closing Claude Code. |
| `/task update [msg]` | Checkpoint — flush timing and reset counters, keep task active |
| `/task close` | Hard-stop — flush timing, update board fields, deregister from fleet |
| `/task close --force` | Close even if unchecked items remain |
| `/task log #N` | Re-compute and write Actual Session Time + Context Length for any issue |
| `/task check "<label>"` | Toggle a checkbox in the active issue body (exact label match) |
| `/task fleet` | Show all active tasks across parallel agent worktrees |
| `/task config` | List all config values |
| `/task config <key> <value>` | Set a config value (project-local) |
| `/task config init` | Interactive interview — review and set all config values |

`start` and `end` are accepted as aliases for `resume` and `close`.

## Implementation

### Step 1: Run the CLI
```bash
node "$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/task-tracker/task-tracker.mjs" <verb> [args...]
```
Print stdout verbatim. On non-zero exit, print stderr and surface the error.

**Exit code 3** from `/task close` means unchecked items were found — see Pre-Close Gate below.

### Step 2: For `/task #N` and `/task resume #N` — ensure issue states are correct

After the CLI succeeds, perform these checks before displaying the issue.

#### 2a. Fetch full issue metadata
```bash
gh issue view <N> --json title,body,state,projectItems,parent
```

#### 2b. Ensure the issue is open and in-progress
If closed, reopen it:
```bash
gh issue reopen <N>
```
Move to in-progress:
```bash
"$(git rev-parse --show-toplevel)/node_modules/@burson.kendrick/claude-gh-task-manager/scripts/gh/move-state.sh" <N> in-progress
```

#### 2c. If this is a sub-issue, ensure the parent is open and in-progress
Query via GraphQL (read repo owner/name from `.claude/task-tracker.json` key `repo`):
```bash
gh api graphql -f query='
  query($owner:String!,$repo:String!,$number:Int!) {
    repository(owner:$owner, name:$repo) {
      issue(number:$number) { parent { number state title } }
    }
  }
' -f owner=<owner> -f repo=<repo> -F number=<N>
```
If parent is closed → reopen and move to in-progress.
If parent is open but not in-progress → move to in-progress.
Report any state changes; skip silently if already correct.

#### 2d. Display the issue
```bash
gh issue view <N> --json title,body,state
```
Show: **title** (h2), full body, current state. This tells Claude what work needs doing.

### Step 2b: For `/task config init` — run the configuration interview

Do not pass `config init` to the CLI. Conduct the interview directly:

1. Run `/task config` and parse the current values and their sources.
2. Work through each key below, one at a time. Show the current value and source, ask the question, and write the answer with `/task config <key> <value>` before moving to the next.
3. Skip any key the user explicitly says to leave as-is.

**GitHub setup**

| Key | Question |
|---|---|
| `repo` | What is the GitHub repo? (`owner/repo` format) |
| `assignee` | Who should new issues be assigned to? (default: `@me`) |
| `defaultLabels` | Any default labels for new issues? (comma-separated, or leave empty) |

**Behavior**

| Key | Question |
|---|---|
| `wpm` | Your estimated reading/coding speed in words per minute? (default: 180) |
| `autoEndOnSwitch` | Auto-close the previous task when switching to a new one? (true/false) |
| `idleThresholdMinutes` | How many idle minutes before a gap stops counting as active time? (default: 5) |
| `recordWallClock` | Record wall-clock time in addition to active time? (true/false) |
| `hookNetworkTimeoutMs` | GitHub API timeout in milliseconds? (default: 2000) |

**Features**

| Key | Question |
|---|---|
| `pickupDirective` | Enable the Pickup Directive pattern for sub-issues? Inserts a structured deep-dive + Definition of Done block into each sub-issue body during epic planning. Recommended for multi-agent workflows. (true/false) |

**Internal paths** (show current values; only ask if the user wants to change them)

| Key | Default |
|---|---|
| `statePath` | `.claude/task-tracker-state.json` |
| `queuePath` | `.claude/task-tracker-queue.json` |

> GH Projects IDs (`projectId`, `kanbanFieldId`, `kanbanOption*`, `priorityFieldId`, `priorityOption*`) are set automatically by `npx claude-gh-task-manager init` and are not included in this interview.

After all keys are set, run `/task config` and display the final config.

### Step 3: For all other commands
Invoke the CLI and print output — no issue fetch needed.

### Pre-Close Gate (exit code 3)

When `/task close` exits with code 3, the CLI has already printed the unchecked items to stderr. Claude must:

1. Show the unchecked item list to the user.
2. Ask: **"Would you like me to verify and resolve these items first, or close anyway?"**
3. If the user wants resolution → work through each item, check them off with `/task check "<label>"` as each is verified, then run `/task close` again.
4. If the user says close anyway → run `/task close --force`.

**Never run `gh issue close` directly.** Always use `/task close` so the pre-close gate runs. If no task session is active, fetch the issue body first and manually check for `- [ ]` lines before closing.

## AI Directives

### Task context — always match active task to the work happening now

- `/task #epic` when dispatching agents, reviewing output, orchestrating, or deciding what to fan out next.
- `/task #child` when performing that child's work directly in this session (no sub-agent).
- Switch back to `/task #epic` the moment work is handed to a sub-agent or you return to orchestration.
- Never leave the epic active while a child is being worked directly, and never leave a child active while orchestrating.

### Pickup Directive (when `pickupDirective: true`)

**At issue creation** (epics, sub-issues, and solo tasks alike):
1. Read `.claude/task-tracker/definition-of-done.md` to get the DoD checklist.
2. Append this lean block to the issue body (after the Scope section), with the DoD items inlined:

```markdown
## ⚡ Pickup Directive
> Follow: `.claude/task-tracker/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
<contents of definition-of-done.md — each line verbatim>

---
```

3. Replace `<this-issue-#>` and `<parent-epic-#>` placeholders in the body with actual numbers.

**At issue pickup** (`/task #N` or `/task resume #N`):
- Read `.claude/task-tracker/pickup-directive.md` for the detailed step-by-step instructions.
- Check if `- [x] Deep dive complete` is present in the issue body.
  - Checked → skip analysis steps; proceed to implementation (step 6 in the directive).
  - Unchecked → run the full deep dive as described in the directive.
- After completing the deep dive (step 3): `/task check "Deep dive complete"`

**Before `/task close`:**
- Review every item in the Definition of Done section of the issue body.
- Verify each is genuinely complete, then mark it: `/task check "<label>"`.
- Only run `/task close` once all DoD items are checked. The pre-close gate enforces this.

### Issue lifecycle

- Every issue needs `Estimate` (hours) and `Size` set before work starts. No exceptions.
- Move states via `scripts/gh/move-state.sh` — never set manually.
- Sub-issues: one level only. Parent cannot close until all children are closed.
- Always assign on create: `--assignee` from `.claude/task-tracker.json` key `assignee` (default `@me`).

### Session recovery

- **Paused** → `/task resume` to reattach without reloading body.
- **Abandoned** (forgot to pause) → SessionStart hook auto-recovers timing on next open.
- **Mid-epic pickup** → `/task #epic` to reattach and reload context before fanning out.
- **Jumping between tasks** → `/task resume #N` to reattach and reload body for the target issue.

## Hooks

PreCompact, PostCompact, and SessionStart hooks (in `.claude/settings.json`) call the hook handler automatically. The skill does not need to handle compaction/session events.

**SessionStart behavior:**
- No active task, nothing paused → `[task-tracker] No active task.`
- Task paused → `[task-tracker] #N is paused. Use /task resume to continue.`
- Task was active when session closed → posts `session-end-recovery` row, then fresh `session-start` row, prints recovered minutes.

## Multi-Agent / Parallel Worktrees

Run parallel agents in separate git worktrees — each has isolated state and word-count session. Use `/task fleet` from any worktree to see all registered tasks.

Each agent self-registers on start and deregisters on close. Registry lives at the main worktree's `.claude/task-fleet.json`.

**Epic / sub-issue pattern:** Start `/task #<epic>` in the main (orchestrator) worktree, fan sub-issues to agent worktrees. Epic accumulates calendar time (orchestration cost); sub-issues accumulate effort time (AI execution). Both are captured automatically and used by the value report to separate human engagement cost from AI effort.

## Error Handling

If GH API fails, the event is queued. Next successful `/task` call drains the queue.

## Validation

- Issue refs must match `^#\d+$`.
- Unknown config keys are rejected with the list of valid keys (CLI handles this).
