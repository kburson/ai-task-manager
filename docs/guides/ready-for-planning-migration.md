# Ready for Planning Migration

Issue #1217 is the sole live-board mutation authority for the #1209 lifecycle
change. The command is read-only unless `--apply` is passed and uses a durable
journal visible from every linked worktree.

## Dry run

Run from a seeded checkout after the #1209 behavior stack is integrated:

```sh
node scripts/migrate/assigned-to-ready-for-plan.mjs
```

The command performs two exhaustive ProjectV2 scans and prints every current
Assigned item with repository identity, issue number, item ID, and complete
assignee set. It also prints the retained Status option ID and the canonical
target order. Missing or repeated cursors, count drift, duplicate identities,
incomplete assignees, transport failures, or a changing second scan fail closed
with zero writes.

## Apply

After the printed inventory is reviewed, run:

```sh
node scripts/migrate/assigned-to-ready-for-plan.mjs --apply --yes
```

Apply freezes governed lifecycle writes, moves only the frozen Assigned
inventory to Backlog, and preserves assignees case-insensitively. Each item is
read back before the existing option is renamed in place to Ready for Planning
and ordered after Refine. Configuration changes to
`kanbanOptionReadyForPlan` only after all item and Status-field post-conditions
are verified.

The durable journal records the immutable plan, per-item evidence, and the last
verified phase. Re-run the same apply command after an interrupted or
ambiguous response. A retry accepts only an exact landed postcondition; drift
or an unreadable surface remains blocked and reports the pending phase.

## Saved views

The live project should retain these query semantics:

- Assigned work: `is:issue has:assignee`
- Per owner: `is:issue assignee:<github-login>`
- Unowned backlog: `is:issue no:assignee status:Backlog`
- Refine WIP: `is:issue status:Refine`
- Ready queue: `is:issue status:"Ready for Planning"`

The migration verifies the existing `has:assignee` view and a Status-backed
Kanban view through GitHub read-back. If the view API is unavailable, an
operator may verify these filters explicitly and add `--views-verified` to the
same apply retry; that flag does not bypass any item, option, configuration, or
journal check.

## Completion evidence

Completion requires a `final-verification` journal, zero remaining Assigned
items, the canonical eight-state Status order, the same option ID now named
Ready for Planning, exact assignee preservation, canonical repository
configuration, and saved-view read-back. Historical lifecycle issue bytes and
timing evidence are compatibility history and are never rewritten.
