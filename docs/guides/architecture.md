# Architecture — The Script-Backed Skill Pattern

## Why this doc exists

A reader landing in this repo for the first time sees a Claude skill — a markdown file under [`skill/SKILL.md`](../../skill/SKILL.md) — and then trips over a much larger Node CLI surface under [`scripts/`](../../scripts/). The natural question is "why is there so much code behind what looks like a markdown skill?"

The answer is that `/task` is not a typical Claude skill. Most published skills are pure prose: a SKILL.md of rules and checklists that the model is expected to read and follow. This skill inverts that: the markdown is a thin routing layer, and the scripts are the system of record. State transitions, gate enforcement, issue shape, timing logs, and audit trails all live in code that the model invokes — not in instructions the model is asked to remember.

This document names the pattern, places it against other Claude-skill architectures, and is honest about where it still leaks. Audience is contributors trying to extend this codebase, and future Claude sessions trying to understand the design after compaction has eroded the prose context.

For _what_ the skill does internally — config schema, state file shape, fleet registry, timing comment structure — see [`docs/DESIGN.md`](../DESIGN.md). That doc is the internal spec; this one is the architectural philosophy.

## The pattern in one sentence

**Thin prose skill + script-backed enforcement: the markdown routes the model to scripts; the scripts own state, gates, and audit trail.**

Prose _instructs_. Scripts _enforce_. The model can forget a rule but cannot bypass a script that is the only writer of the state the rule was protecting.

## The spectrum of Claude skill architectures

Enforcement strength increases left-to-right, but so does coupling to a specific harness and a specific repo.

```text
pure prompt  →  script-augmented  →  script-backed + routed  →  hook-enforced  →  harness-native
```

| Tier                       | Example skills                                                                                            | What enforces the rules                                                                    | Bypass-proof?                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Pure prompt                | `code-review`, `security-review`, `superpowers:test-driven-development`, most `engineering:*`, `design:*` | The model's compliance with the SKILL.md text                                              | No — silent skip is the default failure mode                                         |
| Script-augmented utilities | `anthropic-skills:pdf`, `xlsx`, `docx`, `pptx`, `skill-creator`                                           | Helper scripts the model _chooses_ to call; the model can ignore them and hand-roll output | No — scripts are convenience, not gates                                              |
| **Script-backed + routed** | **This repo (`/task`)**                                                                                   | **CLI scripts own state and gates; prose routes the model to them**                        | **Mostly — model can still bypass by calling `gh` directly. Routing is behavioral.** |
| Hook-enforced              | Claude Code `settings.json` `PreToolUse` / `Stop` hooks                                                   | The harness blocks or rewrites tool calls before they execute                              | Yes within the harness — model literally cannot make the blocked call                |
| Harness-native             | MCP servers + hooks combined                                                                              | Tool surface and execution policy both live outside the model                              | Yes — the model only sees the surface the harness exposes                            |

The tradeoff at each step right is **less portable**. A pure-prompt skill runs anywhere. A script-backed skill needs Node + `gh` + a repo to install into. A hook-enforced workflow needs the user's `settings.json` cooperating. A harness-native workflow only runs on the harness it was built for.

## What the prose layer is in this repo

Small, intentionally. Total prose is well under a thousand lines.

| File                                                                                       | Lines | Role                                                                                               |
| ------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------- |
| [`skill/SKILL.md`](../../skill/SKILL.md)                                                   | 21    | Legacy compatibility entry; carries the `aitm-skill-version` marker; points at the router          |
| [`skill/shared/router.md`](../../skill/shared/router.md)                                   | 79    | Command dispatch — maps `/task <verb>` to verb scripts                                             |
| [`skill/shared/rules/bind.md`](../../skill/shared/rules/bind.md)                           | 48    | Rule: `/task #N` bind is mandatory before any verb                                                 |
| [`skill/shared/rules/parallel.md`](../../skill/shared/rules/parallel.md)                   | 143   | Rule: parallel-agent dispatch — worktree, gates, prompt contract                                   |
| [`skill/shared/rules/plan-mode-backlog.md`](../../skill/shared/rules/plan-mode-backlog.md) | 131   | Rule: backlog grooming under plan mode                                                             |
| [`skill/shared/rules/config-init.md`](../../skill/shared/rules/config-init.md)             | 53    | Rule: config bootstrapping                                                                         |
| [`skill/shared/rules/hooks.md`](../../skill/shared/rules/hooks.md)                         | 45    | Rule: hook behavior (PreCompact / PostCompact / SessionStart)                                      |
| [`skill/shared/rules/commit-trail.md`](../../skill/shared/rules/commit-trail.md)           | 45    | Rule: commit trail comment shape                                                                   |
| [`skill/shared/rules/review.md`](../../skill/shared/rules/review.md)                       | 67    | Rule: review state — including the full-auto audit-comment requirement                             |
| [`skill/shared/rules/state-walk.md`](../../skill/shared/rules/state-walk.md)               | 56    | Rule: the eight-state walk (Backlog → Refine → R4P → Plan → Develop → Test → Review → Done)        |
| [`skill/shared/rules/close.md`](../../skill/shared/rules/close.md)                         | 81    | Rule: close procedure                                                                              |
| [`skill/shared/rules/preferences.md`](../../skill/shared/rules/preferences.md)             | 35    | Rule: user preferences (no PR push for solo project, etc.)                                         |
| [`templates/pickup-directive.md`](../../templates/pickup-directive.md)                     | —     | Issue-body tail template — kept as a template so scripts inject it, the model doesn't hand-roll it |
| [`AGENTS.md`](../../AGENTS.md)                                                             | —     | Sub-agent contract — what a dispatched agent reads to know its job                                 |
| [`skill/adapters/claude/SKILL.md`](../../skill/adapters/claude/SKILL.md)                   | —     | Claude Code adapter shim                                                                           |
| [`skill/adapters/codex/SKILL.md`](../../skill/adapters/codex/SKILL.md)                     | —     | Codex adapter shim                                                                                 |

Every rule above is short enough to fit in the model's context after a heavy compaction. The work happens in the scripts.

## What the script layer is

Grouped by responsibility. This is the substantive surface — the layer that survives compaction because it does not live in the model's context at all.

### State mutation (single-writer principle)

| Script                                                                                           | Responsibility                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`scripts/gh/move-state.mjs`](../../scripts/gh/move-state.mjs)                                   | **The only writer of the GitHub Projects `Status` field.** Every verb that changes state delegates to this one.                                   |
| [`scripts/task-tracker/state.mjs`](../../scripts/task-tracker/state.mjs)                         | Local tracker state read/write                                                                                                                    |
| [`scripts/task-tracker/lib/lifecycle-policy/`](../../scripts/task-tracker/lib/lifecycle-policy/) | Legal-transition table (`validateTransition`, `forwardTarget`, `backwardTargets`, `stateIds`) — rejects illegal moves before any side effect runs |

Per-state entry/exit guards (`guard-registry.mjs`, `state-bootstrap.mjs`, `states/*.mjs`) are a separate layer from the transition table above — see [`architecture-overview.md` §3](architecture-overview.md#3-the-state-machine-and-its-guards) and [`guard-architecture.md`](guard-architecture.md) for the canonical map rather than duplicating it here.

### Gates / verbs

[`scripts/task-tracker/verbs/`](../../scripts/task-tracker/verbs/) holds one script per `/task` verb, plus a handful of tokens (`log`, `migrate`, `words-count`) handled inline in `task-tracker.mjs` with no dedicated verb file. Each verb verifies preconditions, then delegates state writes to `move-state.mjs`. Every one of the 51 `case` labels in `task-tracker.mjs`'s dispatch switch is accounted for below, grouped by responsibility:

- Lifecycle: [`refine.mjs`](../../scripts/task-tracker/verbs/refine.mjs), [`plan.mjs`](../../scripts/task-tracker/verbs/plan.mjs), [`plan-approve.mjs`](../../scripts/task-tracker/verbs/plan-approve.mjs), [`approve.mjs`](../../scripts/task-tracker/verbs/approve.mjs), [`promote.mjs`](../../scripts/task-tracker/verbs/promote.mjs) (aliased `next`), [`demote.mjs`](../../scripts/task-tracker/verbs/demote.mjs), [`review.mjs`](../../scripts/task-tracker/verbs/review.mjs), [`reject.mjs`](../../scripts/task-tracker/verbs/reject.mjs), [`close.mjs`](../../scripts/task-tracker/verbs/close.mjs) (aliased `end`), [`pull-next.mjs`](../../scripts/task-tracker/verbs/pull-next.mjs), [`park.mjs`](../../scripts/task-tracker/verbs/park.mjs), [`block.mjs`](../../scripts/task-tracker/verbs/block.mjs), [`unblock.mjs`](../../scripts/task-tracker/verbs/unblock.mjs), [`chore-mode.mjs`](../../scripts/task-tracker/verbs/chore-mode.mjs), [`supersede.mjs`](../../scripts/task-tracker/verbs/supersede.mjs), [`reconcile.mjs`](../../scripts/task-tracker/verbs/reconcile.mjs), [`epic-reconcile.mjs`](../../scripts/task-tracker/verbs/epic-reconcile.mjs)
- Session: [`start.mjs`](../../scripts/task-tracker/verbs/start.mjs), [`pause.mjs`](../../scripts/task-tracker/verbs/pause.mjs), [`resume.mjs`](../../scripts/task-tracker/verbs/resume.mjs), [`stop.mjs`](../../scripts/task-tracker/verbs/stop.mjs), [`update.mjs`](../../scripts/task-tracker/verbs/update.mjs), [`status.mjs`](../../scripts/task-tracker/verbs/status.mjs), [`board.mjs`](../../scripts/task-tracker/verbs/board.mjs), [`switch.mjs`](../../scripts/task-tracker/verbs/switch.mjs) (invoked as `/task #N`, not a literal `case` label)
- Coordination: [`auto.mjs`](../../scripts/task-tracker/verbs/auto.mjs), [`fleet.mjs`](../../scripts/task-tracker/verbs/fleet.mjs), [`discover.mjs`](../../scripts/task-tracker/verbs/discover.mjs) (aliased `brainstorm`), [`decompose-check.mjs`](../../scripts/task-tracker/verbs/decompose-check.mjs), [`split-plan.mjs`](../../scripts/task-tracker/verbs/split-plan.mjs)
- Issue creation & evidence markers: [`new.mjs`](../../scripts/task-tracker/verbs/new.mjs), [`save-plan.mjs`](../../scripts/task-tracker/verbs/save-plan.mjs), [`save-draft.mjs`](../../scripts/task-tracker/verbs/save-draft.mjs), [`cancel.mjs`](../../scripts/task-tracker/verbs/cancel.mjs), [`user-story.mjs`](../../scripts/task-tracker/verbs/user-story.mjs) (aliased `story`), [`kind.mjs`](../../scripts/task-tracker/verbs/kind.mjs), [`dod-stamp.mjs`](../../scripts/task-tracker/verbs/dod-stamp.mjs), [`ac-stamp.mjs`](../../scripts/task-tracker/verbs/ac-stamp.mjs), [`check.mjs`](../../scripts/task-tracker/verbs/check.mjs) (exports the deprecated `check` alias plus `ensureChecked`/`ensureUnchecked`), [`mirror-deep-dive.mjs`](../../scripts/task-tracker/verbs/mirror-deep-dive.mjs), [`evidence-markers.mjs`](../../scripts/task-tracker/verbs/evidence-markers.mjs), [`commit-trace.mjs`](../../scripts/task-tracker/verbs/commit-trace.mjs), [`inflate-estimate.mjs`](../../scripts/task-tracker/verbs/inflate-estimate.mjs), [`plan-estimate.mjs`](../../scripts/task-tracker/verbs/plan-estimate.mjs), [`report.mjs`](../../scripts/task-tracker/verbs/report.mjs)
- Other: [`config.mjs`](../../scripts/task-tracker/verbs/config.mjs), [`test.mjs`](../../scripts/task-tracker/verbs/test.mjs), [`help.mjs`](../../scripts/task-tracker/verbs/help.mjs) (aliased `?`). `move` is not a real verb — it is an unknown-verb redirect pointing the caller at `promote`/`demote`.

The full dispatch surface (every `case` label in `task-tracker.mjs`'s switch, sorted and de-duplicated) is:

`ac-stamp approve auto block board brainstorm cancel check chore-mode close commit-trace config decompose-check demote discover dod-stamp end ensureChecked ensureUnchecked epic-reconcile evidence-markers fleet help inflate-estimate kind log migrate mirror-deep-dive move new next park pause plan plan-approve plan-estimate promote pull-next reconcile refine reject report resume review save-draft save-plan split-plan start status stop story supersede test unblock update user-story words-count`

### Issue shape enforcement

| Script                                                                                       | Responsibility                                                                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`scripts/task-tracker/preflight-issue.mjs`](../../scripts/task-tracker/preflight-issue.mjs) | Validates issue body shape (DoD + Pickup Directive tail); rejects hand-rolled bodies                       |
| [`scripts/gh/create-issue.mjs`](../../scripts/gh/create-issue.mjs)                           | Single creation path; new issues default unassigned — only an explicit `--assignee <login>` assigns (#793) |

### Audit / timing

| Script                                                                                           | Responsibility                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [`scripts/task-tracker/gh-timing-comment.mjs`](../../scripts/task-tracker/gh-timing-comment.mjs) | Maintains the `⏱ Timing Log` comment on each issue |
| [`scripts/task-tracker/active-time.mjs`](../../scripts/task-tracker/active-time.mjs)             | Tracks engaged-hours / wall-clock split            |
| [`scripts/task-tracker/word-counter.mjs`](../../scripts/task-tracker/word-counter.mjs)           | Counts context words consumed per session          |
| [`scripts/task-tracker/measure-context.mjs`](../../scripts/task-tracker/measure-context.mjs)     | Measures conversation context for ROI reporting    |
| [`scripts/task-tracker/timing-rollup.mjs`](../../scripts/task-tracker/timing-rollup.mjs)         | Rolls session timing into parent-issue totals      |

### Guards / hooks

| Script                                                                                     | Responsibility                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| [`scripts/task-tracker/activity-guard.mjs`](../../scripts/task-tracker/activity-guard.mjs) | Blocks state advance when activity preconditions are missing  |
| [`scripts/task-tracker/agent-guard.mjs`](../../scripts/task-tracker/agent-guard.mjs)       | Enforces sub-agent dispatch rules (worktree, prompt contract) |
| [`scripts/task-tracker/bash-guard.mjs`](../../scripts/task-tracker/bash-guard.mjs)         | Intercepts risky `gh` calls the model might make directly     |
| [`scripts/task-tracker/hook-handler.mjs`](../../scripts/task-tracker/hook-handler.mjs)     | Handles PreCompact / PostCompact / SessionStart events        |
| [`scripts/task-tracker/close-gate.mjs`](../../scripts/task-tracker/close-gate.mjs)         | Rejects close on parent epic while any child remains open     |

### Coordination

| Script                                                                                           | Responsibility                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [`scripts/task-tracker/orchestrator-lock.mjs`](../../scripts/task-tracker/orchestrator-lock.mjs) | Cross-worktree lock so only one orchestrator runs an epic at a time |
| [`scripts/task-tracker/fleet-registry.mjs`](../../scripts/task-tracker/fleet-registry.mjs)       | Registers in-flight sub-agents per epic                             |
| [`scripts/task-tracker/queue.mjs`](../../scripts/task-tracker/queue.mjs)                         | Hook-event queue (drained on close + safety-net drain)              |

### Field / board sync

| Script                                                                                     | Responsibility                                                          |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [`scripts/task-tracker/project-fields.mjs`](../../scripts/task-tracker/project-fields.mjs) | Reads / writes Projects v2 custom fields                                |
| [`scripts/task-tracker/issue-field-db.mjs`](../../scripts/task-tracker/issue-field-db.mjs) | Local cache of issue/field state                                        |
| [`scripts/gh/set-priority.mjs`](../../scripts/gh/set-priority.mjs)                         | Single priority writer; supports `--cascade` for sub-issue trees        |
| [`scripts/gh/set-rank.mjs`](../../scripts/gh/set-rank.mjs)                                 | Single Rank writer; sets the wave-ordering number field on one issue    |
| [`scripts/gh/update-event-fields.mjs`](../../scripts/gh/update-event-fields.mjs)           | Stamps phase-event fields (start, plan-approved, …) on every transition |

## Properties this architecture gives you

### 1. Enforcement vs. instruction

A prose rule "always include `--assignee`" is forgettable; the model can drop it under context pressure and nothing notices. [`preflight-issue.mjs`](../../scripts/task-tracker/preflight-issue.mjs) and [`scripts/gh/create-issue.mjs`](../../scripts/gh/create-issue.mjs) _reject_ a missing `--assignee` at the script boundary. The rule is enforced by the only path through which issues can legally be created.

### 2. Single-mutator funneling

[`scripts/gh/move-state.mjs`](../../scripts/gh/move-state.mjs) is the **only** writer of the GitHub Projects `Status` field in this repo. Every verb that wants to change state delegates to it; verbs verify, `move-state` mutates. This means every transition runs through one auditable code path that stamps phase-event fields, appends a timing-log row, and validates the legal-transition table. There is exactly one place to add a new invariant and exactly one place to look when state goes wrong.

### 3. Compaction-resilience

Prose context is volatile under `/compact`, `/clear`, and long sessions — the model may forget specific rule wording. Scripts do not degrade. The `aitm-skill-version: X.Y.Z` marker in [`skill/SKILL.md`](../../skill/SKILL.md) and the `aitm-skill-loaded:<id>:<version>` sentinel pattern are an explicit acknowledgement of this asymmetry: when the sentinel is missing from context, reload the prose; the scripts never needed reloading because they were never in context to begin with.

### 4. Auditability

Every state transition produces:

- A row in the `⏱ Timing Log` comment on the issue ([`gh-timing-comment.mjs`](../../scripts/task-tracker/gh-timing-comment.mjs))
- Updated phase-event fields on the Projects board ([`update-event-fields.mjs`](../../scripts/gh/update-event-fields.mjs))
- An audit-correction comment when a human gate was auto-ticked (full-auto runs)

Pure-prompt skills leave no trail beyond the chat transcript. This repo's runs are reproducible from the issue's own history months later.

## Live-state as source of truth

A subtle property of this architecture: **GitHub Projects is the authoritative state; local tracker state is a cache.** The board can change without the model's knowledge — most commonly when a human drags an issue between columns in the GH UI to unstick the AI from a rule-corner. That is a legitimate escape hatch, not a misuse, and the system needs to absorb it gracefully rather than fight it.

The implication is that every verb that mutates state should reconcile cache → truth at entry, not just the binding entry points. Today only [`start.mjs`](../../scripts/task-tracker/verbs/start.mjs) and [`switch.mjs`](../../scripts/task-tracker/verbs/switch.mjs) call [`fetchLiveKanbanState`](../../scripts/gh/lib/live-state.mjs) and write the result back to local `state.state`. Other verbs read live state via `getBoardState` for precondition checks but do not persist the truth back, so the local cache silently drifts whenever a human moves an issue out-of-band.

The fix is a shared verb preflight that performs both the bind-mismatch check and the live-state write-back at every state-mutating verb's entry — making "live state is truth" a property of the verb layer rather than a property only of binding.

## Where the pattern leaks

The pattern is **script-backed + routed**, evolving toward **hook-enforced**. The prose still has to route the model to the scripts at the seams that have no hook coverage yet. Each leak the repo has actually seen has been patched; what follows is an honest accounting of which leaks are now closed and which are still open.

### Now hook-enforced (no longer leaks)

| Was-leak                                                                               | Now enforced by                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ad-hoc `Status` writes via raw `gh`                                                    | [`bash-guard.mjs:65-70`](../../scripts/task-tracker/bash-guard.mjs) blocks direct `move-state.{mjs,sh}` from Bash; internal callers use `execFile` to bypass              |
| Direct `gh issue create` hand-rolling                                                  | [`bash-guard.mjs:124-129`](../../scripts/task-tracker/bash-guard.mjs) blocks and routes through `create-issue.mjs` → `preflight-issue.mjs`                                |
| Direct `gh issue close` skipping DoD / timing flush                                    | [`bash-guard.mjs:133-138`](../../scripts/task-tracker/bash-guard.mjs) blocks and routes through `/task close`                                                             |
| `gh issue edit` reintroducing deprecated checkboxes / dropping verb-completion markers | `evaluateGhEdit` diff-based body guard via [`bash-guard.mjs:190-200`](../../scripts/task-tracker/bash-guard.mjs)                                                          |
| Parallel sub-agent dispatched without a worktree                                       | [`agent-guard.mjs`](../../scripts/task-tracker/agent-guard.mjs) requires orchestrator lock + `isolation:"worktree"`                                                       |
| Full-auto review without audit                                                         | `enforceFullAutoAudit` in [`human-reviewer-audit.mjs`](../../scripts/task-tracker/lib/human-reviewer-audit.mjs) atomically stamps marker + audit comment + lifecycle tick |

Dogfooding note: the repo's own development uses a `node_modules/ai-task-manager` symlink so the model can exercise scripts as they're built. A behavioral rule in memory keeps the model invoking via `scripts/`, not the symlink — this applies only to this repo's dogfooding workflow and is not present in deployed installations.

### Now closed (was "still open")

Both leaks below were addressed by a shared verb-preflight helper — [`scripts/task-tracker/lib/verb-preflight.mjs`](../../scripts/task-tracker/lib/verb-preflight.mjs) (#208, refactored in #218) — wired centrally into verb dispatch in [`task-tracker.mjs`](../../scripts/task-tracker/task-tracker.mjs), not per-verb:

| Was-leak                                            | Now enforced by                                                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bind-mismatch only enforced by `close.mjs`          | `runPreflight` in `verb-preflight.mjs` cross-checks `target` against `state.active` for every dispatched verb, not just `close`                                             |
| Manual GH-UI Status changes leave local state stale | `runPreflight` compares the issue body's `aitm-last-known-state` marker against live board state on every verb entry and prompts to reconcile on drift (kind: `human-move`) |

## When to choose this pattern

| Situation                                                                      | Pattern                                                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Workflow owns persistent external state (issue tracker, board, time logs)      | **Script-backed wins.** The state is the source of truth; scripts protect it across sessions. |
| Workflow is pure transformation (reformat code, summarize text, review a diff) | Pure-prompt is enough. No state to protect.                                                   |
| Workflow must be installable in arbitrary repos (npm package, plugin)          | Script-backed beats hook-enforced. Hooks couple to the host harness; scripts are portable.    |
| Workflow runs only inside one team's repo and Claude Code is the only client   | Consider promoting the most-violated leaks to harness hooks for bypass-proofing.              |
| Workflow needs to survive heavy compaction or long-running sessions            | Script-backed wins. Prose-only context will erode; scripts will not.                          |

## Future direction

The broader trajectory is continuing to promote the surviving behavioral routing into harness hooks where the leverage is high — the script layer stays canonical so the workflow remains portable across harnesses, with hooks as the Claude-Code-specific belt to go with the cross-harness suspenders.

See [`guides/settings-guide.md`](./settings-guide.md) for the existing recommended hook setup and [`docs/DESIGN.md`](../DESIGN.md) §"Hook Behavior" for the events already in play.
