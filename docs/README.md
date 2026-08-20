# AI Task Manager Documentation

This folder is organized into current public documentation, deeper operating guides, technical references, and archived implementation history.

Start here if you are adopting the package:

1. [Introduction](./introduction/README.md)
2. [Install and Setup](./introduction/install-and-setup.md)
3. [Core Workflow](./introduction/core-workflow.md)

## Current Documentation

| File                                                                                                             | Why it matters                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [introduction/README.md](./introduction/README.md)                                                               | Primary onboarding page for developers evaluating or adopting AI Task Manager. Includes the quickstart, positioning, and reading path. |
| [introduction/install-and-setup.md](./introduction/install-and-setup.md)                                         | Practical setup guide covering prerequisites, GitHub CLI install/auth, package install, generated files, and verification.             |
| [introduction/core-workflow.md](./introduction/core-workflow.md)                                                 | Beginner-friendly explanation of the task loop, eight-state workflow, human gates, timing logs, and common commands.                   |
| [introduction/agentic-development-process.md](./introduction/agentic-development-process.md)                     | Explains how specs become backlogs, how epics fan out to workers, and how Pickup Directives make issues restartable.                   |
| [introduction/measurement-and-roi.md](./introduction/measurement-and-roi.md)                                     | Explains estimates, actuals, context-word accounting, engaged hours, and value reporting.                                              |
| [introduction/adoption-guide.md](./introduction/adoption-guide.md)                                               | Gives rollout guidance for solo developers, small teams, and organizations.                                                            |
| [introduction/bus-factor-executive-brief.md](./introduction/bus-factor-executive-brief.md)                       | Executive-facing brief on the bus-factor problem AI Task Manager addresses.                                                            |
| [introduction/context-management-skill-architecture.md](./introduction/context-management-skill-architecture.md) | Explains the context-word budget contract, adapter measurement, and how skill prompts stay lean.                                       |
| [QUICKSTART.md](./QUICKSTART.md)                                                                                 | Compatibility pointer for older links; redirects readers to the introduction docs.                                                     |

## Guides

| File                                                                                       | Why it matters                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [guides/architecture.md](./guides/architecture.md)                                         | The script-backed-skill pattern — why this repo pairs a thin prose skill with a robust Node CLI surface, with a spectrum against other Claude skills.                  |
| [guides/workflow.md](./guides/workflow.md)                                                 | Detailed GitHub Issues and Kanban workflow reference for teams already using the tool.                                                                                 |
| [guides/ai-value-framework.md](./guides/ai-value-framework.md)                             | Financial and measurement methodology behind estimates, engaged hours, cost comparisons, and reports.                                                                  |
| [guides/settings-guide.md](./guides/settings-guide.md)                                     | Claude Code and Codex-adjacent settings that make the task workflow smoother.                                                                                          |
| [guides/parallel-agents.md](./guides/parallel-agents.md)                                   | Rules for parallel agent dispatch, worktree isolation, state gates, and postmortems.                                                                                   |
| [guides/migrations.md](./guides/migrations.md)                                             | Current migration helper notes for issue comments and field encoding maintenance.                                                                                      |
| [guides/postmortem-template.md](./guides/postmortem-template.md)                           | Template for documenting process failures and guardrail fixes.                                                                                                         |
| [guides/architecture-overview.md](./guides/architecture-overview.md)                       | Single orientation map: how the `/task` skill loads, how `npx aitm` routes commands, and how the state machine and guards fit together.                                |
| [guides/local-parallel-development.md](./guides/local-parallel-development.md)             | Running an epic's children in isolated worktrees while integrating results on a persistent inline branch.                                                              |
| [guides/worker-context-contract.md](./guides/worker-context-contract.md)                   | How parallel sub-agents are briefed, what they keep private, and what they report back.                                                                                |
| [guides/cloud-development-environments.md](./guides/cloud-development-environments.md)     | Checked-in setup scripts so Codex, Claude, Codespaces, or another hosted worker can bootstrap after cloning.                                                           |
| [guides/codex-local-worktree-environment.md](./guides/codex-local-worktree-environment.md) | Configuring the reusable local Codex desktop environment for this repo.                                                                                                |
| [guides/codex-support-matrix.md](./guides/codex-support-matrix.md)                         | Which AITM features Codex agents receive at prompt level versus hook-enforced level.                                                                                   |
| [guides/codex-unattended-token-burn.md](./guides/codex-unattended-token-burn.md)           | Cut Codex Desktop token burn on long unattended runs: config.toml defaults, composer slash commands, new chat windows, JSONL measurement. Do not drop High on defects. |
| [guides/grok-provider.md](./guides/grok-provider.md)                                       | Installing and trusting the Grok adapter, native hooks, required session identity, and transcript behavior.                                                            |
| [guides/compat-retirement-ledger.md](./guides/compat-retirement-ledger.md)                 | Ledger of deprecated markers, compatibility shims, and legacy verb aliases, each with an explicit retirement trigger.                                                  |
| [guides/discuss-trigger.md](./guides/discuss-trigger.md)                                   | Authoritative semantics for the `{discuss}` pre-refine brainstorming trigger.                                                                                          |
| [guides/entrypoint-guard.md](./guides/entrypoint-guard.md)                                 | The entry-point-check contract required by any script that writes GitHub issue bodies/comments.                                                                        |
| [guides/fabrication-guard-trust-boundary.md](./guides/fabrication-guard-trust-boundary.md) | Decision record on where the fabrication guard's trust boundary sits.                                                                                                  |
| [guides/fail-open-policy.md](./guides/fail-open-policy.md)                                 | The single reference for how each kind of failure must behave — fail-open vs fail-closed — across the package.                                                         |
| [guides/guard-architecture.md](./guides/guard-architecture.md)                             | How the state-transition guard registry is wired and fires on every move.                                                                                              |
| [guides/sub-issue-nesting.md](./guides/sub-issue-nesting.md)                               | How multi-level GitHub sub-issue chains interact with the task-tracker's gates.                                                                                        |
| [guides/characterization-harness.md](./guides/characterization-harness.md)                 | Characterization-test harness protecting the state-machine orchestrators during refactors.                                                                             |
| [guides/test-authoring.md](./guides/test-authoring.md)                                     | Conventions for slow/integration tests that shim `gh`/`git` and invoke a verb end-to-end.                                                                              |
| [guides/test-lane-taxonomy.md](./guides/test-lane-taxonomy.md)                             | The contract assigning every test file to exactly one execution lane.                                                                                                  |

## Technical Reference

| File                                                                                                     | Why it matters                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DESIGN.md](./DESIGN.md)                                                                                 | Architecture reference for task tracking, config, state files, timing comments, hooks, fleet registry, and orchestration.                                                                                                                                                                             |
| [decisions/0001-test-tree-convention.md](./decisions/0001-test-tree-convention.md)                       | ADR establishing the canonical `scripts/tests/<lane>/<source-relative-subtree>/` convention.                                                                                                                                                                                                          |
| [decisions/0002-github-native-authority-records.md](./decisions/0002-github-native-authority-records.md) | ADR for the pivot away from a hosted SQLite/PostgreSQL authority API toward GitHub Issues/comments as the sole durable authority.                                                                                                                                                                     |
| [architecture/state-machine.md](./architecture/state-machine.md)                                         | Kanban states as first-class objects — guard/action containers, the registry, and the migration roadmap.                                                                                                                                                                                              |
| [architecture/body-markers.md](./architecture/body-markers.md)                                           | The hidden HTML-comment marker contract that makes issue bodies machine-readable.                                                                                                                                                                                                                     |
| [architecture/body-writes.md](./architecture/body-writes.md)                                             | Why every issue-body write must flow through `mutateIssueBody` and how marker-loss protection works.                                                                                                                                                                                                  |
| [architecture/lifecycle-dod.md](./architecture/lifecycle-dod.md)                                         | The canonical Definition-of-Done lifecycle label set and gate sequencing.                                                                                                                                                                                                                             |
| [plans/](./plans/)                                                                                       | Tracked `/task discover` → `/task new` plan artifacts: finalized plans at `YYYYMMDD-<slug>.md` and in-progress brainstorm drafts at `.drafts/<slug>.md` (`lib/plan-file.mjs`, `lib/draft-file.mjs`). Distinct from `superpowers/plans/` below, which is Superpowers' own spec-to-plan authoring flow. |
| [superpowers/plans/](./superpowers/plans/) and [superpowers/specs/](./superpowers/specs/)                | Living, audit-artifact-contract planning/spec docs — the active authoring location for per-story design work (distinct from `archive/superpowers/history/`).                                                                                                                                          |
| [ai-memory/](./ai-memory/)                                                                               | Living index of durable auto-memory policy and seed-set tooling (`DELIVERY.md`, `EXCLUDED.md`), excluding its own `archive/` subfolder.                                                                                                                                                               |

## Visual Assets

| File                                                                                   | Why it matters                                                         |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [introduction/assets/aitm-system-map.png](./introduction/assets/aitm-system-map.png)   | Raster overview of the package operating model.                        |
| [introduction/assets/agentic-workflow.png](./introduction/assets/agentic-workflow.png) | Raster overview of spec-to-backlog-to-worker flow.                     |
| [introduction/assets/measurement-loop.png](./introduction/assets/measurement-loop.png) | Raster overview of estimate, session, context, and ROI reporting flow. |

## Archive

Archived docs live under [archive/](./archive/). They are retained for project history and implementation context, not as current user guidance.

| Folder                                                         | Why it matters                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [archive/root-plans/](./archive/root-plans/)                   | Early migration, packaging, backlog, lifecycle, and field-design plans that predate the current public docs. |
| [archive/plans/dated/](./archive/plans/dated/)                 | Dated implementation plans for specific guardrail and estimation work.                                       |
| [archive/superpowers/history/](./archive/superpowers/history/) | Historical Superpowers-generated plans/specs retained as implementation record.                              |
| [archive/retired-guides/](./archive/retired-guides/)           | Guides retired because their referenced scripts were deleted after the work they described shipped.          |

When in doubt, prefer the current docs and guides above. Archive files may contain obsolete package names, old config paths, or superseded Kanban state vocabulary.
