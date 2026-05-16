# Onboarding Reference

Reference tables previously embedded in `CLAUDE.md`. Read on demand when picking a skill for a task or locating a file in the repo.

## Recommended Skills (Superpowers)

| Skill                                        | When to use                                         |
| -------------------------------------------- | --------------------------------------------------- |
| `superpowers:brainstorming`                  | Before any creative or architectural work           |
| `superpowers:writing-plans`                  | Before implementation — get to 95% confidence first |
| `superpowers:executing-plans`                | Execute an approved implementation plan             |
| `superpowers:subagent-driven-development`    | Parallel implementation with multiple agents        |
| `superpowers:dispatching-parallel-agents`    | Independent tasks that can run concurrently         |
| `superpowers:systematic-debugging`           | Any bug or test failure                             |
| `superpowers:verification-before-completion` | Before claiming work is done                        |
| `superpowers:requesting-code-review`         | After completing a logical chunk                    |
| `superpowers:finishing-a-development-branch` | After all tasks complete — wrap up the branch       |
| `superpowers:using-git-worktrees`            | Feature work that needs isolation                   |
| `superpowers:test-driven-development`        | When implementing testable features                 |

## Key Files

| File                                        | Role                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `bin/cli.mjs`                               | npm package CLI — `install` and `init` commands                                   |
| `skill/SKILL.md`                            | Claude Code skill definition (copied to `.claude/skills/task/` on install)        |
| `hooks/task-tracker.sh`                     | Hook dispatcher for SessionStart/PreCompact/PostCompact                           |
| `scripts/task-tracker/task-tracker.mjs`     | Main CLI entry, dispatches verbs                                                  |
| `scripts/task-tracker/config.mjs`           | Config loader (project > user > defaults)                                         |
| `scripts/gh/move-state.mjs`                 | Move issue to Kanban state                                                        |
| `scripts/gh/set-priority.mjs`               | Set issue priority P0/P1/P2                                                       |
| `scripts/gh/init-project-config.sh`         | Interactive setup: GH auth, project discovery, issue templates                    |
| `docs/DESIGN.md`                            | Full design specification                                                         |
| `docs/guides/workflow.md`                   | GitHub Issues, Kanban, estimates, cleanup — full workflow rules                   |
| `docs/guides/settings-guide.md`             | Recommended Claude Code settings                                                  |
| `docs/guides/ai-value-framework.md`         | ROI measurement model, sizing guide, session log template                         |
| `statusline/statusline.sh`                  | Status line script (CLI only) — installed to `~/.claude/` by `statusline` command |
| `scripts/reports/generate-value-report.mjs` | Generates HTML/PDF value report from GitHub Projects data                         |
| `scripts/reports/value-report-config.json`  | Default config for report (region, role, WPM, output dir)                         |
| `scripts/reports/regional-rates.json`       | Fully-burdened US engineering rates by region                                     |
