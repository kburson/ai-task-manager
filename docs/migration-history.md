# State Slug Migration History

Reference for the 4-state → 7-state Kanban migration. Loaded on demand only.

## Current canonical states (post-migration)

```
backlog → refine → plan → develop → test → review → done
```

State slugs are the only recognized inputs — there is no compatibility shim. Verbs and `move-state.mjs` reject prior slugs.

## Prior 4-state vocabulary (removed)

| Old slug      | New equivalent | Notes                                                                           |
| ------------- | -------------- | ------------------------------------------------------------------------------- |
| `groom`       | `refine`       | Refine performs JIT re-evaluation of Size / Estimate / Priority set at Backlog. |
| `analyze`     | `plan`         | Plan stage produces the Deep-Dive Analysis appendix and the plan-approval gate. |
| `in-progress` | `develop`      | Develop is the work-execution state.                                            |
| `r4r`         | `review`       | Review is the human-approval gate (renamed in #112 from R4R).                   |

`test` is a new state added between `develop` and `review` for verification.

## Verbs that changed name

| Old verb            | New verb                           | Notes                                          |
| ------------------- | ---------------------------------- | ---------------------------------------------- |
| `/task groom <N>`   | `/task promote <N>` (from Backlog) | Forward one state; gate fires at refine entry. |
| `/task analyze <N>` | `/task promote <N>` (from Refine)  | Forward one state; emits deep-dive appendix.   |
| `/task approve <N>` | `/task plan-approve <N>`           | Plan→Develop gate; idempotent marker.          |
| `/task r4r <N>`     | `/task review <N>`                 | Test→Review transition; renamed in #112.       |

The renamed verbs are not aliased — invoking an old name returns an "unknown verb" error.

## Why the migration happened

The 4-state model conflated three concerns inside `groom`:

1. Triage (does this idea deserve to live?)
2. Sizing (Size, Estimate, Priority, Sequence)
3. JIT re-evaluation immediately before execution

The 7-state split moves triage to `backlog → refine` and pushes JIT re-evaluation into `refine → plan`, so a sized + AC'd story can sit in Plan without re-grooming on every pickup. See Epic #41 (closed) for the full rationale.

## Related commits

- `ac6e49e` — rename R4R to Review throughout live source files (#112)
- `34156df` — forbid direct state-jump calls; require promote/demote (#111)
- `2ba58e2` — add plan-approve verb for Plan → Develop human gate (#122)
- `15271bc` — carve skill into JIT loader; router + Tier-2 rules (#115)
