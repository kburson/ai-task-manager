# Project Workflow Compatibility Design

**Issue:** #1618

**Status:** Approved through explicit Full-Auto delivery authorization

## Problem

AITM owns the lifecycle transition from Backlog through Done. GitHub Project templates can enable built-in workflows that independently move an issue when a pull request is linked or merged, or close an issue when its project status reaches Done. Those actions can move or close a task before AITM has written delivery evidence, finalized timing, and completed issue-body housekeeping.

`ai-task-manager init` currently resolves the selected ProjectV2 node ID and immediately continues into project linking, template application, field discovery and mutation, configuration writing, and issue-template writing. It never inspects the selected project's workflows.

GitHub's ProjectV2 GraphQL API exposes a paginated `workflows` connection. Each workflow exposes `name`, `number`, and `enabled`. GitHub documents built-in workflows and notes that project templates copy configured workflows. AITM can therefore diagnose incompatible configuration without attempting unsupported or surprising workflow mutation.

## Goals

- Inspect all workflows for every selected or newly created ProjectV2.
- Refuse initialization before project mutation when an enabled workflow can take ownership of AITM task state or closure.
- Name every incompatible workflow and explain how to disable it.
- Fail closed when the workflow inventory cannot be proved complete.
- Keep policy testable outside the interactive Bash installer.

## Non-goals

- Disable or edit GitHub Project workflows automatically.
- Inspect repository-level automatic issue-closing settings.
- Change PR creation, merge, delivery-receipt, or close behavior.
- Treat unknown future workflow names as incompatible without evidence.
- Refactor unrelated portions of the large init script.

## Incompatible workflow policy

The following enabled built-in workflows are incompatible:

- `Auto-close issue` can close an issue from a project status change.
- `Pull request linked to issue` can move an issue when a PR relationship is created.
- `Pull request merged` can move project lifecycle state from a PR merge event.

Comparison trims surrounding whitespace and compares case-insensitively. Diagnostics preserve the API's original workflow names. Disabled instances are compatible. Other enabled workflows remain compatible under this issue's narrow policy.

## Architecture

### Pure compatibility module

Create `scripts/task-tracker/lib/config-init/project-workflow-compatibility.mjs` with two responsibilities:

1. Validate and normalize one collected ProjectV2 workflow inventory.
2. Return a deterministic result containing all workflows and the enabled incompatible subset.

The module accepts JSON shaped as `{ workflows: [...], complete: true }`. It rejects missing arrays, non-boolean completeness, `complete !== true`, malformed workflow entries, or duplicate workflow numbers with conflicting data. Exact duplicates are collapsed. Its exported result is JSON-serializable and stable-sorted by workflow number then name.

### Thin CLI adapter

Extend `scripts/task-tracker/config-init.mjs` with `inspect-workflows`. It reads JSON from `PROJECT_WORKFLOWS_RAW`, invokes the pure module, and prints the result as compact JSON. Invalid input prints `config-init inspect-workflows: compatibility could not be verified: <reason>` and exits non-zero.

### Bash orchestration

After `PROJECT_NODE_ID` is known, `scripts/gh/init-project-config.sh` will:

1. Query `node(id:) { ... on ProjectV2 { workflows(first: 100, after:) { nodes { name number enabled } pageInfo { hasNextPage endCursor } } } }`.
2. Validate each page with `jq`, append nodes, and continue while `hasNextPage` is true.
3. Refuse an empty/malformed response, missing cursor on a continuing page, repeated cursor, or any `gh` failure.
4. Pass `{ workflows, complete: true }` to `config-init inspect-workflows`.
5. If the incompatible subset is non-empty, print the project title/number, each exact workflow name, and instructions to open the project's Workflows page, disable the named workflows, and rerun init; then exit non-zero.

New-project creation will stop after resolving the node ID. Repository linking and `apply_project_template` move to a post-inspection finalization step. Existing unlinked projects likewise remain unlinked until inspection passes. This guarantees the compatibility read occurs before AITM mutates project or local configuration state.

## Error behavior

Compatibility is a safety precondition. Network errors, unauthorized workflow reads, malformed GraphQL data, incomplete pagination, and classifier errors all produce a concise non-zero refusal. The diagnostic distinguishes an incompatible verified inventory from an inventory that could not be verified.

No workflow setting is changed. The operator retains authority to disable workflows in GitHub and rerun the idempotent installer.

## Testing

The pure unit suite covers compatible and incompatible names, normalization, disabled workflows, deterministic ordering/deduplication, and malformed or incomplete input.

The shell-integration suite supplies a deterministic `gh` mock and covers:

- a compatible multi-page inventory that reaches field discovery;
- an incompatible enabled workflow that refuses before link/template/field/config/template writes;
- a disabled incompatible workflow that does not block;
- an API failure and malformed page that fail closed;
- a newly created project whose post-create mutations wait for compatibility.

Existing init characterization tests receive compatible workflow responses so their original assertions remain meaningful.

## References

- [GitHub ProjectV2 GraphQL workflow fields](https://docs.github.com/en/graphql/reference/projects#projectv2workflow)
- [GitHub built-in Project automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations)
- [GitHub auto-close issue workflow announcement](https://github.blog/changelog/2024-04-25-github-issues-projects-auto-close-issue-project-workflow/)
