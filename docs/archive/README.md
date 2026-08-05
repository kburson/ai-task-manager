# Documentation Archive

This archive preserves historical design notes, implementation plans, and Superpowers-generated planning artifacts.

These files are useful for understanding why the project changed, but they are not current operating instructions. Expect archived files to contain old package names, old `.claude/` paths, retired Kanban vocabulary, and implementation details that have since moved.

Use [../README.md](../README.md) for the current documentation table of contents.

## Root Plans

| File                                                                                                   | Why it is retained                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [root-plans/master-plan.md](./root-plans/master-plan.md)                                               | Original migration plan from Claude-only task manager to shared `ai-task-manager` package.                       |
| [root-plans/implementation-plan.md](./root-plans/implementation-plan.md)                               | Early npm packaging plan; useful for understanding initial extraction assumptions.                               |
| [root-plans/aitm-backlog-test-master-plan.md](./root-plans/aitm-backlog-test-master-plan.md)           | Large backlog validation plan used to harden package, install, orchestration, reporting, and Codex metrics work. |
| [root-plans/task-lifecycle-master-plan.md](./root-plans/task-lifecycle-master-plan.md)                 | Historical task lifecycle design before the current eight-state vocabulary settled.                              |
| [root-plans/codex-engagement-metrics-task-plan.md](./root-plans/codex-engagement-metrics-task-plan.md) | Planning record for Codex engagement and context measurement work.                                               |
| [root-plans/custom-project-fields-plan.md](./root-plans/custom-project-fields-plan.md)                 | Early project-field customization plan; kept for field schema evolution context.                                 |
| [root-plans/issue-field-db-migration-plan.md](./root-plans/issue-field-db-migration-plan.md)           | Planning record for portable issue field storage and migration mechanics.                                        |
| [root-plans/refactor-gh-scripts-plan.md](./root-plans/refactor-gh-scripts-plan.md)                     | Historical plan for GitHub script refactoring.                                                                   |
| [root-plans/notes.md](./root-plans/notes.md)                                                           | Small scratch note retained for traceability.                                                                    |
| [root-plans/CLAUDE.md](./root-plans/CLAUDE.md)                                                         | Historical local Claude instruction snippet, not current project guidance.                                       |

## Dated Plans

| File                                                                                                         | Why it is retained                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [plans/dated/2026-05-10-parallel-agent-guardrails.md](./plans/dated/2026-05-10-parallel-agent-guardrails.md) | Design record for guardrails around worktrees, state transitions, activity policy, and parallel agents.     |
| [plans/dated/2026-05-10-three-stage-estimation.md](./plans/dated/2026-05-10-three-stage-estimation.md)       | Design record for moving estimate mutation earlier and preserving review-time deltas as retrospective data. |

## Superpowers History

| File                                                                                                                                                     | Why it is retained                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [superpowers/history/specs/2026-04-27-plan-mode-backlog-creation-design.md](./superpowers/history/specs/2026-04-27-plan-mode-backlog-creation-design.md) | Original design spec for plan-mode backlog creation.                               |
| [superpowers/history/plans/2026-04-25-report-filters.md](./superpowers/history/plans/2026-04-25-report-filters.md)                                       | Historical implementation plan for value-report filters.                           |
| [superpowers/history/plans/2026-04-25-scripts-in-node-modules.md](./superpowers/history/plans/2026-04-25-scripts-in-node-modules.md)                     | Historical implementation plan for resolving scripts from `node_modules`.          |
| [superpowers/history/plans/2026-04-27-plan-mode-backlog-creation.md](./superpowers/history/plans/2026-04-27-plan-mode-backlog-creation.md)               | Historical implementation plan for generating epics and sub-issues from plan mode. |
| [superpowers/history/plans/2026-05-06-init-guard.md](./superpowers/history/plans/2026-05-06-init-guard.md)                                               | Historical implementation plan for initialization guardrails.                      |
| [superpowers/history/plans/2026-05-07-project-tether.md](./superpowers/history/plans/2026-05-07-project-tether.md)                                       | Historical implementation plan for ProjectV2 tethering and verification.           |
| [superpowers/history/plans/2026-05-07-r4r-state.md](./superpowers/history/plans/2026-05-07-r4r-state.md)                                                 | Historical plan for the retired R4R vocabulary; useful only as migration context.  |

## Retired Guides

| File                                                                             | Why it is retained                                                                                                                            |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [retired-guides/migration-7-state.md](./retired-guides/migration-7-state.md)     | Dead runbook whose target scripts (`migrate-to-7-state.mjs`, `rename-status-2026-05.mjs`) have since been deleted; retained for the `Groom`/`Analyze`/`R4R` → current-vocab mapping table. |
