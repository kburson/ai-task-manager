# How AI Task Manager Keeps Agent Context Small and Rules Fresh

## Executive summary

AI Task Manager is built around a deliberately small agent skill surface. The
skill does not try to keep every workflow rule in the model's live context all
the time. Instead, it uses a tiered, just-in-time loader:

- **Tier 0:** a tiny installed shim that points at the real workflow.
- **Tier 1:** a router containing only universal rules and the verb-to-rule
  routing table.
- **Tier 2:** focused rule files that load only when a specific verb or
  situation needs them.

That structure is paired with a post-compaction boot contract. After a compact,
clear, or fresh worker start, the agent is told to reload the authoritative
source files from disk instead of trusting a compressed transcript summary.
This is the core hallucination-prevention design: summarized rules are treated
as hints, while source files, issue bodies, and task state artifacts remain the
source of truth.

The result is a skill that can enforce a detailed issue workflow without
turning every agent session into a giant prompt full of rarely-used process
text.

## Why this exists

The project started from a real context-bloat problem. GitHub issue
[#115](https://github.com/kburson/ai-task-manager/issues/115) records the
original carve: `skill/shared/SKILL.md` had grown to 937 lines, roughly 12,000
tokens, and was loaded eagerly on the first `/task` invocation. That meant a
session paid for plan-mode orchestration, parallel worktree rules, close gates,
config interview rules, and review rules even when it only needed one command.

The rewrite did not delete capability. It reshaped it. The detailed contracts
were moved out of the hot path and into verb-specific rule files.

Issue [#190](https://github.com/kburson/ai-task-manager/issues/190) then
addressed the second-order problem: compaction can preserve the story while
weakening the rules. A compacted summary may say "use `/task close`" but lose
the stronger operational rule "never call `gh issue close` directly." The fix
was a durable session boot index that says compacted summaries are not
authoritative and that Tier-1 files must be re-read from disk.

Issue [#191](https://github.com/kburson/ai-task-manager/issues/191) extended
the same idea to parallel agents: workers get a minimal boot pack plus a task
pack, not the orchestrator transcript. Workers reload foundational rules from
source and report back through a compact schema.

Issue [#130](https://github.com/kburson/ai-task-manager/issues/130) adds the
timing-lifecycle angle: pause, pre-compact flush, and post-compact resume are
treated as tracked lifecycle events, so long sessions remain auditable across
context management operations.

## The loading model

The canonical design is documented in `docs/DESIGN.md` under "Skill loading
model" and enforced by `scripts/tests/unit/task-tracker/core/skill-carve.test.mjs`.

### Tier 0: installed shim

`skill/SKILL.md` is the compatibility entrypoint. In an installed project, the
host-specific shim points at the shared router rather than embedding the full
workflow. It carries an `aitm-skill-version` marker so updates can force a
reload.

For Codex, `.agents/skills/task/SKILL.md` is intentionally tiny. It loads the
canonical adapter at `node_modules/ai-task-manager/skill/adapters/codex/SKILL.md`.

### Tier 1: router

`skill/shared/router.md` is the first real workflow file. It contains:

- hard cross-cutting rules that apply to all verbs,
- the CLI invocation contract,
- the `gh issue` command policy,
- the verb-to-rule-file routing table,
- the post-compact boot rule.

It does not include every detailed workflow. Its job is to decide what must be
loaded next.

### Tier 2: just-in-time rule files

`skill/shared/rules/*.md` files hold the detailed contracts. Examples:

- `bind.md` for `/task #N` and `/task resume #N`,
- `review.md` for `/task review`,
- `close.md` for `/task close`,
- `state-walk.md` for promote/demote/next/reconcile,
- `parallel.md` for multi-agent fan-out,
- `commit-trail.md` for first-commit and commit-trail troubleshooting.

The router says to load a Tier-2 file only when the corresponding verb is about
to run. If a session never does parallel fan-out, `parallel.md` stays out of the
context window.

## Sentinels and version markers

Each frequently-loaded skill file uses two related mechanisms:

- a source-file marker such as `<!-- aitm-skill-version: 1.1.0 -->`,
- a live-context sentinel such as `aitm-skill-loaded:router:1.1.0` or
  `aitm-skill-loaded:rules/close:<version>`.

The agent can compare the marker in the file with the sentinel already present
in the live conversation. If the matching sentinel exists, the file has already
been loaded in this session and can be skipped. If the sentinel is absent or
the version changed, the file is read again and a fresh sentinel is emitted.

This keeps repeated verbs from reloading the same prose while still allowing
`npm update ai-task-manager` to invalidate stale rules.

The important nuance from #190 is that compaction can make a sentinel unsafe.
A compacted transcript might preserve the text `aitm-skill-loaded:router:1.1.0`
without preserving the actual rule file. For that reason, the post-compact
recovery protocol explicitly says to discard prior sentinels and reload the
Tier-1 files from disk.

## Post-compact and fresh-session recovery

`templates/session-boot.md` is the source template for the installed
`.ai-task-manager/templates/session-boot.md`. It is the recovery contract for compact,
clear, and fresh sessions.

The boot index divides context into layers:

- **Tier 0, always live:** host and project instructions such as global and
  project `CLAUDE.md`.
- **Tier 1, required on bind:** `skill/shared/router.md`,
  `.ai-task-manager/templates/pickup-directive.md`,
  `.ai-task-manager/task-tracker.json`, and the active GitHub issue body.
- **Tier 2, JIT on verb:** the rule file selected by the router.

The recovery protocol says that after a compaction or clear banner, the agent
must:

1. Treat old `aitm-skill-loaded:*` sentinels as expired.
2. Re-read every Tier-1 file in order.
3. Re-emit fresh sentinels for reloaded skill files.
4. Emit an `aitm-boot-recovered:<session-id>:<timestamp>` sentinel so the
   reload does not loop every turn.

This is why the system is resilient after compaction. The compacted summary can
help the agent remember the story, but it is never allowed to replace the
authoritative workflow rules.

## Session state preserves working memory

Compaction is good at preserving narrative and bad at preserving operational
structure. AI Task Manager handles that separately with
`templates/session-state-template.md`, installed as
`.ai-task-manager/templates/session-state-template.md`.

The template defines nine fields:

- Goal
- Non-Negotiable Rules
- Active Files
- Decisions
- Plan
- Completed
- Remaining
- Verification
- Risks

The intended per-task state file lives under a gitignored session-tracking
path. After compaction or clear, the agent re-reads that structured state
instead of reconstructing the task from a lossy conversation summary.

This reduces aggregated mistakes because decisions, active files, verification
status, and remaining work are separated rather than blended into prose.

## GitHub issues as durable context

The active GitHub issue body is part of Tier 1 recovery. That matters because
AI Task Manager stores workflow state directly in issue bodies:

- acceptance criteria,
- verification commands,
- definition of done,
- pickup directives,
- deep-dive analysis,
- hidden lifecycle markers,
- task metadata in `aitm-fields`.

The issue body is not just a ticket. It is a durable, cloud-hosted recovery
artifact. If the agent loses local context, it can bind to the issue and reload
the current source of truth from GitHub.

The project also forbids direct issue-body and state shortcuts that would skip
this structure. The router and AGENTS instructions prohibit direct `gh issue
create`, direct `gh issue close`, and arbitrary `move-state.mjs <N> <state>`
jumps. This prevents cloud issue history from diverging from the workflow
state machine.

## Parallel agents without context multiplication

`docs/guides/worker-context-contract.md` applies the same context-management
principles to parallel execution.

Workers receive three packs:

- an orchestrator pack that remains private to the orchestrator,
- a worker boot pack that points at `.ai-task-manager/templates/session-boot.md`,
- a worker task pack with the bound issue, owned files, forbidden paths,
  verification target, stop conditions, and verb chain.

Workers do not inherit the orchestrator transcript. They do not receive copied
skill bodies or paraphrased process rules. Their first action is to reload the
boot index and bind to their issue. Their final report is a compact schema from
`templates/worker-report.md`.

This keeps fan-out from multiplying context bloat. N workers do not each carry
N copies of the orchestrator's history.

## Measurement and enforcement

The design is guarded by tests and a measurement script, not just convention.

`scripts/task-tracker/measure-context.mjs` estimates token load for named
scenarios. On the current Codex adapter, the measured values are:

| Scenario               | Budget | Measured | Headroom |
| ---------------------- | -----: | -------: | -------: |
| idle                   |  1,500 |      237 |    1,263 |
| invoked                |  8,000 |    3,431 |    4,569 |
| bind                   | 12,000 |    7,624 |    4,376 |
| bind + review + close  | 17,000 |   11,237 |    5,763 |
| parallel orchestration | 17,500 |   10,800 |    6,700 |

Those numbers show both sides of the design. The JIT loader dramatically cuts
the cold-start burden, and budgets have since been widened as new rule files
were added — regression tests still matter to keep headroom from silently
eroding as scenarios grow.

Relevant tests include:

- `skill-carve.test.mjs`, which checks the router/rule-file structure and
  sentinel requirements.
- `session-boot.test.mjs`, which checks that the boot index names required
  Tier-1 files and warns that summaries are not authoritative.
- `worker-context-contract.test.mjs`, which checks the parallel worker context
  contract and its cross-reference to the boot index.
- `regression-pause-compact.test.mjs`, which checks pause/compact/resume timing
  events interleave correctly with lifecycle rows.

## Why this reduces hallucinations and aggregated mistakes

The architecture reduces hallucinations by removing two common failure modes.

First, it avoids carrying irrelevant rules. A smaller active context gives the
model less stale or unrelated process text to over-weight. When a detailed rule
is needed, it is loaded near the moment of use.

Second, it refuses to let compressed memory become authority. After compaction,
the agent must reload rules, config, pickup directives, and the issue body from
source. That prevents a paraphrased summary from silently weakening hard rules
or preserving an obsolete interpretation.

The architecture reduces aggregated mistakes because work state is externalized
into durable artifacts:

- source files for rules,
- GitHub issues for task truth,
- session-state files for working memory,
- timing logs for lifecycle history,
- worker reports for integration facts.

The agent can forget and recover. That is the design goal.

## The core pattern

AI Task Manager's context-management pattern can be summarized as:

1. Keep always-loaded files tiny.
2. Put universal rules in a router.
3. Put detailed rules in single-purpose JIT files.
4. Use versioned sentinels to skip redundant reads within a live session.
5. Invalidate sentinels after compact, clear, or package update.
6. Reload source-of-truth files after any context reset.
7. Store task state in GitHub issues and structured local artifacts.
8. Keep parallel workers narrow and report-based.

The skill is not small because it has fewer rules. It is small in context
because it loads rules only when they become operationally relevant, and it
reloads them from source whenever the live transcript can no longer be trusted.
