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

- **New issues default to UNASSIGNED in Backlog** (#793). `gh issue create` / `/task new` / `create-issue.mjs` no longer inject `--assignee`; assignment is opt-in. Pass an explicit `--assignee <login>` only when you deliberately want to assign. **Exception — defect spawned mid-task:** when you discover a defect while working an issue and file a tracking issue for it, ask the human `[Y|n]` (default **Yes**) whether to self-assign it; on Yes create it with `--assignee @me` (the `assignee` key in `.ai-task-manager/task-tracker.json` is the self-assign target login), on No leave it unassigned.
- Move issues through states: `scripts/gh/move-state.mjs <issue#> <state>`
- Set priority: `scripts/gh/set-priority.mjs <issue#> <priority> [--cascade]`
- Link sub-issues via `addSubIssue` GraphQL mutation. Parent cannot close until all children close.
- **Nesting:** GitHub Projects supports multi-level sub-issue chains (verified live: `#259 → #328 → {#324, #325, #326, #327, #331}`). Use a 2-level structure (sub-epic under a root epic) when a coherent family of work needs its own planning surface inside a larger in-flight epic — e.g. defect chains spawned mid-epic, or deliberate scope-of-scope groupings. The "XL standalone" rule (XL issues are top-level epics, no parent) still applies to new top-level epics; nested sub-epics are an intentional refinement, not the default. See [`docs/guides/sub-issue-nesting.md`](docs/guides/sub-issue-nesting.md).
- Every issue needs `Estimate` (hours) + `Size` set before work starts. No exceptions.
- At issue close: set `Actual Session Time` on board. See `docs/guides/ai-value-framework.md`.

## Commit Attribution

Every `/task`-workflow commit leads its subject with a `[#N]` issue-ID token —
e.g. `[#735] docs(attribution): describe message-based attribution`. The token is
auto-injected (idempotently) and enforced by a subject-line lint gate. Downstream
attribution is **message-based, not SHA-reachability**: `commit-trace`,
`review-preflight`, and `close` locate an issue's deliverable by grepping the
`[#N]` token (`\[#(\d+)\]`) across commit messages, so the branch → PR → trunk
flow attributes correctly even when a deliverable lives on an unmerged branch or
worktree. `close` scopes its query to the trunk ref, so an issue closes only once
its `[#N]` commit is merged and pulled into local trunk. Full contract:
`docs/guides/workflow.md` → Commit Attribution. Source of truth:
`scripts/task-tracker/lib/commit-attribution-format.mjs`.

## Blocked-Task Annotation (mandatory when spawning a defect mid-task)

When work on issue `#A` discovers a defect that must be fixed before `#A` can proceed and you file a new issue `#B` for that defect, you **must immediately** annotate `#A` as blocked by `#B` before doing anything else:

1. Add the `BLOCKED` label to `#A`: `gh issue edit <A> --add-label "BLOCKED"`.
2. Set the project board `Blocked By` field on `#A` to reference `#B` (the field id lives in `.claude/task-tracker.json` under `fieldBlockedBy`; see `docs/guides/workflow.md` → Dependency representation).
3. Write the body marker `<!-- aitm-blocked-by: #B -->` into `#A` (via `mutateIssueBody` or `scripts/task-tracker/verbs/block.mjs <A> --by <B>`).
4. Drive the blocker chain **deepest-first**: finish `#B` (and any defect it itself spawns) to Done before resuming `#A`. When `#B` reaches Done, `pull-next` auto-unparks `#A`. Never close a higher-level issue while one of its blockers is still open.
5. If you neglected to annotate at spawn time and only catch it later, post a correction comment on `#A` recording the omission, then perform steps 1-3 retroactively. Do not silently fix.

This rule applies to every defect-spawn-during-task case — refine-stage, plan-stage, develop-stage, test-stage, review-stage. The mechanism is the same; only the surrounding state differs.

For **how to physically isolate** the blocker fix so `#A` and `#B` merge and close
independently — worktree-per-rung off trunk, deepest-first ascend — follow the
[Blocking-defect isolation dance](docs/guides/workflow.md#blocking-defect-isolation-dance)
in the workflow guide.

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

For issue creation, use `scripts/task-tracker/preflight-issue.mjs` so the DoD and Pickup-Directive tail are stamped correctly.

## Develop-Phase Verification Contract

**Never run `npm run test:all` during Develop.** Full regression runs exclusively at the Test stage (isolated worktree, CI emulation).

In the Develop phase, run instead:

```
node scripts/task-tracker/verify-develop.mjs
```

This script (implemented in #447) enforces lint-first ordering and targeted test execution:

1. `npm run lint:js -- --fix` — auto-fix eslint violations; aborts if unfixable errors remain
2. `npm run format` — prettier auto-format; code is now in final committed shape
3. `git diff --diff-filter=ACMR --name-only HEAD -- '*.test.mjs'` — collect test files changed vs HEAD
4. `node --test <file>` for each collected file; aborts on first failure

If the diff is empty (no test files changed), the script exits 0 with "nothing to verify." Run the script before every commit in Develop.

`npm run test:all` belongs in the VC section of Test-stage issues, not Develop.

## Code Coverage

Coverage is instrumented with [`c8`](https://github.com/bcoe/c8) (#570). The test
runner spawns a separate `node` child per test file, so `c8` — which sets
`NODE_V8_COVERAGE` and merges every child's V8 dump into one aggregated report — is
used instead of Node's per-process `--experimental-test-coverage`.

```
npm run test:coverage        # full (all lanes) — text table + coverage/index.html
npm run test:coverage:fast   # fast lane only — quick local check
```

Config lives in `.c8rc.json` (`all:true` so untested files count as 0%, `src` scoped
to `scripts/`, test/maintenance globs excluded, `text` + `html` reporters). Output goes
to `coverage/` (gitignored). There is no minimum-coverage threshold or CI gate yet, and
coverage is **not** wired into the Test-stage sandbox or `verify-develop.mjs` — run it
manually when you want a coverage snapshot.

---

## Tool Usage Rules

- Use Read, Edit, Write for files. Bash only for: git, npm/node, shell scripts.
- Never search inside `node_modules/`.
- Wrap currency in backticks: `$200`.
- Scratch / staging files for issue bodies, deep-dives, and other transient drafts go in `./.tmp/` (gitignored), under subfolder by purpose: `./.tmp/gh/` (issue bodies), `./.tmp/plan/` (scope/acs/plan-meta), `./.tmp/heal/` (repair scratch), `./.tmp/inspect/` (ad-hoc scripts). Do not write scratch under `.git/`.

## Formatting

- No emojis unless asked.
- No trailing summaries — code speaks for itself.
