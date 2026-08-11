# AI Task Manager Documentation

This folder is organized into current public documentation, deeper operating guides, technical references, and archived implementation history.

Start here if you are adopting the package:

1. [Introduction](./introduction/README.md)
2. [Install and Setup](./introduction/install-and-setup.md)
3. [Core Workflow](./introduction/core-workflow.md)

## Current Documentation

| File                                                                                         | Why it matters                                                                                                                         |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [introduction/README.md](./introduction/README.md)                                           | Primary onboarding page for developers evaluating or adopting AI Task Manager. Includes the quickstart, positioning, and reading path. |
| [introduction/install-and-setup.md](./introduction/install-and-setup.md)                     | Practical setup guide covering prerequisites, GitHub CLI install/auth, package install, generated files, and verification.             |
| [introduction/core-workflow.md](./introduction/core-workflow.md)                             | Beginner-friendly explanation of the task loop, eight-state workflow, human gates, timing logs, and common commands.                   |
| [introduction/agentic-development-process.md](./introduction/agentic-development-process.md) | Explains how specs become backlogs, how epics fan out to workers, and how Pickup Directives make issues restartable.                   |
| [introduction/measurement-and-roi.md](./introduction/measurement-and-roi.md)                 | Explains estimates, actuals, context-word accounting, engaged hours, and value reporting.                                              |
| [introduction/adoption-guide.md](./introduction/adoption-guide.md)                           | Gives rollout guidance for solo developers, small teams, and organizations.                                                            |
| [QUICKSTART.md](./QUICKSTART.md)                                                             | Compatibility pointer for older links; redirects readers to the introduction docs.                                                     |

## Guides

| File                                                             | Why it matters                                                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [guides/architecture.md](./guides/architecture.md)               | The script-backed-skill pattern — why this repo pairs a thin prose skill with a robust Node CLI surface, with a spectrum against other Claude skills. |
| [guides/workflow.md](./guides/workflow.md)                       | Detailed GitHub Issues and Kanban workflow reference for teams already using the tool.                                                                |
| [guides/ai-value-framework.md](./guides/ai-value-framework.md)   | Financial and measurement methodology behind estimates, engaged hours, cost comparisons, and reports.                                                 |
| [guides/settings-guide.md](./guides/settings-guide.md)           | Claude Code and Codex-adjacent settings that make the task workflow smoother.                                                                         |
| [guides/parallel-agents.md](./guides/parallel-agents.md)         | Rules for parallel agent dispatch, worktree isolation, state gates, and postmortems.                                                                  |
| [guides/migrations.md](./guides/migrations.md)                   | Current migration helper notes for issue comments and field encoding maintenance.                                                                     |
| [guides/migration-7-state.md](./guides/migration-7-state.md)     | Historical runbook for migrating still-older GitHub Projects boards onto the former seven-state workflow.                                             |
| [guides/postmortem-template.md](./guides/postmortem-template.md) | Template for documenting process failures and guardrail fixes.                                                                                        |

## Technical Reference

| File                     | Why it matters                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| [DESIGN.md](./DESIGN.md) | Architecture reference for task tracking, config, state files, timing comments, hooks, fleet registry, and orchestration. |

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

When in doubt, prefer the current docs and guides above. Archive files may contain obsolete package names, old config paths, or superseded Kanban state vocabulary.
