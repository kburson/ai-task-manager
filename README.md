# CC Github Project Task Manager

repo: [claude-gh-task-manager](https://github.com/kburson/claude-gh-task-manager)

A Claude Code `/task` skill that binds your AI work sessions to GitHub issues and automatically logs time and context-word usage to a "⏱ Timing Log" comment on each issue.

## Why use it

AI coding sessions work best when they're focused on a single, well-scoped problem. But real projects aren't like that — a plan expands, bugs surface mid-implementation, scope creeps, and "one more thing" features accumulate. Without a system to capture and queue that work, discoveries get lost or derail the current thread.

`/task` connects Claude Code to a GitHub Issues backlog so that surfaced work goes somewhere. When you spot a defect or a follow-on feature mid-session, `/task new` captures it as an issue without interrupting your flow. When the current thread is done, you switch to the next queued item with `/task #N`. The timing log records how long you were actively engaged with Claude on each issue, along with the volume of chat context you read and wrote during the session — useful for estimation, reporting, and understanding where AI acceleration is (and isn't) happening.

It's especially valuable for long multi-step plans: break the work into issues up front, work them in order, and let the skill handle Kanban state transitions and time tracking automatically.

Time and context words are logged automatically on every Claude compaction and session start via hooks, so data is never lost in long sessions — **unless you use `/clear`** (see [Session Management](#session-management) below).

## Prerequisites

- **Node.js 18+**
- **GitHub CLI (`gh`)** — [install](https://cli.github.com) and authenticate with `gh auth login`
- **Claude Code** — [install](https://claude.ai/code)
- A **GitHub Projects V2** board for your repo with a Status field (Kanban) and optionally a Priority field

## Quick Start

```bash
# 1. Install into your project
cd /path/to/your-project
npx claude-gh-task-manager install

# 2. Configure your GitHub project (interactive — walks you through auth + field discovery)
npx claude-gh-task-manager init

# 3. Commit the generated config and issue templates
git add .claude/task-tracker.json` .github/ISSUE_TEMPLATE/
git commit -m "chore: add claude-gh-task-manager"

# 4. Open Claude Code and start tracking
# /task #42
```

## Commands

| Command | Description |
|---|---|
| `/task` | Show active task, elapsed minutes, and word count (default when no args given) |
| `/task #N` | Switch to issue #N, display it, move board to In Progress |
| `/task new [title]` | Create a new issue and start tracking it |
| `/task plan` | Start a planning-phase timer before a GitHub issue exists. When you later run `/task new`, the issue is created from the plan and inherits the timing data. |
| `/task start` | Resume the last active task |
| `/task pause` | Flush timing, pause (keeps last-active for resume) |
| `/task update [message]` | Checkpoint — flush timing, reset counters, keep task active |
| `/task end` | Flush timing, clear active task, write totals to GitHub Projects board |
| `/task log #N` | Re-compute and write board fields for any issue (use when closed without the skill) |
| `/task check "<label>"` | Toggle checkbox `<label>` in the active issue body — checks if unchecked, unchecks if checked (exact match) |
| `/task config` | List all config values with sources |
| `/task config <key> <value>` | Set a config value project-locally |

## Configuration

Config is stored in `.claude/task-tracker.json` (project-local) and `~/.claude/task-tracker-config.json` (user-global). Project values take precedence.

Most values are set automatically by `npx claude-gh-task-manager init`. You can also set them manually:

| Key | Default | Description |
|---|---|---|
| `repo` | `''` | GitHub repo in `owner/repo` format (**required**) |
| `assignee` | `'@me'` | Assignee for `/task new` issues |
| `projectId` | `''` | GitHub Projects V2 node ID |
| `kanbanFieldId` | `''` | Status field ID |
| `kanbanOption*` | `''` | State option IDs (Backlog, Ready, InProgress, InReview, Done) |
| `priorityFieldId` | `''` | Priority field ID |
| `priorityOption*` | `''` | Priority option IDs (P0, P1, P2) |
| `fieldActualMinutes` | `''` | Project field ID for actual session minutes |
| `fieldContextWords` | `''` | Project field ID for context word count |
| `fieldActualHours` | `''` | Project field ID for actual session hours |
| `autoEndOnSwitch` | `true` | Auto-end previous task when switching |
| `idleThresholdMinutes` | `5` | Minutes of inactivity before time is considered idle |
| `defaultLabels` | `[]` | Labels applied to issues created via `/task new` |
| `hookNetworkTimeoutMs` | `2000` | Timeout for GitHub API calls from hooks |

### Example: set repo manually

```bash
# In Claude Code:
/task config repo myorg/my-project
```

## Helper Scripts

After `install`, two additional shell scripts are available in `scripts/gh/`:

| Script | Description |
|---|---|
| `scripts/gh/move-state.sh <issue#> <state>` | Move an issue to a Kanban state (backlog/ready/in-progress/in-review/done) |
| `scripts/gh/set-priority.sh <issue#> <priority> [--cascade]` | Set P0/P1/P2 priority; `--cascade` applies to sub-issues too |

These read all IDs from `.claude/task-tracker.json`, so no manual ID management.

## How Timing Works

The skill writes a "⏱ Timing Log" comment to each GitHub issue. Every start, pause, update, end, and switch appends a row:

```
| Timestamp         | Event  | Active Min | Idle Min | Δ Words | Word Marker | Description  |
| 2026-04-25T14:30Z | start  | 0          | 0        | 0       | 2,341       | task opened  |
| 2026-04-25T15:45Z | update | 72         | 3        | 1,204   | 3,545       | checkpoint   |
| 2026-04-25T16:00Z | resume | 0          | 0        | 0       | 3,545       | task resumed |
| 2026-04-25T17:10Z | end    | 67         | 5        | 890     | 4,435       | task ended   |
```

**Active Min** and **Idle Min** are deltas since the last baseline reset (start, resume, or update). **Word Marker** is the absolute word-count position in the session — useful as a reference point. Active minutes exclude idle gaps (configurable via `idleThresholdMinutes`).

Hooks flush data on every compaction, so long sessions spanning multiple compactions are fully captured.

## Session Management

### `/compact` vs `/clear`

| | `/compact` | `/clear` |
|---|---|---|
| **Token cost** | ~2k tokens to summarize | ~50k tokens to reload fresh session context (can be trimmed to ~20k with a lean config) |
| **Context** | Summarizes and continues current thread | Flushes everything; starts a new thread |
| **Hooks** | Triggers PreCompact + PostCompact hooks | **Bypasses all hooks** |
| **Timing data** | Flushed safely before compaction | Lost if not manually paused first |
| **When to use** | Working in the same task/thread | Starting completely unrelated work |

> **What loads on a fresh session:** CLAUDE.md, MEMORY.md, all active skill definitions, MCP server manifests, and any project-level settings — before a single message is exchanged.

**Default to `/compact`.** It costs ~25x fewer tokens and keeps your timing data intact.

Only use `/clear` when you genuinely need a clean slate — a different project, a context-poisoned session, or a fresh debugging thread with no carryover.

### Before you `/clear`

`/clear` bypasses hooks. Any time logged since the last flush (start, pause, or compaction) will be lost.

Always run `/task pause` first:

```
/task pause
/clear
```

This flushes elapsed time and context words to the GitHub issue comment before the session is wiped.

### One session per workspace

The task tracker's state file (`.claude/task-tracker-state.json`) is **workspace-scoped** — it stores a single active task shared across all Claude sessions open in the same directory. Word-count markers are per-session, but the CLI detects the current session by finding the most-recently-modified JSONL file, which is a heuristic that breaks when two sessions are active simultaneously.

**Practical rule: only run `/task` commands from one session at a time.**

If you open a second session in the same workspace (e.g., to look something up), treat it as read-only — don't run any `/task` commands from it. Switching tasks or checkpointing from a second session will corrupt the word-count baseline for the first session. Timing (minutes) will still be correct; only the Δ Words column is affected.

## Issue Templates

`npx claude-gh-task-manager init` creates `.github/ISSUE_TEMPLATE/task.yml` and `bug.yml` with fields for:
- Description and acceptance criteria
- Priority (P0/P1/P2)
- Size (XS → XL)
- Estimate (hours)

These align with the GitHub Projects fields used for ROI tracking.

## Reconfiguring

Re-run `init` at any time to update your project config:

```bash
npx claude-gh-task-manager init
```

Existing config values are merged — only fields discovered during init are overwritten.

## Status Line (CLI only)

> **Supported in the Claude Code CLI only.** The status line has no effect in the Claude.ai web app or the Claude desktop application. The desktop app is evolving rapidly and may add status line support in a future release.

Show the active `/task` issue number in the Claude Code CLI header bar:

```bash
npx claude-gh-task-manager statusline
```

This installs `~/.claude/statusline.sh` and wires it into `~/.claude/settings.json`. Once active, the CLI header shows `task #42` while a task is running, and goes blank when no task is active.

Requires `jq`:
- **macOS:** `brew install jq`
- **Linux:** `apt install jq`
- **Windows:** `winget install jqlang.jq` (or `choco install jq` / `scoop install jq`)

## Value Report

Generate a detailed HTML (or PDF) report showing the ROI of AI-assisted development across all tracked issues on your GitHub Projects board. Run it from any project where the package is installed:

```bash
# All issues with data (HTML — no extra dependencies)
npx github-project-report --html

# PDF output (requires puppeteer: npm install --save-dev puppeteer)
npx github-project-report

# Only closed issues
npx github-project-report --html --state closed

# Date-range slice (closed issues only)
npx github-project-report --html --state closed --from 2026-01-01 --to 2026-03-31

# Specific issues
npx github-project-report --html --issues 10,11,12

# Override region and role for cost table
npx github-project-report --html --region sf_bay --role senior
```

### Why it's useful

The report answers the question: **what did it actually cost to ship this, versus what would it have cost without AI?**

It reads three fields from your GitHub Projects board — `Estimate` (pre-execution hours), `Actual Session Time` (measured AI session minutes), and `Context Length` (measured chat words) — and builds a full comparison:

- **Engaged Hours** = session minutes + human reading time (context words ÷ WPM). This is your real time investment.
- **Estimated Acceleration** = Estimate ÷ Engaged Hours. A ratio of `4×` means 4 estimated hours were delivered per engaged hour.
- **Cost table** across all US regions, comparing estimated cost vs. engaged-time cost at fully-burdened rates.
- **Three baselines**: budget baseline (single mid-level engineer), solo senior engineer (70% efficiency factor), enterprise team (50% efficiency + 30% coordination overhead).
- **Timeline analysis**: calendar weeks estimated vs. calendar weeks measured.

This makes AI productivity legible to stakeholders — not "we used AI" but "we delivered 82 estimated hours in 11 engaged hours at `$800` instead of `$14,000`."

### All flags

| Flag | Description |
|---|---|
| `--html` | Emit HTML only, skip PDF (no puppeteer required) |
| `--state closed\|open\|all` | Filter by issue state (default: `all`) |
| `--from YYYY-MM-DD` | Only issues closed on or after this date |
| `--to YYYY-MM-DD` | Only issues closed on or before this date |
| `--issues 10,11,12` | Limit to specific issue numbers (overrides all other filters) |
| `--role mid\|senior\|staff` | Engineer level for cost table (default: `mid`) |
| `--solo-role mid\|senior\|staff` | Role for solo-engineer baseline (default: `senior`) |
| `--region <id>` | Region ID from `regional-rates.json` (default: `national`) |
| `--reading-wpm N` | Override reading WPM for context-word time (default: `180`) |
| `--chat-words N` | Add extra context words not yet logged to any issue |
| `--title "..."` | Custom report heading |
| `--output ./path/report` | Output base path without extension (default: `./reports/value-report`) |
| `--project-id PVT_...` | Override GitHub Projects V2 node ID (default: from `.claude/task-tracker.json`) |

### Configuration

Defaults are loaded from `scripts/reports/value-report-config.json` inside the installed package. You can override per-project by creating your own `value-report-config.json` at your project root and passing `--output` to point elsewhere.

The report reads `projectId` and `repo` from `.claude/task-tracker.json` automatically — no manual IDs needed.

PDF output requires puppeteer: `npm install --save-dev puppeteer`. Without it, HTML is saved and you can print-to-PDF from Chrome.

See [docs/ai-value-framework.md](docs/ai-value-framework.md) for the full ROI methodology.

## Troubleshooting

**`task-tracker not configured`** — Run `npx claude-gh-task-manager init`.

**`Issue #N not found in project`** — The issue hasn't been added to your GitHub Project board. Open the issue on GitHub and add it to the project manually, or check that your `repo` config matches the project owner.

**`gh: command not found`** — Install the GitHub CLI: [cli.github.com](https://cli.github.com)

**Timing not appearing on issues** — Check that hooks are registered in `.claude/settings.json` (the install command adds them). Verify `gh auth status` is authenticated.

## Design

See [docs/DESIGN.md](docs/DESIGN.md) for the full design specification including data model, state file format, timing comment structure, and hook behavior.

## License

MIT
