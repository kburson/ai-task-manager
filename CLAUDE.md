# Claude Code Instructions — claude-gh-task-manager

## What This Repo Is

An npm package that installs the `/task` Claude Code skill into any project. The skill binds Claude sessions to GitHub issues and auto-logs time + context words to a "⏱ Timing Log" comment on each issue.

**Source of truth:** Extracted from `kpburson/options-co-pilot` (`ocp-services`). All project-specific hardcoding removed and replaced with config-driven values.

---

## Behavior

Direct, blunt, no filler. Give critical feedback without softening. Only answer confidently — say "unsure" rather than guess. After long explanations or multi-part analysis, stop and wait for user to signal ready. Do not make any changes until you have 95% confidence in what you need to build. Ask follow-up questions until that confidence is reached.

## Sub-Agents

Before repetitive independent work, ask if user wants parallel sub-agents — name candidates, estimate parallelism, flag shared files. No spawning without approval. Each agent gets a self-contained prompt with STOP conditions.

---

## GitHub Issues & Kanban Workflow

Full rules in `docs/workflow.md`. Quick reference:

- **Always assign new issues to `kburson`** — every `gh issue create` must include `--assignee kburson`.
- Move issues through states: `scripts/gh/move-state.sh <issue#> <state>`
- Set priority: `scripts/gh/set-priority.sh <issue#> <priority> [--cascade]`
- Link sub-issues via `addSubIssue` GraphQL mutation. Parent cannot close until all children close.
- Every issue needs `Estimate` (hours) + `Size` set before work starts. No exceptions.
- At issue close: set `Actual Session Time` + `Context Length` on board. See `docs/ai-value-framework.md`.

## Cleanup

Full procedure in `docs/workflow.md` → Cleanup Procedure section. Summary: update docs → update GitHub issues → commit → post-commit updates → value summary (if epic) → `/compact`.

---

## Recommended Claude Settings

See `docs/settings-guide.md` for full setup. Key settings:

- **autoCompactWindow**: `150000` — auto-compact at 150k tokens
- **outputStyle**: `Concise`
- **model**: `claude-sonnet-4-6`
- **Superpowers plugin**: required — install via Claude Code settings
- **Status line**: shows active `/task` issue in the Claude Code header

## Recommended Skills (Superpowers)

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
| `scripts/gh/move-state.sh` | Move issue to Kanban state |
| `scripts/gh/set-priority.sh` | Set issue priority P0/P1/P2 |
| `scripts/gh/init-project-config.sh` | Interactive setup: GH auth, project discovery, issue templates |
| `docs/DESIGN.md` | Full design specification |
| `docs/workflow.md` | GitHub Issues, Kanban, estimates, cleanup — full workflow rules |
| `docs/settings-guide.md` | Recommended Claude Code settings |
| `docs/ai-value-framework.md` | ROI measurement model, sizing guide, session log template |
| `scripts/reports/generate-value-report.mjs` | Generates HTML/PDF value report from GitHub Projects data |
| `scripts/reports/value-report-config.json` | Default config for report (region, role, WPM, output dir) |
| `scripts/reports/regional-rates.json` | Fully-burdened US engineering rates by region |
| `plans/roadmap.md` | What's done, what's next, publishing checklist |

## Tool Usage Rules

- Use Read, Edit, Write for files. Bash only for: git, npm/node, shell scripts.
- Never search inside `node_modules/`.
- Wrap currency in backticks: `$200`.

## Formatting

- No emojis unless asked.
- No trailing summaries — code speaks for itself.
