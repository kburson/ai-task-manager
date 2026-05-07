# AI Task Manager

**Turn your AI coding sessions into measurable, managed engineering work.**

AI Task Manager lets Claude Code and Codex share the same GitHub issue/project workflow. It binds every AI session to a GitHub issue, tracks time and context automatically, orchestrates full project backlogs from a spec, and generates stakeholder-ready ROI reports.

---

## TL;DR — Up in 3 Minutes

```bash
# 1. Install into your project
npx ai-task-manager install --agent both

# 2. Connect to your GitHub Project board (interactive)
npx ai-task-manager init

# 3. Commit the generated config
git add .ai-task-manager/task-tracker.json .github/ISSUE_TEMPLATE/
git commit -m "chore: add ai-task-manager"
```

Then in Claude Code:
```
/task #42          → switch to issue #42, move board to In Progress, display the brief
/task new          → create a new issue and start tracking
/task              → show active task, elapsed time, word count
/task close        → flush time, move board to Done, write actuals to project fields
```

That's it. Everything else is optional depth.

In Codex, ask naturally:

```text
Use the task skill to start issue #42.
```

---

## What This Is

Most AI coding tools give you a chat. This gives you an **engineering system**.

The gap between "I've been using AI coding agents for a few weeks" and "here's what we shipped, what it cost, and what we got for it" is exactly what this tool fills. Every session is bound to a GitHub issue. Every issue is tracked on a Kanban board. Every hour of AI engagement is measured and compared against your original estimate. At the end of a sprint — or a project — you can generate a report that answers the only question leadership actually cares about: *what did this cost versus what would it have cost without AI?*

The tool has three distinct capability layers:

1. **Session tracking** — bind Claude Code or Codex to a GitHub issue, auto-log time and context words, manage Kanban state hands-free
2. **Backlog orchestration** — generate a complete GitHub Projects backlog from a spec document, with epics, sub-issues, labels, sizing, sequencing, and pickup directives
3. **ROI reporting** — produce a financial report comparing estimated effort against measured engaged hours, with fully-burdened cost tables by US region and role

---

## Prerequisites

- **Node.js 18+**
- **GitHub CLI (`gh`)** — [install](https://cli.github.com) and run `gh auth login`
- **jq** — `brew install jq` / `apt install jq` / `winget install jqlang.jq`
- **Claude Code and/or Codex** — install whichever agent you plan to use
- A **GitHub Projects V2** board. `init` can use an existing linked board, link an existing user/org board, or create a new board with AI Task Manager-compatible workflow fields.

## Install Targets

Install for one agent or both:

```bash
npx ai-task-manager install --agent claude
npx ai-task-manager install --agent codex
npx ai-task-manager install --agent both
```

The installer writes stable skill stubs by default:

- Claude Code: `.claude/skills/task/SKILL.md`
- Codex: `.agents/skills/task/SKILL.md`
- Shared templates and runtime state: `.ai-task-manager/`

### Optional Codex Superpowers Bootstrap

AITM can optionally mirror existing Claude Code Superpowers skills into Codex and add bootstrap instructions for new Codex sessions:

```bash
npx ai-task-manager install --agent codex --codex-superpowers
```

This is not an AITM dependency. The installer first looks for an existing Claude Code Superpowers cache at:

```text
~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills
```

If found, AITM copies the supported skills into `~/.codex/skills` and appends an AITM-managed block to the repo-local `AGENTS.md`. That block tells Codex to load `using-superpowers` at conversation start and to check relevant Superpowers skills before planning, debugging, testing, implementing, dispatching agents, using worktrees, finishing a branch, or handling review.

By default the bootstrap instructions are repo-local. To update global Codex instructions instead, opt in explicitly:

```bash
npx ai-task-manager install --agent codex --codex-superpowers-global
```

If Superpowers is missing, install continues normally and prints a follow-up command to rerun later. The AITM task skill remains separate at `.agents/skills/task/SKILL.md`.

The old `claude-gh-task-manager` bin remains as a compatibility alias for this release, but new installs should use `ai-task-manager`.

---

## Session Tracking

### The Core Loop

The fundamental unit is a *task session*: Claude is working on one GitHub issue at a time. You switch issues with `/task #N`, and the skill handles the rest — moving the Kanban card, logging the start event, and watching for idle time.

```
/task #42          → switch to issue #42
...work for an hour...
/task update       → checkpoint — flush timing, reset counters, keep task active
...work more...
/task close        → done — move card to Done, write Engaged Time + Session Time + Context Length to board
```

### Commands

| Command | Action |
|---|---|
| `/task` | Show active task, elapsed minutes, context words since last marker |
| `/task #N` | Switch to issue #N — display the brief, move board to In Progress |
| `/task new [title]` | Create a new issue and start tracking it |
| `/task plan` | Open an untracked planning bucket before an issue exists |
| `/task resume` | Resume the last paused task (no body reload) |
| `/task resume #N` | Switch back to a paused task and display its body |
| `/task pause` | Flush timing, keep last-active. Run before `/clear` or closing an agent session |
| `/task update [msg]` | Checkpoint — flush and reset counters, keep task active |
| `/task close` | Hard-stop — flush, update board fields, move to Done |
| `TASK_TRACKER_FORCE_DONE=1 /task close` | Audited bypass for legitimate abandonment — posts an audit comment to the issue. Do not use to skip verification. |
| `/task log #N` | Re-compute and write Engaged Time, Session Time, and Context Length for any issue |
| `/task migrate` | Select/configure a project, import repo issues, heal field DBs, and sync project fields |
| `/task check "<label>"` | Toggle a checkbox in the active issue body (exact label match) |
| `/task fleet` | Show all active tasks across parallel agent worktrees |
| `/task config` | List all config values with sources |
| `/task config <key> <value>` | Set a config value project-locally |
| `/task config init` | Interactive interview — review and set all config values |
| `/task help` | Print command reference |

### How Timing Works

Every start, pause, update, and close appends a row to a "⏱ Timing Log" comment on the GitHub issue:

```
| Timestamp         | Event  | Active Min | Idle Min | Δ Words | Word Marker |
| 2026-04-25T14:30Z | start  | 0          | 0        | 0       | 2,341       |
| 2026-04-25T15:45Z | update | 72         | 3        | 1,204   | 3,545       |
| 2026-04-25T17:10Z | end    | 67         | 5        | 890     | 4,435       |
```

**Active Min** and **Idle Min** are deltas since the last baseline reset. **Idle** is any gap longer than `idleThresholdMinutes` (default: 5). Context words count the visible chat text — the conversation turns a human would read, review, and respond to. This excludes code, files, and references the AI loads into context internally. It's a measure of human review burden: the volume of AI output you're expected to engage with during the session. Reading long responses is also a common source of idle gaps — the clock sees silence while you're actually working through the output.

Hooks flush timing on every `/compact` and session start, so long sessions are never lost — **unless you use `/clear`** (always run `/task pause` first if you must).

### GitHub Projects Board Integration

When you switch tasks or close an issue, the skill updates your board automatically:

- **Kanban state** → moves the card (Backlog → Ready → In Progress → In Review → Done)
- **Engaged Time / Session Time** → measured minutes used by reports and board filters
- **Context Length** → total context words across all sessions
- **Sequence** → the issue's position in the fan-out order
- **Start date / End date** → set automatically when work moves to In Progress or Done

All board IDs are stored in `.ai-task-manager/task-tracker.json` and set once by `init`. You never manage IDs manually.

If the current repo has no linked project, `init` lists available user/org projects and offers to create a new repo-linked project. GitHub's built-in web templates, including Feature Release, are not exposed through the supported CLI/API create path, so new boards use an AI Task Manager-compatible Feature Release workflow by default.

Project field definitions live in `.ai-task-manager/project-fields.json`; event bindings live in `.ai-task-manager/project-field-events.json`. These files are intended to be committed so project-specific workflow customizations travel with the repo.

AITM stores portable field values in a compact machine block at the bottom of each issue body. GitHub Project fields are treated as a rebuildable index for filtering, sorting, and reporting. If that block is missing or malformed, field-writing commands heal it before syncing board fields.

The embedded block is intentionally terse and machine-owned:

````md
<!-- ai-task-manager:fields:start -->
```json
{"schema":1,"values":{"priority":"P1","estimate":6,"sessionTime":42}}
```
<!-- ai-task-manager:fields:end -->
````

---

## Backlog Orchestration

The orchestration mode is where the tool shifts from tracker to co-pilot.

### Plan Mode

Start a planning session before any issues exist:

```
/task plan
```

This opens an untracked bucket for time spent thinking, speccing, and designing. When you're ready to execute:

```
/task new My Feature Backlog
```

If you're in plan mode and have a spec in context, the skill prompts:

> "I see a spec in context — use it to build out the full backlog? I'll create all epics and sub-issues, set sizing/priority/sequence, and inject pickup directives across the entire plan — no stopping between issues."

Reply **yes** and the orchestration runs end-to-end. Reply **no** to create a single issue instead.

### From Spec to GitHub in One Pass

Given a spec document (markdown, loaded into context), the orchestrator creates the full project structure:

1. **Labels** — creates `plan:<slug>` for the backlog, plus purpose labels (`backend`, `client`, `infrastructure`, `security`, `data`, `test`, `dx`) inferred from each issue's scope
2. **Epics** — one per epic block in the spec, with full scope, acceptance criteria, and Pickup Directive
3. **Sub-issues** — each linked to its parent epic via GitHub's sub-issue relationship
4. **Solo tasks** — standalone issues with no parent
5. **Project fields** — Size, Estimate, Priority, and Sequence set on every issue via GitHub Projects V2 API
6. **Kanban state** — every issue lands in Backlog, ready to work

All of this runs automatically. You watch the progress stream and review the summary table at the end.

### Sequencing and Dependencies

Every issue in the spec should include a `**Sequence:** N` field. Issues with the same number can run in parallel; higher-sequence issues wait for all lower-sequence issues to close first.

```markdown
#### E1-S1 — Implement email/password registration
**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Sequence:** 1

#### E1-S2 — Add Google OAuth integration
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Depends on:** E1-S1 (JWT infrastructure)
```

The Sequence value is written to a numeric field on the GitHub Projects board, making fan-out order machine-readable. During epic pickup, the agent validates these values against actual code dependencies and posts a confirmed dependency map before fanning out.

**Sequencing rule:** Once an epic is in progress, all parallel work happens within that epic's sub-issues. No cross-epic fan-out until the active epic closes.

### Spec Format

Include a sequencing key and epic execution order at the top of your spec:

```markdown
**Sequencing key:** Same Sequence = parallel. Higher Sequence = blocked until all lower close.
**Epic execution order:** Epic 1 (Auth) → Epic 2 (Billing) → Epic 3 (Dashboard)

### S1 — Set up CI pipeline
**Priority:** P1 | **Size:** S | **Estimate:** 2h | **Sequence:** 1 | **Model:** sonnet
```

The `**Model:**` hint tells orchestration which model to use when fanning out that issue to a sub-agent.

### Conversational Backlog Management

The GitHub integration and skill definitions mean you don't have to memorize slash commands to manage your backlog. The AI agent can discuss and manage issues directly from chat — reading context, inferring intent, and issuing the right `gh` API calls behind the scenes.

Ask naturally:

```
"What's the status of the auth epic?"
"Create a new issue for the rate-limiting bug we just found — P1, S estimate."
"Move issue #34 to In Review."
"Link #42 as a sub-issue of #38 and set sequence 2."
"Show me all open P0 issues with no estimate."
"Close the current task and log time."
```

The agent translates these into the right combination of `gh issue`, `gh project`, and GitHub Projects V2 GraphQL calls. The pickup directive, definition-of-done checklist, and fleet rules are structured knowledge embedded in the skill — so the agent can enforce your workflow even when driving from conversation, not commands.

`/task` commands are the precise, scriptable interface. Conversation is the flexible one. Both drive the same underlying system.

---

## Pickup Directive

The Pickup Directive makes every issue self-contained. Any agent, on any machine, after any context reset, can pick up an issue cold and know exactly what to do.

### What Gets Injected

Every issue created from a master plan gets this block appended:

```markdown
## ⚡ Pickup Directive — MANDATORY, DO NOT SKIP
> Follow: `.ai-task-manager/pickup-directive.md`

- [ ] Deep dive complete

### Definition of Done
- [ ] Acceptance criteria met (including test additions from deep dive)
- [ ] Tests pass; new coverage committed
- [ ] Pre-commit hooks pass
- [ ] Issue body checkboxes ticked
- [ ] Issue moved to Done
- [ ] `/task close` run (writes Engaged Time, Session Time, and Context Length automatically)
- [ ] If this completes the parent epic: update parent body; close parent if all siblings Done

---
```

The issue body stays lean. The detailed agent instructions live in `.ai-task-manager/pickup-directive.md` — the agent reads that file at pickup time. The injected block is built by `scripts/task-tracker/preflight-issue.mjs`, which also gates issue creation: if either template file is missing, the script aborts and the skill stops creating issues until the install is fixed.

### Hard Rules — Enforced by the Gates

The `/task close` pre-close gate AND `move-state.sh <issue> done` both refuse if:
- any `- [ ]` remains in the issue body (Deep Dive checkpoint, DoD, acceptance criteria), or
- the line `- [x] Deep dive complete` is not present when the body contains a Pickup Directive block.

Audited override: `TASK_TRACKER_FORCE_DONE=1` bypasses the gate but writes a visible audit comment to the issue listing what was unverified. Use only for legitimate abandonment (e.g., the issue turned out invalid) — never to skip verification on a real fix.

The GitHub UI (drag a card to Done, delete an issue) still bypasses all gates; the script-driven paths are now consistent and auditable.

### The Deep Dive Checkpoint

On first pickup, the agent runs a just-in-time analysis against the current repo state and appends it to the issue body. The deep dive must include:

- Files to edit (full repo-relative paths)
- Step-by-step implementation plan
- Test additions (each test file with a one-line description)
- Verification Commands as enforceable checkboxes:
  ```markdown
  ### Verification Commands

  - [ ] `node scripts/task-tracker/tests/config.test.mjs`
  - [ ] `node scripts/task-tracker/tests/state.test.mjs`
  ```
  Do not add words like `PASS`; a checked box means the exact command was run successfully and output was read.
- Identified risks beyond the original scope
- **Dependency map** — always required:
  ```
  ## Dependency Map
  Depends on: #12 (JWT model), #14 (refresh token schema)
  Blocks: #19 (OAuth flow), #21 (MFA enrollment)
  ```

Once the deep dive checkbox is checked, every subsequent pickup — after `/clear`, machine switches, or agent handoffs — skips straight to implementation.

### Epic Fan-Out with Dependency Validation

When an epic is picked up, before fanning out sub-agents:

1. All sub-issue Sequence fields are validated against actual code dependencies found in the deep dive
2. Any incorrect Sequence values are updated on the project board
3. A confirmed dependency map is posted as a comment on the epic
4. Sequence-1 sub-issues are fanned out immediately; each subsequent wave unblocks when the previous closes

### Customizing

Two files are installed to `.ai-task-manager/` and can be edited per project:

| File | Purpose |
|---|---|
| `pickup-directive.md` | Agent instructions — deep dive steps, implementation pattern, fan-out rules |
| `definition-of-done.md` | DoD checklist inlined into every new issue body at creation |

If a local edit differs from the bundled template, reinstall saves the previous file as `.bak` before refreshing it.

---

## Multi-Agent Orchestration

When work fans out to parallel sub-agents, the **active task should always be the issue whose work is being performed in this session right now**.

| What you're doing | Active task |
|---|---|
| Dispatching sub-agents, reviewing output, orchestrating | `/task #epic` |
| Performing a child issue's work directly (no sub-agent) | `/task #child` |
| Returned to orchestration after agent completes | `/task #epic` |

The fleet command shows all active tasks across parallel worktrees:

```
/task fleet
```

### Orchestration Directive (add to `CLAUDE.md`)

```
## Task Tracker: Orchestration Rules

- Orchestrating (dispatching, reviewing, synthesizing): /task #<epic>
- Performing child work directly in this session: /task #<child>
- Return to /task #<epic> the moment work goes to a sub-agent

Never leave the epic active while working a child directly.
Never leave a child active while orchestrating.
```

---

## Status Line

Show the active issue number in the Claude Code CLI header bar:

```bash
npx ai-task-manager statusline
```

Installs `~/.claude/statusline.sh` and wires it into `~/.claude/settings.json`. The CLI header shows `task #42` while a task is running, blank when idle.

> Supported in the Claude Code CLI only. No effect in the web or desktop app.

Requires `jq`.

---

## Value Report

Generate a financial report showing the ROI of AI-assisted development across your entire GitHub Projects board.

```bash
# HTML report (no dependencies)
npx github-project-report --html

# PDF report (requires: npm install --save-dev puppeteer)
npx github-project-report

# Closed issues only, Q1 date range
npx github-project-report --html --state closed --from 2026-01-01 --to 2026-03-31

# Specific issues
npx github-project-report --html --issues 10,11,12

# Override region and seniority for cost table
npx github-project-report --html --region sf_bay --role senior
```

### What the Report Shows

The report answers: **what did it actually cost to ship this, versus what would it have cost without AI?**

It reads three fields from your board — `Estimate` (pre-work hours), `Session Time` (measured minutes), and `Context Length` (chat words) — and builds a multi-section, print-optimized PDF or HTML document:

**Page 1 — Executive Summary**
A branded header (title, generated date, region, project/repo/filters) followed by a plain-English summary of the report's structure and methodology — designed as a clean cover page for stakeholder distribution.

**Page 2 — Agentic AI Accelerator + Comparison Rows**
- Side-by-side cost view: Human Engineering Cost vs. AI-Assisted Cost with acceleration multiples (cost efficiency and calendar speed)
- Six comparison rows: Budget Baseline · Solo Senior Engineer · Enterprise Team · AI-Assisted Actual · Agentic AI Accelerator (human leverage only) · AI Leverage summary

**Pages 3+ — Supporting Detail**
- **Product Backlog** — per-issue table with estimate, session time, context words, engaged hours, and acceleration ratio; epics roll up their sub-issues; column definitions and interpretation notes follow the table
- **Engineering Cost by US Region** — the same acceleration math at every regional rate, with savings vs. estimate
- **Timeline Analysis** — calendar view of created → started → closed per issue; pre-work lag and in-flight duration; detailed methodology notes on epic vs. sub-issue timing and parallel fan-out leverage

**Key metrics:**
- **Engaged Hours** = session minutes + human review time (visible chat words ÷ WPM × overlap factor)
- **Acceleration ratio** = Estimate ÷ Engaged Hours
- **Human Leverage** = Estimate ÷ human-only engagement time (orchestrator + solo sessions, agent time excluded)
- **Three cost baselines**: budget mid-level · solo senior (60% efficiency) · enterprise team (50% + 30% coordination overhead)

The report is print-optimized: high-contrast colors on dark banners, reduced ink usage on background fills, and page numbers in the lower-right corner. Output is landscape Letter PDF (or HTML with `--html`).

This makes AI productivity legible to stakeholders. Not "we used AI" — but "we delivered 82 estimated hours in 11 engaged hours at `$800` instead of `$14,000`."

### All Flags

| Flag | Description |
|---|---|
| `--html` | Emit HTML only, skip PDF (no puppeteer required) |
| `--state closed\|open\|all` | Filter by issue state (default: `all`) |
| `--from YYYY-MM-DD` | Only issues closed on or after this date |
| `--to YYYY-MM-DD` | Only issues closed on or before this date |
| `--issues 10,11,12` | Limit to specific issue numbers |
| `--role mid\|senior\|staff` | Engineer level for cost table (default: `mid`) |
| `--solo-role mid\|senior\|staff` | Role for solo-engineer baseline (default: `senior`) |
| `--region <id>` | Region ID from `regional-rates.json` (default: `national`) |
| `--reading-wpm N` | Override reading WPM for context-word time (default: `180`) |
| `--chat-words N` | Add extra context words not yet logged to any issue |
| `--title "..."` | Custom report heading |
| `--output ./path/report` | Output base path without extension |
| `--project-id PVT_...` | Override GitHub Projects V2 node ID |

See [docs/guides/ai-value-framework.md](docs/guides/ai-value-framework.md) for the full ROI methodology.

---

## Configuration

Config is stored in `.ai-task-manager/task-tracker.json` (project-local, committed) and `~/.ai-task-manager/task-tracker-config.json` (user-global). Legacy `~/.claude/task-tracker-config.json` is still read as a fallback. Project values override user-global; both override defaults.

Run the interactive interview to review and set everything:

```
/task config init
```

Or set individual values:

```
/task config repo myorg/my-project
/task config assignee @me
/task config pickupDirective true
```

### User Settings

| Key | Default | Description |
|---|---|---|
| `repo` | `''` | GitHub repo (`owner/repo` format) — required |
| `assignee` | `'@me'` | Assignee for issues created via `/task new` |
| `defaultLabels` | `[]` | Labels applied to every new issue |
| `wpm` | `180` | Your reading speed — used for context-word time calculation |
| `autoEndOnSwitch` | `true` | Auto-close previous task when switching |
| `idleThresholdMinutes` | `5` | Gap length before time stops counting as active |
| `recordWallClock` | `true` | Record wall-clock time in addition to active time |
| `pickupDirective` | `true` | Inject Pickup Directive block into new issues |
| `hookNetworkTimeoutMs` | `2000` | GitHub API timeout from hooks |

### Internal Settings (set by `init`)

| Key | Description |
|---|---|
| `projectId` | GitHub Projects V2 node ID |
| `kanbanFieldId` | Status field ID |
| `kanbanOption*` | Kanban state option IDs (Backlog/Ready/InProgress/InReview/Done) |
| `sizeFieldId` | Size field ID |
| `sequenceFieldId` | Sequence field ID (numeric) |
| `priorityFieldId` | Priority field ID |
| `priorityOption*` | Priority option IDs (P0/P1/P2) |
| `fieldEstimate` | Estimate field ID |

---

## Permissions

`install` adds auto-allow rules to `.claude/settings.json` so orchestration runs hands-free. During backlog creation, every shell command executes without a prompt:

| Rule | What it covers |
|---|---|
| `Bash(gh issue create*)` | Issue creation |
| `Bash(gh api graphql*)` | Project field mutations, sub-issue linking |
| `Bash(gh label create*)` | Label setup |
| `Bash(gh project item-edit*)` | Size, Sequence, Estimate, Priority fields |
| `Bash(cat > /tmp/*)` | Issue body temp files |
| `Bash(node */task-tracker.mjs*)` | All `/task` verbs |
| `Bash(*/move-state.sh*)` | Kanban state transitions |
| `Bash(*/set-priority.sh*)` | Priority setting |

All mutations are scoped to the issues being created or updated in the current project. Nothing reaches outside your configured repo and project board.

To review each invocation manually, remove the rules from `.claude/settings.json`.

---

## Session Management

### `/compact` vs `/clear`

Default to `/compact`. It summarizes your session, keeps hooks active, and costs ~25× fewer tokens than a cold reload.

| | `/compact` | `/clear` |
|---|---|---|
| Token cost | ~2k (summary) | ~50k (full reload) |
| Hooks | Fires PreCompact + PostCompact | Bypasses all hooks |
| Timing data | Flushed automatically | Lost if not manually paused |
| When to use | Same task, same thread | Completely different context |

**Before `/clear`,** always flush first:

```
/task pause
/clear
```

### One Session Per Workspace

The state file (`.ai-task-manager/task-tracker-state.json`) is workspace-scoped. Two simultaneous agent sessions in the same directory will corrupt each other's word-count baseline. Timing (minutes) stays correct; only Delta Words is affected.

**Rule:** only run `/task` commands from one session at a time. Treat any second session as read-only.

---

## Helper Scripts

| Script | Description |
|---|---|
| `scripts/gh/move-state.sh <issue#> <state> [--item-id <id>]` | Move issue to Kanban state (backlog/ready/in-progress/in-review/done). Pass `--item-id` to skip the GraphQL lookup when you already have the project item ID. |
| `scripts/gh/set-priority.sh <issue#> <priority> [--cascade]` | Set P0/P1/P2 priority. `--cascade` applies to all sub-issues too. |

Both scripts read all IDs from `.ai-task-manager/task-tracker.json`. No manual ID management.

---

## Troubleshooting

**`task-tracker not configured`** — Run `npx ai-task-manager init`.

**`Issue #N not found in project`** — The issue hasn't been added to your GitHub Project board. Open the issue on GitHub and add it, or check that `repo` in your config matches the project owner.

**`gh: command not found`** — Install the GitHub CLI: [cli.github.com](https://cli.github.com)

**Timing not appearing on issues** — Verify hooks are registered in `.claude/settings.json` (the install command adds them). Run `gh auth status` to confirm authentication.

**Backlog creation stalls on a permission prompt** — Check that your `.claude/settings.json` includes the `gh api graphql*` and `gh issue create*` allow rules. See [Permissions](#permissions) above.

---

## Design and References

| Document | Contents |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Full design spec — data model, state file format, timing comment structure, hook behavior |
| [docs/guides/workflow.md](docs/guides/workflow.md) | GitHub Issues, Kanban, estimates, and cleanup — full workflow rules |
| [docs/guides/ai-value-framework.md](docs/guides/ai-value-framework.md) | ROI methodology — how Engaged Hours, acceleration, and cost tables are calculated |
| [docs/guides/settings-guide.md](docs/guides/settings-guide.md) | Recommended Claude Code settings for this tool |

---

## License

MIT
