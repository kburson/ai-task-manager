# Claude Code Instructions — claude-gh-task-manager

## What This Repo Is

An npm package that installs the `/task` Claude Code skill into any project. The skill binds Claude sessions to GitHub issues and auto-logs time + context words to a "⏱ Timing Log" comment on each issue.

**Source of truth:** This repo was extracted from `kpburson/options-co-pilot` (`ocp-services`). All project-specific hardcoding has been removed and replaced with config-driven values.

## Behavior
Direct, blunt, no filler. Give critical feedback without softening. Only answer confidently — say "unsure" rather than guess. Do not make any changes until you have 95% confidence in what you need to build. Ask follow-up questions until that confidence is reached.

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
- [ ] Consider: `npx claude-gh-task-manager uninstall` command
- [ ] Consider: `npx claude-gh-task-manager update` command (re-copies scripts without touching config)
- [ ] Consider: GitHub Action to run tests on PR
- [ ] Consider: making init script work for orgs (currently tries user then org for project node ID)

## Tool Usage Rules

- Use Read, Edit, Write for files. Bash only for: git, npm/node, shell scripts.
- Never search inside `node_modules/`.
- Wrap currency in backticks: `$200`.

## Formatting

- No emojis unless asked.
- No trailing summaries — code speaks for itself.
