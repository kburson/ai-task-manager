# Claude Code Instructions — claude-gh-task-manager

## What This Repo Is

An npm package that installs the `/task` Claude Code skill into any project. The skill binds Claude sessions to GitHub issues and auto-logs time + context words to a "⏱ Timing Log" comment on each issue.

**Source of truth:** This repo was extracted from `kpburson/options-co-pilot` (`ocp-services`). All project-specific hardcoding has been removed and replaced with config-driven values.

---

## Behavior
Direct, blunt, no filler. Give critical feedback without softening. Only answer confidently — say "unsure" rather than guess. After long explanations or multi-part analysis, stop and wait for user to signal ready. Do not make any changes until you have 95% confidence in what you need to build. Ask follow-up questions until that confidence is reached.

## Sub-Agents
Before repetitive independent work, ask if user wants parallel sub-agents — name candidates, estimate parallelism, flag shared files. No spawning without approval. Each agent gets a self-contained prompt with STOP conditions.

---

## GitHub Issues & Kanban Workflow

**Always assign new issues to `kburson`** — every `gh issue create` must include `--assignee kburson`.

If work traces to a GitHub issue, update it inline (not just at cleanup):
- Comment when a sub-phase lands (SHA, what's deferred and why)
- Check off acceptance criteria boxes when met
- Open new issues for follow-on work; cross-link with "Parent:"/"Blocked by:"

**Sub-Issues Hierarchy**: Use native GitHub sub-issues to track epic completion. A parent issue cannot be marked Done until all child issues are complete. Link new issues as sub-issues of their parent epic using the GraphQL `addSubIssue` mutation or the GitHub UI.

**Kanban Board States**: Issues move through Backlog → Ready → In Progress → In Review → Done. Use the helper scripts — they read all IDs from `.claude/task-tracker.json`:
```bash
scripts/gh/move-state.sh <issue#> <state>
# States: backlog | ready | in-progress | in-review | done
```

**Priority Tiers**: Use P0/P1/P2 only. **Sub-issues must share the same Priority as their parent epic.** Always cascade when setting priority on an epic:
```bash
scripts/gh/set-priority.sh <issue#> <priority> [--cascade]
# Priorities: p0 | p1 | p2
```

**Estimates and Size (required)**: Every issue/sub-issue needs both `Estimate` (hours) and `Size` set — mid-level human hours, the ROI value denominator. See `docs/ai-value-framework.md` for the sizing guide and GraphQL mutations.
- Set both fields immediately after `gh issue create`, before any other work.
- At `/task #N` activation: if either field is missing, set both before touching any code.
- Never leave an issue without Estimate and Size — no exceptions.

**Close tracking (required)**: At close, set `Actual Session Time` (minutes) and `Context Length` (words) on the board. Log both in a session comment using the template in `docs/ai-value-framework.md`.

**Update Cadence**: Update issues inline during work AND at cleanup time:
- At each cleanup: move completed sub-issues to Done, update parent issue body with progress, move parent to Done when all children complete
- In git commit messages: reference issue numbers (`fixes #N`) to auto-link commits

Full workflow rules: `docs/workflow.md`.

---

## Cleanup Procedure

When the user says "cleanup", execute in order:

1. **Update any docs** in `docs/` that reflect this session's work
2. **Update GitHub issues** — close completed issues with a resolution comment; open follow-on issues; post session log (date, active minutes, context words); set `Actual Session Time` + `Context Length` fields
3. **Commit** — stage all changes and commit with a descriptive message referencing issue numbers
4. **Post-commit issue updates** — after commit lands: check off acceptance criteria, post SHA + what landed + what's deferred, cross-link follow-on issues
5. **Feature value summary** — if a feature/epic completed, generate value summary using `docs/ai-value-framework.md` template; post as a comment on the parent epic
6. **Compact** — `/compact` to free context for the next phase

---

## Recommended Claude Settings

See `docs/settings-guide.md` for full setup. Key settings for this project:

- **autoCompactWindow**: `150000` — auto-compact at 150k tokens (keeps sessions from bloating)
- **outputStyle**: `Concise`
- **Superpowers plugin**: required — install via Claude Code settings
- **Status line**: shows active `/task` issue in the Claude Code header

---

## Recommended Skills (Superpowers)

Install the [Superpowers plugin](https://github.com/anthropics/claude-code-superpowers) in Claude Code. These skills apply directly to this workflow:

| Skill | When to use |
|---|---|
| `superpowers:brainstorming` | Before any creative or architectural work |
| `superpowers:writing-plans` | Before implementation — get to 95% confidence first |
| `superpowers:executing-plans` | Execute an approved implementation plan |
| `superpowers:subagent-driven-development` | Parallel implementation with multiple agents |
| `superpowers:dispatching-parallel-agents` | Independent tasks that can run concurrently |
| `superpowers:systematic-debugging` | Any bug or test failure |
| `superpowers:verification-before-completion` | Before claiming work is done |
| `superpowers:requesting-code-review` | After completing a logical chunk |
| `superpowers:finishing-a-development-branch` | After all tasks complete — wrap up the branch |
| `superpowers:using-git-worktrees` | Feature work that needs isolation |
| `superpowers:test-driven-development` | When implementing testable features |

---

## Stack

- Node.js v18+ (ES modules, `"type": "module"`)
- No framework, no runtime dependencies — pure Node.js + shell
- GitHub CLI (`gh`) for all GitHub API calls

## Key Files

| File | Role |
|---|---|
| `bin/cli.mjs` | npm package CLI — `install` and `init` commands |
| `skill/SKILL.md` | Claude Code skill definition (copied to `.claude/skills/task/` on install) |
| `hooks/task-tracker.sh` | Hook dispatcher for SessionStart/PreCompact/PostCompact |
| `scripts/task-tracker/task-tracker.mjs` | Main CLI entry, dispatches verbs |
| `scripts/task-tracker/config.mjs` | Config loader (project > user > defaults) |
| `scripts/gh/move-state.sh` | Move issue to Kanban state (reads IDs from config) |
| `scripts/gh/set-priority.sh` | Set issue priority P0/P1/P2 (reads IDs from config) |
| `scripts/gh/init-project-config.sh` | Interactive setup: GH auth, project discovery, issue templates |
| `docs/DESIGN.md` | Full design specification |
| `docs/workflow.md` | GitHub Issues, Kanban, estimates, cleanup — full workflow rules |
| `docs/settings-guide.md` | Recommended Claude Code settings |
| `docs/ai-value-framework.md` | ROI measurement model, sizing guide, session log template |
| `docs/implementation-plan.md` | Original implementation plan from extraction session |

## Config System

All GitHub-specific IDs are stored in the **target project's** `.claude/task-tracker.json` (not in this repo). The config file is populated by `npx claude-gh-task-manager init`.

Config precedence: project-local > user-global (`~/.claude/task-tracker-config.json`) > defaults.

Key config fields (all start empty, set by init):
- `repo` — `owner/repo` format
- `projectId` — GitHub Projects V2 node ID
- `kanbanFieldId`, `kanbanOption*` — Kanban board state IDs
- `priorityFieldId`, `priorityOption*` — Priority field IDs
- `fieldActualMinutes`, `fieldContextWords`, `fieldActualHours` — timing write-back fields
- `assignee` — defaults to `@me`

## Testing

No test framework — run directly with node:

```bash
# Run all tests
for f in scripts/task-tracker/tests/*.test.mjs; do
  TT_SKIP_NETWORK=1 CLAUDE_PROJECT_DIR=/tmp node "$f"
done

# Smoke test the CLI
TT_SKIP_NETWORK=1 CLAUDE_PROJECT_DIR=$(pwd) node scripts/task-tracker/task-tracker.mjs status

# Test install into a temp dir
node bin/cli.mjs install --target /tmp/test-install
```

## What's Done (as of session 2026-04-25)

- [x] All 25 files extracted and committed (commit `74bb707`)
- [x] All hardcoded IDs removed from `config.mjs`, `move-state.sh`, `set-priority.sh`, `skill/SKILL.md`, `task-tracker.mjs`
- [x] `bin/cli.mjs` — `install` and `init` commands working
- [x] `init-project-config.sh` — GH auth, project listing/creation, field discovery, issue templates
- [x] Issue templates: `.github/ISSUE_TEMPLATE/task.yml` and `bug.yml` (written to target project by init)
- [x] All 7 tests passing
- [x] `move-state.sh` errors with `Run: npx claude-gh-task-manager init` when unconfigured

## What's Next

- [ ] Push to GitHub remote (`git push origin trunk`)
- [ ] Publish to npm (`npm publish`)
- [ ] `npx claude-gh-task-manager uninstall` command
- [ ] `npx claude-gh-task-manager update` command (re-copies scripts without touching config)
- [ ] GitHub Action to run tests on PR
- [ ] Make init org-aware (currently tries user then org for project node ID lookup)

## Tool Usage Rules

- Use Read, Edit, Write for files. Bash only for: git, npm/node, shell scripts.
- Never search inside `node_modules/`.
- Wrap currency in backticks: `$200`.

## Formatting

- No emojis unless asked.
- No trailing summaries — code speaks for itself.
