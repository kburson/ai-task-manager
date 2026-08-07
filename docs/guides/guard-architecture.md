# Guard Architecture

> **This guard system is fully wired and fires on every state transition.**
> Do not read any source comment as implying the guards are inert, skeletal, or
> bypassable. If you find such a comment, it is stale — fix it (see #552).

This is the single authoritative map of how kanban-state guards are registered
and executed. It covers the registry, the bootstrap, the per-state adapter
modules, the `runGuards` call site, and the exit/entry slot model.

## The flow at a glance

```
states/*.mjs                 state-bootstrap.mjs              guard-registry.mjs
(per-state declarations)  →  (registerGuard for each)     →  GUARDS[state].{exit,entry}
                                                                      │
                                                                      ▼
move-state.mjs / promote.mjs / close.mjs / review.mjs  ──calls──►  runGuards(from, to, ctx)
                                                                      │
                                              iterate GUARDS[from].exit, then GUARDS[to].entry
                                                                      │
                                                          aggregate refusals → allow / block
```

## Components

### 1. The registry — `scripts/task-tracker/lib/guard-registry.mjs`

Holds a flat `GUARDS` map keyed by state name, each with an `exit` array and an
`entry` array:

```js
GUARDS = {
  backlog: { exit: [...], entry: [...] },
  'assigned': { exit: [...], entry: [...] },
  refine:  { exit: [...], entry: [...] },
  // … plan, develop, test, review, done
}
```

- `registerGuard(state, kind, guard)` — idempotent on `guard.id`; re-registering
  the same id is a no-op (returns `false`). Unknown state or kind throws.
- `runGuards(from, to, ctx)` — **async**. Iterates `GUARDS[from].exit` then
  `GUARDS[to].entry`, awaiting each `guard.run(ctx)`. Refusals are aggregated
  across both lists (no short-circuit), so a single transition surfaces every
  reason it was blocked. A guard that _throws_ is treated as a refusal whose
  `reason` is the stringified error — one buggy guard cannot crash the pipeline.

A guard is `{ id, run(ctx) -> { ok: true } | { ok: false, reason } | Promise<…> }`.
`run` may be sync or async; `runGuards` awaits either way, so guards that shell
out to `git`/`gh` coexist with pure-data guards.

The module ships with an **empty** registry on import. Nothing self-registers;
callers must bootstrap first.

### 2. The bootstrap — `scripts/task-tracker/lib/state-bootstrap.mjs` (#292)

`bootstrapGuards()` walks `STATES` (from `states/index.mjs`) once and feeds the
registry from each state's declared `exitGuards` / `entryGuards` lists. It is
idempotent (guarded by a `booted` flag plus `registerGuard`'s id-dedup), so
re-importing is safe. `__resetBootstrap()` exists only as a test affordance.

`guard-bootstrap.mjs` is preserved as a **deprecation shim** that re-exports
`bootstrapGuards` from here; legacy imports keep working.

### 3. The per-state adapters — `scripts/task-tracker/states/*.mjs`

Each kanban state owns a module exporting `{ entryGuards, exitGuards, onEnter }`.
These declarations are the **source of truth** for what each state enforces; the
inventory table in `guard-registry.mjs` is a maintenance index that is meant to
mirror them, but a maintenance index can drift — it has, more than once (see
[Guard inventory](#guard-inventory) below). To verify any table against
reality, always re-run:

```sh
grep -E "^import |entryGuards|exitGuards" scripts/task-tracker/states/*.mjs
```

### 4. The call sites — where `runGuards` actually fires

| Caller                                   | Role                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `scripts/gh/move-state.mjs` (~line 345)  | the single state-mutator; every Status write passes through `runGuards` |
| `scripts/task-tracker/verbs/promote.mjs` | forward transitions                                                     |
| `scripts/task-tracker/verbs/close.mjs`   | review → done close gates                                               |
| `scripts/task-tracker/verbs/review.mjs`  | review-stage scan                                                       |

Each imports the bootstrap (directly or transitively) before invoking
`runGuards`. **There is no transition path that skips the registry.**

## Guard inventory

Derived directly from `entryGuards` / `exitGuards` in `scripts/task-tracker/states/*.mjs`
(the per-state adapters — §3 above), in guard-execution order per state/slot.
Regenerate by re-running the `grep` in §3 and cross-checking each state module;
do not hand-edit this table without re-verifying against the source.

> **Relocation note:** `refine-entry-fields-priority` and
> `backlog-exit-child-parent-refine-or-plan` are named after `backlog`, but both
> were relocated from `backlog.exit` to `on-deck.exit` in #433 — each guard
> module's header comment documents the move. `backlog.exit` itself only runs
> `blocked-by-not-done` and `discuss-unresolved`.

| State   | Slot  | Guard ID                                        | What it checks                                                           |
| ------- | ----- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| backlog | entry | `contiguity-entry`                              | Board Status matches the recorded lifecycle state                        |
| backlog | exit  | `blocked-by-not-done`                           | No open `aitm-blocked-by` blocker issue                                  |
| backlog | exit  | `discuss-unresolved`                            | No unresolved `{discuss}` token in the body                              |
| on-deck | entry | `contiguity-entry`                              | Board Status matches the recorded lifecycle state                        |
| on-deck | exit  | `blocked-by-not-done`                           | No open `aitm-blocked-by` blocker issue                                  |
| on-deck | exit  | `refine-entry-fields-priority`                  | Priority field is set (relocated from `backlog.exit`, #433)              |
| on-deck | exit  | `backlog-exit-child-parent-refine-or-plan`      | Child's parent epic has reached refine/plan+ (relocated, #433)           |
| on-deck | exit  | `child-cannot-lead-epic-exit`                   | An epic issue cannot be the one making this transition alone             |
| on-deck | exit  | `user-story-warn`                               | Warns (non-blocking) if `## User Story` is missing/placeholder           |
| on-deck | exit  | `discuss-unresolved`                            | No unresolved `{discuss}` token                                          |
| refine  | entry | `contiguity-entry`                              | Board Status matches the recorded lifecycle state                        |
| refine  | exit  | `refine-exit-complete-marker`                   | `aitm-refine-complete` marker present                                    |
| refine  | exit  | `refine-exit-stub-placeholder`                  | Stub `_TBD_` AC placeholder has been replaced                            |
| refine  | exit  | `blocked-by-not-done`                           | No open `aitm-blocked-by` blocker issue                                  |
| refine  | exit  | `plan-entry-fields-body`                        | Size / Estimate / Priority / AC items / rationale present                |
| refine  | exit  | `plan-entry-fields-board`                       | Rank / Labels / Start time set; AC-command lint passes                   |
| refine  | exit  | `refine-exit-wip-budget`                        | Epic WIP budget not exceeded                                             |
| refine  | exit  | `refine-exit-child-parent-developing-or-beyond` | Parent epic has reached develop or beyond                                |
| refine  | exit  | `child-cannot-lead-epic-exit`                   | An epic issue cannot lead this transition alone                          |
| refine  | exit  | `user-story-block`                              | `## User Story` present and not a placeholder (hard block)               |
| plan    | entry | `contiguity-entry`                              | Board Status matches the recorded lifecycle state                        |
| plan    | exit  | `blocked-by-not-done`                           | No open `aitm-blocked-by` blocker issue                                  |
| plan    | exit  | `plan-exit-plan-approved`                       | `aitm-plan-approved` marker present                                      |
| plan    | exit  | `plan-exit-planned-estimate`                    | `### Planned Estimate` appendix present on the refine-estimate comment   |
| plan    | exit  | `plan-exit-deep-dive`                           | Deep-dive markers/section + ticked Pickup Directive present              |
| plan    | exit  | `plan-exit-plan-metadata`                       | `## Plan Metadata` has at least one substantive flat field               |
| plan    | exit  | `plan-exit-vc-presence`                         | `## Verification Commands` section present                               |
| plan    | exit  | `plan-exit-decomposition`                       | XL/high-hour issues carry a decomposition plan or waiver                 |
| plan    | exit  | `plan-exit-epic-children-refine-or-beyond`      | Epic's children are at refine or beyond                                  |
| plan    | exit  | `child-cannot-lead-epic-exit`                   | An epic issue cannot lead this transition alone                          |
| develop | entry | `contiguity-entry`                              | Board Status matches the recorded lifecycle state                        |
| develop | exit  | `blocked-by-not-done`                           | No open `aitm-blocked-by` blocker issue                                  |
| develop | exit  | `develop-exit-code-complete`                    | Functional ACs ticked/verified, `aitm-commits` populated, no dirty files |
| develop | exit  | `develop-exit-sandbox-proof`                    | `aitm-dod-verified` sandbox-proof marker present                         |
| develop | exit  | `develop-exit-commit-trail-head`                | `aitm-commits` marker contains the current outer-HEAD SHA                |
| develop | exit  | `develop-exit-epic-children-done`               | Epic's children are at review or beyond                                  |
| develop | exit  | `child-cannot-lead-epic-exit`                   | An epic issue cannot lead this transition alone                          |
| test    | entry | `contiguity-entry`                              | Board Status matches the recorded lifecycle state                        |
| test    | entry | `body-gates-entry-test`                         | Structural body-gate checks for entering test                            |
| test    | exit  | `blocked-by-not-done`                           | No open `aitm-blocked-by` blocker issue                                  |
| test    | exit  | `test-exit-dod-verified`                        | `aitm-dod-verified` marker present                                       |
| test    | exit  | `test-exit-pre-close-completeness`              | No unticked non-lifecycle, non-close-owned checkboxes                    |
| test    | exit  | `child-cannot-lead-epic-exit`                   | An epic issue cannot lead this transition alone                          |
| review  | entry | `contiguity-entry`                              | Board Status matches the recorded lifecycle state                        |
| review  | entry | `body-gates-entry-review`                       | Structural body-gate checks for entering review                          |
| review  | exit  | `blocked-by-not-done`                           | No open `aitm-blocked-by` blocker issue                                  |
| review  | exit  | `review-exit-review-approved`                   | `aitm-review-approved` marker present                                    |
| review  | exit  | `review-exit-epic-children-done`                | Epic's children are done                                                 |
| review  | exit  | `review-exit-epic-child-disposition`            | Epic child disposition recorded                                          |
| review  | exit  | `review-exit-close-gates`                       | Chain-integrity, commits-on-trunk, issue-dirty, marker-present bundle    |
| review  | exit  | `child-cannot-lead-epic-exit`                   | An epic issue cannot lead this transition alone                          |
| done    | entry | `body-gates-entry-done`                         | Structural body-gate checks for entering done                            |
| done    | exit  | _(none)_                                        | Terminal state — no exit guards                                          |

## The exit/entry slot model

A transition `from → to` runs two ordered slot lists:

1. **`GUARDS[from].exit`** — "may this issue leave `from`?" Exit guards enforce
   completeness of the state being left (e.g. `develop-exit-code-complete`,
   `develop-exit-sandbox-proof`, `refine-exit-complete-marker`).
2. **`GUARDS[to].entry`** — "may this issue enter `to`?" Entry guards enforce
   preconditions of the state being entered (e.g. `contiguity`, `body-gates`).

Both lists run; refusals from either are aggregated into one result. `done` has
no exit guards (terminal state). Four cross-cutting families — `contiguity`,
`child-cannot-lead-epic`, `body-gates`, and the `refine-complete` marker exit
gate — are exercised across many transition paths.

## Registering a new guard

1. Implement `{ id, run(ctx) }` in a `*-guard.mjs` module under `lib/`.
2. Add it to the matching state's `entryGuards` or `exitGuards` in
   `states/<state>.mjs`.
3. Append a row to the inventory table in `guard-registry.mjs` **and** to the
   [Guard inventory](#guard-inventory) table above in this doc — both are
   maintenance indexes over the same `states/*.mjs` source of truth and drift
   independently if only one is updated.

The bootstrap picks it up automatically on next import — no registry edit needed.
