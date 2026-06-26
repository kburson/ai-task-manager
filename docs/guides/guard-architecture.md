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
  'on-deck': { exit: [...], entry: [...] },
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
inventory table in `guard-registry.mjs` is a maintenance index that mirrors them.
To verify the table against reality:

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
3. Append a row to the inventory table in `guard-registry.mjs`.

The bootstrap picks it up automatically on next import — no registry edit needed.
