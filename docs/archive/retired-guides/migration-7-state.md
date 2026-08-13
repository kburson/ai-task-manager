# Migration: 6-state → 7-state Kanban (retired)

> **Status: retired.** This runbook targets `scripts/migrate/migrate-to-7-state.mjs`
> and `scripts/migrate/rename-status-2026-05.mjs`, both one-shot scripts that have
> since been deleted after the repo's own board migration completed. The kanban
> model has also moved on since this was written — the current model is
> 8-state, with `Ready for Planning` between `Refine` and `Plan`.
> Retained for historical context on the `Groom`/`Analyze`/`R4R` → current-vocab
> mapping, not as a runnable procedure.

Runbook for upgrading a downstream project board from older Status vocabulary
onto the canonical 7-state model (`Backlog / Refine / Plan / Develop / Test /
Review / Done`).

This repo's own board was migrated in place by
[`scripts/migrate/rename-status-2026-05.mjs`](../../scripts/migrate/rename-status-2026-05.mjs)
which renamed Status option _labels_ without touching IDs. That script is the
right tool **only** when you control the same ProjectV2 instance and option
IDs. Downstream projects with separate boards must remap items by option ID —
that is what `migrate-to-7-state.mjs` does.

## Decision tree

- Board still shows `Ready / In Progress / In Review` columns → run
  `rename-status-2026-05.mjs` first to bring the labels onto the 7-state
  vocabulary, then run the migration script below as a no-op verification.
- Board already shows `Groom / Analyze / Development / Validate / Review`
  columns but in-flight items still report old option names →
  run `migrate-to-7-state.mjs --dry-run`, review the plan, then `--apply`.
- Board is already on the 7-state vocabulary and items are correctly
  bound → `migrate-to-7-state.mjs --dry-run` reports `0 items to migrate`.

## Mapping table

| Source label (legacy) | Target label (current)               |
| --------------------- | ------------------------------------ |
| `Backlog`             | `Backlog` (no-op)                    |
| `Ready`               | `Refine`                             |
| `Groom`               | `Refine`                             |
| `Analyze`             | `Plan`                               |
| `In Progress`         | `Develop`                            |
| `Development`         | `Develop`                            |
| `Validate`            | `Test`                               |
| `In Review`           | `Review`                             |
| `R4R`                 | `Review` (deprecated alias collapse) |
| `Done`                | `Done` (no-op)                       |

`Plan` and `Test` may be empty immediately after a migration from older
boards. Operators curate which items advance into those gates manually.

## Pre-flight

1. `gh auth status` — confirm authenticated and have `repo` + `project` scopes.
2. `gh project list --owner <owner>` — confirm target project exists.
3. Snapshot current board state for rollback:

   ```
   gh api graphql -f query='query{ node(id:"<projectId>"){ ... on ProjectV2 { items(first:100){ nodes { id fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } } content{ ... on Issue { number } } } } } } }' > ./.tmp/inspect/board-snapshot.json
   ```

4. Confirm `.ai-task-manager/task-tracker.json` has `projectId` and
   `kanbanFieldId`.

## Dry run

```
node scripts/migrate/migrate-to-7-state.mjs --dry-run
```

Default mode. Prints `Mode: DRY-RUN`, the resolved Status option set, and a
table of `(item #, title, from → to)` for every item that would move. No
writes. Re-runnable without effect.

Sane output for an already-migrated board:

```
0 items to migrate (board already on 7-state vocabulary).
```

If you see `Errors:` listing unknown source names, those items have a Status
value not in the mapping table. Triage before applying.

## Apply

```
node scripts/migrate/migrate-to-7-state.mjs --apply
```

Iterates the plan, writes Status with `updateProjectV2ItemFieldValue`, throttles
at 250 ms between mutations. Successful lines look like
`✓ #<n> → <new state>`. Re-running after a successful apply is idempotent and
reports `0 items to migrate`.

## Rollback

There is no `--reverse` flag in this release. To roll back:

1. Rename Status option labels back to the 6-state names by hand on the
   project (Settings → Status field) **or** run the rename script's reverse if
   one exists in your fork.
2. Restore item Status values from the snapshot taken in pre-flight (one
   `updateProjectV2ItemFieldValue` per row).

## Tests

`scripts/task-tracker/tests/migrate-to-7-state.test.mjs` covers the pure
mapping helper. Run via `npm test`.
