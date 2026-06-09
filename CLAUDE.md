# Claude Code Instructions — claude-gh-task-manager

## What This Repo Is

An npm package that installs the `/task` Claude Code skill into any project. The skill binds Claude sessions to GitHub issues and auto-logs time + context words to a "⏱ Timing Log" comment on each issue. Requires Node.js v18+ (ES modules) and the GitHub CLI (`gh`).

## Behavior

- Direct, blunt, no filler.
- Give critical feedback without softening.
- Only answer confidently — say "unsure" rather than guess.
- After long explanations or multi-part analysis, stop and wait for user to signal ready. Do not make any changes until you have 95% confidence in what you need to build.
- Ask follow-up questions until that confidence is reached.

## Conversation-Queue Checkpoint

Before any state transition, **pause and re-read the most recent user messages** in the current conversation. If the latest user message is unacknowledged, or contains a question or instruction not yet addressed, halt and respond first — do not advance state. The goal is to prevent steam-rolling past queued input.

There is no programmatic signal for "unread chat queue"; this is behavioral self-discipline at high-cost moments.

Trigger points (must checkpoint before each):

- Before `/task` state moves (`refine`, `plan`, `develop`, `test`, `review`, `done`).
- Before switching active issue (`/task #N` when already bound to a different `#M`).
- Before closing an issue.
- Before parallel-agent fan-out.

## Sub-Agents

Parallel sub-agent fan-out is an explicit, approved operation. Before any `Agent` spawn, name the candidates, estimate parallelism, flag shared files, and get user approval; every agent runs in its own git worktree with a self-contained prompt and explicit STOP conditions. Full rules — worktree requirements, state-machine transitions, gates, drift handling, and post-mortem procedure — in [`docs/guides/parallel-agents.md`](docs/guides/parallel-agents.md).

---

## GitHub Issues & Kanban Workflow

Full rules in `docs/guides/workflow.md`. Quick reference:

- **Always assign new issues to the configured assignee** — every `gh issue create` must include `--assignee <value>`, where `<value>` is the `assignee` key from `.claude/task-tracker.json` (defaults to `@me`, which resolves to the authenticated `gh` user).
- Move issues through states: `scripts/gh/move-state.mjs <issue#> <state>`
- Set priority: `scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]`
- Link sub-issues via `addSubIssue` GraphQL mutation. Parent cannot close until all children close.
- **Nesting:** GitHub Projects supports multi-level sub-issue chains (verified live: `#259 → #328 → {#324, #325, #326, #327, #331}`). Use a 2-level structure (sub-epic under a root epic) when a coherent family of work needs its own planning surface inside a larger in-flight epic — e.g. defect chains spawned mid-epic, or deliberate scope-of-scope groupings. The "XL standalone" rule (XL issues are top-level epics, no parent) still applies to new top-level epics; nested sub-epics are an intentional refinement, not the default. See [`docs/guides/sub-issue-nesting.md`](docs/guides/sub-issue-nesting.md).
- Every issue needs `Estimate` (hours) + `Size` set before work starts. No exceptions.
- At issue close: set `Actual Session Time` on board. See `docs/guides/ai-value-framework.md`.

## Blocked-Task Annotation (mandatory when spawning a defect mid-task)

When work on issue `#A` discovers a defect that must be fixed before `#A` can proceed and you file a new issue `#B` for that defect, you **must immediately** annotate `#A` as blocked by `#B` before doing anything else:

1. Add the `BLOCKED` label to `#A`: `gh issue edit <A> --add-label "BLOCKED"`.
2. Set the project board `Blocked By` field on `#A` to reference `#B` (the field id lives in `.claude/task-tracker.json` under `fieldBlockedBy`; see `docs/guides/workflow.md` → Dependency representation).
3. Write the body marker `<!-- aitm-blocked-by: #B -->` into `#A` (via `mutateIssueBody` or `scripts/task-tracker/verbs/block.mjs <A> --by <B>`).
4. Drive the blocker chain **deepest-first**: finish `#B` (and any defect it itself spawns) to Done before resuming `#A`. When `#B` reaches Done, `pull-next` auto-unparks `#A`. Never close a higher-level issue while one of its blockers is still open.
5. If you neglected to annotate at spawn time and only catch it later, post a correction comment on `#A` recording the omission, then perform steps 1-3 retroactively. Do not silently fix.

This rule applies to every defect-spawn-during-task case — refine-stage, plan-stage, develop-stage, test-stage, review-stage. The mechanism is the same; only the surrounding state differs.

## Cleanup

Full procedure in `docs/guides/workflow.md` → Cleanup Procedure section.
Summary: update docs → update GitHub issues → commit → post-commit updates → value summary (if epic) → `/compact`.

---

## Recommended Claude Settings

See [`docs/guides/settings-guide.md`](docs/guides/settings-guide.md) for full setup.

## Recommended Skills & Key Files

See [`docs/onboarding.md`](docs/onboarding.md) for the Recommended Skills (Superpowers) table and the Key Files index.

## Route issue bodies through scripts

Never hand-roll issue bodies and never write them with `gh issue edit --body` / `--body-file` from Bash. Every issue-body write must flow through `mutateIssueBody({issueNumber, repo, mutate})` (`scripts/task-tracker/lib/issue-body-mutate.mjs`) so the live body is fetched in the same transaction as the write. Two enforcement layers backstop this contract:

1. **Bash-level hard refusal (#361).** The PreToolUse Bash hook (`scripts/task-tracker/bash-guard.mjs`) calls `gh-edit-guard.evaluateGhEdit`, which refuses every `gh issue edit <N> --body <s>` and `gh issue edit <N> --body-file <p>` regardless of diff content. Label/title/milestone/assignee edits still pass.
2. **Helper-level MarkerLossError (#361).** Inside `mutateIssueBody`, the caller's `mutate` output is diffed against the freshly-fetched base via `findLostMarkers` from `lib/body-invariants.mjs`. If any invariant marker (`aitm-fields`, `aitm-body-version`, `aitm-stage-rollup`, `aitm-refine-complete`, `aitm-plan-approved`, `aitm-deep-dive-posted`, `aitm-deep-dive-complete`, `aitm-last-known-state`, `aitm-last-known-state-ts`, or any `aitm-entered-<stage>`) disappears, the call throws `MarkerLossError` listing each lost marker. Pass `allowMarkerLoss: true` only for the rare legitimate-strip case (correcting a typo'd marker, intentional reset); the override is explicit and grep-able for audit.

For issue creation, use `scripts/task-tracker/lib/preflight-issue.mjs` so the DoD and Pickup-Directive tail are stamped correctly.

## Tool Usage Rules

- Use Read, Edit, Write for files. Bash only for: git, npm/node, shell scripts.
- Never search inside `node_modules/`.
- Wrap currency in backticks: `$200`.
- Scratch / staging files for issue bodies, deep-dives, and other transient drafts go in `./.tmp/` (gitignored), under subfolder by purpose: `./.tmp/gh/` (issue bodies), `./.tmp/plan/` (scope/acs/plan-meta), `./.tmp/heal/` (repair scratch), `./.tmp/inspect/` (ad-hoc scripts). Do not write scratch under `.git/`.

## Formatting

- No emojis unless asked.
- No trailing summaries — code speaks for itself.
