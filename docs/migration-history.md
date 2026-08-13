# State Slug Migration History

## 2026: Assigned to Ready for Planning board cutover

The #1209 lifecycle design replaced the transient Assigned Status with the
durable Ready for Planning parking state. Assignment remains exclusive story
ownership rather than a lifecycle column. The live cutover is intentionally
separate from the repository vocabulary changes and runs through one dry-run by
default command:

```sh
node scripts/migrate/assigned-to-ready-for-plan.mjs
```

The immutable inventory names every repository-qualified issue, ProjectV2 item,
and assignee set while performing zero writes. After reviewing that evidence,
the authorized apply is:

```sh
node scripts/migrate/assigned-to-ready-for-plan.mjs --apply --yes
```

Apply preserves assignees while moving the inventoried items to Backlog, then
renames the same Status option ID to Ready for Planning, reorders the canonical
eight-state field, and cuts configuration over to
`kanbanOptionReadyForPlan`. A durable journal makes each verified phase
resumable. Assigned-work views use `has:assignee`; the Kanban Status board
exposes Ready for Planning. See
[Ready for Planning migration](guides/ready-for-planning-migration.md) for the
operator procedure and recovery contract.

## 2026: Assigned state vocabulary

AITM renamed the second lifecycle state from `On Deck` (`on-deck`) to
`Assigned` (`assigned`) without changing the eight-state topology or any gate:

`Backlog → Assigned → Refine → Plan → Develop → Test → Review → Done`

For one compatibility release, the raw move-state boundary accepts `on-deck`
as a deprecated alias and the config loader accepts `kanbanOptionOnDeck` as a
fallback for `kanbanOptionAssigned`. Config init/repair author only the new
key and remove the old key while preserving the option id. Historical
`aitm-entered-on-deck` markers and `on-deck:started` Timing Log rows remain
readable audit data; new writers emit only the Assigned spellings.

The GitHub Project schema is never changed implicitly. Preview the in-place
Status option rename with:

```sh
node scripts/migrate/rename-on-deck-to-assigned.mjs
```

After the implementation is integrated, apply it explicitly with:

```sh
node scripts/migrate/rename-on-deck-to-assigned.mjs --apply
```

The command preserves the existing Status option id and therefore every
project item's Status assignment. Assignee/state coupling is not part of this
migration; it is tracked separately in issue #1207.

## Historical: 4-state → 7-state Kanban migration

The following reference records the earlier 4-state → 7-state migration. It
is retained as historical provenance; the current topology is the eight-state
chain documented above.

### Canonical states at that migration boundary

```
backlog → refine → plan → develop → test → review → done
```

At that boundary, state slugs were the only recognized inputs and there was no
compatibility shim. Verbs and `move-state.mjs` rejected the prior slugs.

### Prior 4-state vocabulary (removed)

| Old slug      | New equivalent | Notes                                                                           |
| ------------- | -------------- | ------------------------------------------------------------------------------- |
| `groom`       | `refine`       | Refine performs JIT re-evaluation of Size / Estimate / Priority set at Backlog. |
| `analyze`     | `plan`         | Plan stage produces the Deep-Dive Analysis appendix and the plan-approval gate. |
| `in-progress` | `develop`      | Develop is the work-execution state.                                            |
| `r4r`         | `review`       | Review is the human-approval gate (renamed in #112 from R4R).                   |

`test` was a new state added between `develop` and `review` for verification.

### Verbs that changed name

| Old verb            | New verb                           | Notes                                          |
| ------------------- | ---------------------------------- | ---------------------------------------------- |
| `/task groom <N>`   | `/task promote <N>` (from Backlog) | Forward one state; gate fires at refine entry. |
| `/task analyze <N>` | `/task promote <N>` (from Refine)  | Forward one state; emits deep-dive appendix.   |
| `/task approve <N>` | `/task plan-approve <N>`           | Plan→Develop gate; idempotent marker.          |
| `/task r4r <N>`     | `/task review <N>`                 | Test→Review transition; renamed in #112.       |

The renamed verbs were not aliased; invoking an old name returned an
"unknown verb" error.

### Why that migration happened

The 4-state model conflated three concerns inside `groom`:

1. Triage (does this idea deserve to live?)
2. Sizing (Size, Estimate, Priority, Sequence)
3. JIT re-evaluation immediately before execution

The 7-state split moved triage to `backlog → refine` and pushed JIT
re-evaluation into `refine → plan`, so a sized + AC'd story could sit in Plan
without re-grooming on every pickup. See Epic #41 (closed) for the full
rationale.

### Related commits

- `ac6e49e` — rename R4R to Review throughout live source files (#112)
- `34156df` — forbid direct state-jump calls; require promote/demote (#111)
- `2ba58e2` — add plan-approve verb for Plan → Develop human gate (#122)
- `15271bc` — carve skill into JIT loader; router + Tier-2 rules (#115)
