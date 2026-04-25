# claude-gh-task-manager

A Claude Code `/task` skill that binds your AI work sessions to GitHub issues and automatically logs time and context-word usage to a "⏱ Timing Log" comment on each issue.

## What it does

- **`/task #42`** — Start working on issue #42. The AI assistant displays the issue details, moves it to "In Progress" on your Kanban board, and begins tracking time.
- **`/task pause`** — Flush elapsed time to the GitHub comment and pause.
- **`/task end`** — Stop tracking and clear the active task.
- **`/task new [title]`** — Create a new GitHub issue and start working on it.
- **`/task status`** — Show active task, elapsed active minutes, and words since last marker.
- **`/task config`** — View or set config values.

Time and context words are logged automatically on every Claude compaction and session start via hooks, so data is never lost even in long sessions.

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
git add .claude/task-tracker.json .github/ISSUE_TEMPLATE/
git commit -m "chore: add claude-gh-task-manager"

# 4. Open Claude Code and start tracking
# /task #42
```

## Commands

| Command | Description |
|---|---|
| `/task #N` | Switch to issue #N, display it, move board to In Progress |
| `/task new [title]` | Create a new issue and start tracking it |
| `/task plan` | Open an untracked planning bucket (no issue yet) |
| `/task start` | Resume the last active task |
| `/task pause` | Flush timing, pause (keeps last-active for resume) |
| `/task end` | Flush timing, clear active task |
| `/task status` | Show active task, elapsed minutes, and word count |
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

The skill writes a "⏱ Timing Log" comment to each GitHub issue. Every start, pause, end, and switch appends a row:

```
| 2026-04-25T14:30Z | start   | —   | —     |    0 | 2,341 |
| 2026-04-25T15:45Z | pause   | +72 | +1204 |   72 | 3,545 |
| 2026-04-25T16:00Z | resume  | —   | —     |   72 | 3,545 |
| 2026-04-25T17:10Z | end     | +67 | +890  |  139 | 4,435 |
```

Active minutes exclude idle gaps (configurable via `idleThresholdMinutes`).

Hooks flush data on every compaction, so long sessions spanning multiple compactions are fully captured.

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

## Value Report

Generate an HTML/PDF report showing the ROI of AI-assisted development across all tracked issues on your board:

```bash
# HTML + PDF (requires puppeteer: npm install --save-dev puppeteer)
npm run report:value

# HTML only (no extra dependencies)
npm run report:value:html

# Filtered to specific issues
node scripts/reports/generate-value-report.mjs --issues 10,11,12 --html

# Override region and role for cost table
node scripts/reports/generate-value-report.mjs --region sf_bay --role senior
```

The report reads `projectId` and `repo` from `.claude/task-tracker.json` automatically. It pulls `Estimate`, `Actual Session Time`, and `Context Length` from your GitHub Projects board and calculates:

- **Engaged Hours** = session minutes + human reading time (context words ÷ WPM)
- **Estimated Acceleration** = Estimate ÷ Engaged Hours
- **Value ratios** vs budget baseline, solo senior engineer, and enterprise team costs

Configure defaults in `scripts/reports/value-report-config.json` (region, role, reading WPM, output directory).

See [docs/ai-value-framework.md](docs/ai-value-framework.md) for the full methodology.

## Troubleshooting

**`task-tracker not configured`** — Run `npx claude-gh-task-manager init`.

**`Issue #N not found in project`** — The issue hasn't been added to your GitHub Project board. Open the issue on GitHub and add it to the project manually, or check that your `repo` config matches the project owner.

**`gh: command not found`** — Install the GitHub CLI: [cli.github.com](https://cli.github.com)

**Timing not appearing on issues** — Check that hooks are registered in `.claude/settings.json` (the install command adds them). Verify `gh auth status` is authenticated.

## Design

See [docs/DESIGN.md](docs/DESIGN.md) for the full design specification including data model, state file format, timing comment structure, and hook behavior.

## License

MIT
