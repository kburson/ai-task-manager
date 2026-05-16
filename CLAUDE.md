# Claude Code Instructions — claude-gh-task-manager

## What This Repo Is

An npm package that installs the `/task` Claude Code skill into any project. The skill binds Claude sessions to GitHub issues and auto-logs time + context words to a "⏱ Timing Log" comment on each issue. Requires Node.js v18+ (ES modules) and the GitHub CLI (`gh`).

## Behavior

- Direct, blunt, no filler.
- Give critical feedback without softening.
- Only answer confidently — say "unsure" rather than guess.
- After long explanations or multi-part analysis, stop and wait for user to signal ready. Do not make any changes until you have 95% confidence in what you need to build.
- Ask follow-up questions until that confidence is reached.

## Sub-Agents

Parallel sub-agent fan-out is an explicit, approved operation. Before any `Agent` spawn, name the candidates, estimate parallelism, flag shared files, and get user approval; every agent runs in its own git worktree with a self-contained prompt and explicit STOP conditions. Full rules — worktree requirements, state-machine transitions, gates, drift handling, and post-mortem procedure — in [`docs/guides/parallel-agents.md`](docs/guides/parallel-agents.md).

---

## GitHub Issues & Kanban Workflow

Full rules in `docs/guides/workflow.md`. Quick reference:

- **Always assign new issues to the configured assignee** — every `gh issue create` must include `--assignee <value>`, where `<value>` is the `assignee` key from `.claude/task-tracker.json` (defaults to `@me`, which resolves to the authenticated `gh` user).
- Move issues through states: `scripts/gh/move-state.mjs <issue#> <state>`
- Set priority: `scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]`
- Link sub-issues via `addSubIssue` GraphQL mutation. Parent cannot close until all children close. **Note:** GitHub Projects supports only one level of nesting — sub-issues cannot themselves have sub-issues.
- Every issue needs `Estimate` (hours) + `Size` set before work starts. No exceptions.
- At issue close: set `Actual Session Time` + `Context Length` on board. See `docs/guides/ai-value-framework.md`.

## Cleanup

Full procedure in `docs/guides/workflow.md` → Cleanup Procedure section.
Summary: update docs → update GitHub issues → commit → post-commit updates → value summary (if epic) → `/compact`.

---

## Recommended Claude Settings

See [`docs/guides/settings-guide.md`](docs/guides/settings-guide.md) for full setup.

## Recommended Skills & Key Files

See [`docs/onboarding.md`](docs/onboarding.md) for the Recommended Skills (Superpowers) table and the Key Files index.

## Tool Usage Rules

- Use Read, Edit, Write for files. Bash only for: git, npm/node, shell scripts.
- Never search inside `node_modules/`.
- Wrap currency in backticks: `$200`.
- Scratch / staging files for issue bodies, deep-dives, and other transient drafts go in `./tmp/` (gitignored). Do not write scratch under `.git/`.

## Formatting

- No emojis unless asked.
- No trailing summaries — code speaks for itself.
