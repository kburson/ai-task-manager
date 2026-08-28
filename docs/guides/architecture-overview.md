# Architecture / Runtime-Contract Overview

> The single orientation map for this package. Read this first if you are a new
> human or AI contributor: it explains how the `/task` skill loads, how `npx aitm`
> routes a command to its implementation, how the kanban state machine and its
> guards enforce the workflow, and **which paths are runtime contract versus
> dev/test/support material**. It is a hub that points at the load-bearing code,
> not a restatement of it.

For the narrative rationale — why this package takes the script-backed-skill
approach and where it sits on the spectrum of Claude-skill architectures — see
[architecture.md](architecture.md). That doc covers the same command-dispatch
and state-machine ground as §2–3 below at a higher level; this file is the
terse, code-pointing version.

## 1. Skill loading — the three-tier model

The skill is delivered to a Claude session in tiers, loaded lazily so a session
pays for only what it uses. Each tier file carries an `aitm-skill-version` marker
and emits an `aitm-skill-loaded:<id>:<version>` sentinel on first read, so a
re-invocation in the same conversation can skip a file already in context. After
`/compact` or `/clear` the sentinels vanish and the files reload automatically;
after `npm update` the marker version changes and reload is forced.

- **Tier-0 — adapter (`skill/adapters/claude/SKILL.md`).** The provider-specific
  entry the `task` skill loads. Establishes the canonical script paths and points
  at the shared router. Always loaded.
- **Tier-1 — router (`skill/shared/router.md`).** Carries only the hard
  cross-cutting rules and a verb → rule-file routing table. Emits
  `aitm-skill-loaded:router:<version>`. After a compact/clear it re-runs the
  `.ai-task-manager/templates/session-boot.md` boot index before any verb.
- **Tier-2 — rule files (`skill/shared/rules/*.md`).** Detailed per-verb
  contracts (`bind`, `close`, `state-walk`, `functional-dod`, `parallel`, …),
  each loaded just-in-time when its verb runs and emitting its own sentinel.

Verbs not in the routing table (e.g. `/task`, `/task plan`, `/task resume`,
`/task pause`, `/task check`, `/task config`) need no Tier-2 file — the session
invokes the CLI and prints its output.

## 2. Command dispatch — `npx aitm <command>`

`bin/aitm.mjs` is the single public entry point: neither the human nor the AI
should ever invoke a support script by its
`node_modules/ai-task-manager/**/*.mjs` filepath (the symlinked package path
silently no-ops). Routing (per `bin/aitm-registry.mjs`):

- `<command>` is a `/task` verb → delegate to `task-tracker.mjs <command> <args>`.
- `<command>` is an exposed script → spawn that script with `<args>`.
- otherwise → error listing the available command names.

Delegation is `child_process` with inherited stdio and a pass-through exit code,
so behavior is byte-identical to invoking the target directly. `aitm <command>
help` forwards the help token to the target, which self-documents.

`bin/cli.mjs` (`ai-task-manager`) is the separate installer/lifecycle CLI
(`install`, `init`, `statusline`, `version`); `aitm` is the daily driver.

## 3. The state machine and its guards

Work moves through eight kanban states —
`backlog → assigned → refine → plan → develop → test → review → done` — and the
column on the GitHub Projects board is the source of truth for state.

- **Single state-mutator.** Only `scripts/gh/move-state.mjs` writes the Status
  field. Verbs (`promote`, `close`, `review`, …) verify-then-delegate; they never
  write Status directly. This centralizes entry-marker stamping so every
  transition is audited.
- **Guard registry.** `scripts/task-tracker/lib/guard-registry.mjs` holds a
  state-keyed `exit`/`entry` guard map and the async `runGuards(from, to, ctx)`
  executor. `state-bootstrap.mjs` walks the per-state adapter modules under
  `scripts/task-tracker/states/*.mjs` and registers each declared guard.
  `runGuards` fires on **every** transition from `move-state.mjs`, `promote.mjs`,
  `close.mjs`, and `review.mjs`. There is no transition path that skips the
  registry. See [guard-architecture.md](guard-architecture.md) for the full map.
- **Issue-body mutator.** Every issue-body write flows through
  `mutateIssueBody({issueNumber, repo, mutate})`
  (`scripts/task-tracker/lib/issue-body-mutate.mjs`), which fetches the live body
  and writes it in one transaction and throws `MarkerLossError` if an invariant
  marker would disappear. Hand-rolled `gh issue edit --body` writes are refused
  by the PreToolUse Bash guard.

### Delivery authority and incident reconciliation

Delivery authority is keyed by the immutable **accepted SHA**, not by a mutable
branch name. The resolver selects an **exact accepted-head** pull request and
distinguishes three operational cases: an open current-head pull request emits a
provider action; an already-merged current-head pull request recovers a
`current-head` receipt with no action; and an advanced-head prior intent recovers
a `historical-recovery` receipt with no action. Intent, receipt, Test, review,
approval, and close records retain exact identities so a reused branch cannot
transfer authority between stories.

Approval provenance is independently re-read at close. Explicit human approval
binds to the accepted SHA; Full-Auto standing policy is revalidated from the same
live session/project source used by the delivery resolver. This authorization
runs before any close mutation. A completed transaction makes an already-closed
retry read-only, while a durable partial transaction can recover only after fresh
receipt verification.

Provider adapters own **timestamp normalization** at their boundary. The core
then applies **strict core parsing** to the normalized timestamp and rejects
malformed or impossible evidence rather than repairing it implicitly.

Incident convergence has a separate authority path: an immutable ledger ID and
canonical digest must receive explicit human approval. The incident ledger is
observation and authorization, never delivery evidence. Issue-local outcome
records use read-after-write **record readback**, and the phase-aware verifier
runs blocker/dependency, authority, and **reconciliation** checks in `pre-close`
and terminal modes.

## 4. Runtime-contract vs support classification

Each major path is labelled below. **runtime-contract** = ships in the published
package and is load-bearing at a user's runtime; **support** = development, test,
or maintenance material that must not ship (enforced by the package-boundary test
from #551).

| Path                                                                                  | Classification                          |
| ------------------------------------------------------------------------------------- | --------------------------------------- |
| `bin/aitm.mjs`, `bin/cli.mjs`, `bin/aitm-registry.mjs`                                | runtime-contract                        |
| `scripts/gh/move-state.mjs` (single state-mutator)                                    | runtime-contract                        |
| `scripts/task-tracker/verbs/*.mjs` (verb implementations)                             | runtime-contract                        |
| `scripts/task-tracker/lib/guard-registry.mjs`, `state-bootstrap.mjs`, `states/*.mjs`  | runtime-contract                        |
| `scripts/task-tracker/lib/issue-body-mutate.mjs`, `body-invariants.mjs`               | runtime-contract                        |
| `skill/adapters/claude/SKILL.md`, `skill/shared/router.md`, `skill/shared/rules/*.md` | runtime-contract                        |
| `scripts/reports/generate-value-report.mjs`                                           | runtime-contract                        |
| `scripts/tests/**`, `**/*.test.mjs`                                                   | support (never packed)                  |
| `scripts/maintenance/**`                                                              | support (never packed)                  |
| `docs/**` (this file included)                                                        | support (guidance, not shipped runtime) |

The literal token **runtime-contract** is used as the greppable label so this
classification can be machine-checked and cannot silently drift.
